// Fire TV の開発者モードのデバッグ用接続（adb 互換のプロトコル、127.0.0.1:5555）で、音量の見張りを動かす。
// 実機（Vega OS 2.0）ではこの接続に認証が無く、CNXN を送るとそのまま CNXN が返る。
// 実行するコマンドはここで組み立てる決まったものだけにし、JS から任意のコマンドは渡せないようにしている。
// プロトコル: https://android.googlesource.com/platform/packages/modules/adb/+/refs/heads/main/protocol.txt

#include "adbshell.h"
#include "generated/watcherScript.h"

#include <arpa/inet.h>
#include <netdb.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>

#include <cstdint>
#include <cstring>
#include <regex>
#include <stdexcept>
#include <string>
#include <thread>

using namespace com::amazon::kepler::turbomodule;

namespace {

constexpr uint32_t A_CNXN = 0x4e584e43;
constexpr uint32_t A_OPEN = 0x4e45504f;
constexpr uint32_t A_OKAY = 0x59414b4f;
constexpr uint32_t A_CLSE = 0x45534c43;
constexpr uint32_t A_WRTE = 0x45545257;
constexpr uint32_t A_AUTH = 0x48545541;
constexpr uint32_t A_VERSION = 0x01000001;
constexpr uint32_t MAX_PAYLOAD = 256 * 1024;
constexpr uint32_t LOCAL_ID = 1;
constexpr const char* HOST = "127.0.0.1";
constexpr int PORT = 5555;
constexpr int TIMEOUT_MS = 10000;

struct Message {
  uint32_t command;
  uint32_t arg0;
  uint32_t arg1;
  std::string data;
};

// 失敗したら閉じるためのソケットの持ち主
class Socket {
 public:
  explicit Socket(int fd) : fd_(fd) {}
  ~Socket() {
    if (fd_ >= 0) close(fd_);
  }
  int fd() const { return fd_; }

 private:
  int fd_;
};

void writeAll(int fd, const void* buf, size_t len) {
  auto* p = static_cast<const char*>(buf);
  while (len > 0) {
    ssize_t n = send(fd, p, len, MSG_NOSIGNAL);
    if (n <= 0) throw std::runtime_error("送信に失敗しました");
    p += n;
    len -= static_cast<size_t>(n);
  }
}

void readAll(int fd, void* buf, size_t len) {
  auto* p = static_cast<char*>(buf);
  while (len > 0) {
    ssize_t n = recv(fd, p, len, 0);
    if (n == 0) throw std::runtime_error("接続が切れました");
    if (n < 0) throw std::runtime_error("受信が時間切れになりました");
    p += n;
    len -= static_cast<size_t>(n);
  }
}

void sendMessage(int fd, uint32_t command, uint32_t arg0, uint32_t arg1, const std::string& data = "") {
  uint32_t checksum = 0;
  for (unsigned char c : data) checksum += c;
  uint32_t header[6] = {command, arg0, arg1, static_cast<uint32_t>(data.size()), checksum, command ^ 0xffffffff};
  writeAll(fd, header, sizeof(header));
  if (!data.empty()) writeAll(fd, data.data(), data.size());
}

Message readMessage(int fd) {
  uint32_t header[6];
  readAll(fd, header, sizeof(header));
  if (header[3] > MAX_PAYLOAD) throw std::runtime_error("応答が大きすぎます");
  Message m{header[0], header[1], header[2], std::string(header[3], '\0')};
  if (header[3] > 0) readAll(fd, m.data.data(), header[3]);
  return m;
}

int connectTo(const std::string& host, int port, int timeoutMs) {
  addrinfo hints{};
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;
  addrinfo* res = nullptr;
  if (getaddrinfo(host.c_str(), std::to_string(port).c_str(), &hints, &res) != 0 || !res) {
    throw std::runtime_error("接続先が分かりません: " + host);
  }
  int fd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
  if (fd < 0) {
    freeaddrinfo(res);
    throw std::runtime_error("ソケットを作れません");
  }
  timeval tv{timeoutMs / 1000, (timeoutMs % 1000) * 1000};
  setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
  setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
  int rc = connect(fd, res->ai_addr, res->ai_addrlen);
  freeaddrinfo(res);
  if (rc != 0) {
    close(fd);
    throw std::runtime_error(std::string("繋がりません: ") + std::strerror(errno));
  }
  return fd;
}

std::string runShell(const std::string& host, int port, const std::string& command, int timeoutMs) {
  Socket sock(connectTo(host, port, timeoutMs));
  int fd = sock.fd();

  sendMessage(fd, A_CNXN, A_VERSION, MAX_PAYLOAD, std::string("host::\0", 7));
  Message m = readMessage(fd);
  if (m.command == A_AUTH) throw std::runtime_error("デバッグ用の接続に認証が求められました");
  if (m.command != A_CNXN) throw std::runtime_error("デバッグ用の接続に応答がありません");

  // shell_v2 で開く。ほかの方式（shell: や exec:）では、接続を閉じたときに裏で動かしたプログラムも止められる（実機で確認）
  sendMessage(fd, A_OPEN, LOCAL_ID, 0, "shell,v2,raw:" + command + std::string("\0", 1));
  // shell_v2 の出力は [種類 1 バイト][長さ 4 バイト][中身] の並び。種類 1 が標準出力
  std::string stream;
  std::string output;
  uint32_t remoteId = 0;
  while (true) {
    m = readMessage(fd);
    if (m.command == A_OKAY) {
      remoteId = m.arg0;
    } else if (m.command == A_WRTE) {
      remoteId = m.arg0;
      stream += m.data;
      sendMessage(fd, A_OKAY, LOCAL_ID, remoteId);
      while (stream.size() >= 5) {
        uint32_t len;
        std::memcpy(&len, stream.data() + 1, 4);
        if (stream.size() < 5 + len) break;
        if (stream[0] == 1) output += stream.substr(5, len);
        stream.erase(0, 5 + len);
      }
    } else if (m.command == A_CLSE) {
      sendMessage(fd, A_CLSE, LOCAL_ID, remoteId);
      return output;
    }
  }
}


std::string shell(const std::string& command) {
  return runShell(HOST, PORT, command, TIMEOUT_MS);
}

// リモコン用 API の手前で毎回やること: 端末自身の LAN の IP を調べ（127.0.0.1:8080 には繋がらない）、API を起こす
const std::string API_PREAMBLE =
    "IP=$(curl -s -m 3 -D - -o /dev/null http://127.0.0.1:60000/dd.xml"
    " | sed -n 's#^Application-URL: http://\\([^:/]*\\).*#\\1#p' | tr -d '\\r'); "
    "curl -s -m 3 -o /dev/null -X POST -d '' http://127.0.0.1:8009/apps/FireTVRemote; sleep 1.5; ";
const std::string API_HEADERS = "-H 'X-Api-Key: 0987654321' -H 'Content-Type: application/json' ";

bool isWatcherRunningImpl() {
  std::string out = shell(
      "P=$(cat /tmp/volume-watcher.pid 2>/dev/null) && kill -0 \"$P\" 2>/dev/null && echo running || echo stopped");
  return out.find("running") != std::string::npos;
}

void startWatcherImpl(const std::string& token) {
  if (!std::regex_match(token, std::regex("[A-Za-z0-9_-]{1,128}"))) {
    throw std::runtime_error("トークンの形式が正しくありません");
  }
  // 1 回のコマンドに載せられる長さに限りがあるので、分けて書き足す
  const std::string b64 = WATCHER_SCRIPT_BASE64;
  shell("rm -f /tmp/volume-watcher.b64");
  constexpr size_t CHUNK = 3000;
  for (size_t i = 0; i < b64.size(); i += CHUNK) {
    shell("printf '%s' '" + b64.substr(i, CHUNK) + "' >> /tmp/volume-watcher.b64");
  }
  std::string out = shell(
      "base64 -d /tmp/volume-watcher.b64 > /tmp/volume-watcher.sh && rm -f /tmp/volume-watcher.b64"
      " && printf '%s' '" + token + "' > /tmp/volume-watcher.token"
      " && sh /tmp/volume-watcher.sh start");
  if (out.find("started") == std::string::npos) {
    throw std::runtime_error("見張りを起動できませんでした: " + out);
  }
}

void requestPinImpl() {
  std::string out = shell(API_PREAMBLE + "curl -sk -m 5 -o /dev/null -w '%{http_code}' -X POST " + API_HEADERS +
                          "-d '{\"friendlyName\":\"テレビ音量リモコン\"}' https://$IP:8080/v1/FireTV/pin/display");
  if (out.find("200") == std::string::npos) {
    throw std::runtime_error("テレビに数字を出せませんでした（HTTP " + out + "）");
  }
}

std::string verifyPinImpl(const std::string& pin) {
  if (!std::regex_match(pin, std::regex("[0-9]{4}"))) {
    throw std::runtime_error("数字 4 桁を入力してください");
  }
  std::string out = shell(API_PREAMBLE + "curl -sk -m 5 -X POST " + API_HEADERS + "-d '{\"pin\":\"" + pin +
                          "\"}' https://$IP:8080/v1/FireTV/pin/verify");
  // 応答は {"description":"<トークン>"}。数字が違うと description が無いか OK になる
  std::smatch m;
  if (!std::regex_search(out, m, std::regex("\"description\":\"([A-Za-z0-9_-]+)\"")) || m[1] == "OK") {
    throw std::runtime_error("数字が違うようです");
  }
  // 数字を確定すると、Fire TV の数字の画面が真っ黒のまま手前に残る。少し待ってアプリを手前に呼び戻す
  shell("setsid nohup sh -c 'sleep 1.5; vlcm launch-app pkg://com.redimpulz.volumeremote.main'"
        " > /dev/null 2>&1 < /dev/null &");
  return m[1];
}

// 通信は待ち時間があるので、JS のスレッドを止めないよう別スレッドで行う
template <typename F>
Promise async(F&& work) {
  return Promise([work = std::forward<F>(work)](std::shared_ptr<Promise> promise) mutable {
    std::thread([promise, work = std::move(work)]() mutable {
      try {
        work(promise);
      } catch (const std::exception& e) {
        promise->reject(e.what());
      }
    }).detach();
  });
}

}  // namespace

namespace adbshellTurboModule {

adbshell::adbshell() {}
adbshell::~adbshell() noexcept {}

double adbshell::getMajorVersion() { return 1; }
double adbshell::getMinorVersion() { return 0; }
double adbshell::getPatchVersion() { return 0; }

Promise adbshell::isWatcherRunning() {
  return async([](auto promise) { promise->resolve(isWatcherRunningImpl()); });
}

Promise adbshell::startWatcher(std::string token) {
  return async([token](auto promise) {
    startWatcherImpl(token);
    promise->resolve();
  });
}

Promise adbshell::requestPin() {
  return async([](auto promise) {
    requestPinImpl();
    promise->resolve();
  });
}

Promise adbshell::verifyPin(std::string pin) {
  return async([pin](auto promise) { promise->resolve(verifyPinImpl(pin)); });
}

}  // namespace adbshellTurboModule
