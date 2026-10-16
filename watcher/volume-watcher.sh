#!/bin/sh
# Fire TV の中（開発者モードのシェル）で動かす見張り。
# リモコンの音量ボタンが押されたらログで気づき、Fire TV のリモコン用 API に送る。
# Fire TV は API で受けた音量を HDMI-CEC でテレビに転送する。
#
#   sh volume-watcher.sh start   # 裏で動かし始める（動いていれば入れ替える）
#   sh volume-watcher.sh stop
#
# トークンは同じディレクトリの volume-watcher.token に置く（start-watcher.sh が用意する）。
# 実機（Vega OS 2.0）で分かったこと:
# - 普通のアプリは、裏に回るとリモコンのキーを受け取れない。ログには、手前のアプリに関係なく
#   「Amazon Fire TV Remote」から来たキーとして記録される
# - API で送ると Fire TV は偽の音量キーを作るが、ログの並びで見分けて拾わない
# - API はふだん止まっていて、DIAL に POST すると起きる。最後の要求から約 60 秒で止まる

DIR=$(cd "$(dirname "$0")" && pwd)
LOG=/tmp/volume-watcher.log
PID_FILE=/tmp/volume-watcher.pid
API_KEY=0987654321
KEEP_ALIVE_SEC=30

# 見張りは setsid で自分のプロセスグループを持つ。止めるときはグループごと止める
stop() {
  [ -s "$PID_FILE" ] && kill -TERM -"$(cat "$PID_FILE")" 2>/dev/null
  rm -f "$PID_FILE"
}

case "$1" in
  start)
    stop
    setsid nohup sh "$DIR/volume-watcher.sh" run > /dev/null 2>&1 < /dev/null &
    echo "started"
    exit 0 ;;
  stop)
    stop
    echo "stopped"
    exit 0 ;;
  run) ;;
  *) echo "usage: $0 start|stop"; exit 1 ;;
esac

echo $$ > "$PID_FILE"
TOKEN=$(cat "$DIR/volume-watcher.token")

log() { echo "$(date +%T) $*" >> "$LOG"; }

# 端末自身の LAN の IP（127.0.0.1:8080 には繋がらない）。DIAL の Application-URL から得る
lan_ip() {
  curl -s -m 3 -D - -o /dev/null http://127.0.0.1:60000/dd.xml |
    sed -n 's#^Application-URL: http://\([^:/]*\).*#\1#p' | tr -d '\r'
}

wake() {
  curl -s -m 3 -o /dev/null -X POST -d '' http://127.0.0.1:8009/apps/FireTVRemote
  sleep 1.2
}

# $1: GET|POST, $2: パス。HTTP ステータスを返す
call() {
  curl -sk -m 3 -o /dev/null -w '%{http_code}' -X "$1" \
    -H "X-Api-Key: $API_KEY" -H "X-Client-Token: $TOKEN" \
    "https://$(lan_ip):8080$2"
}

send() {
  code=$(call POST "/v1/FireTV?action=$1")
  if [ "$code" != 200 ]; then
    wake
    code=$(call POST "/v1/FireTV?action=$1")
  fi
  log "$1 $code"
}

log "start"

# API を起こしておき、ボタンを押してすぐ効くようにする
(
  while true; do
    [ "$(call GET /v1/FireTV)" = 200 ] || wake
    sleep $KEEP_ALIVE_SEC
  done
) &

# ログはいっぱいになると新しいファイルに切り替わり、loggingctl log -f にはそれ以降何も届かなくなる（実機で確認）。
# ふだんは毎秒何かしら書かれるので、届かなくなったら loggingctl を止めて読み直す
ALIVE=/tmp/volume-watcher.alive
STALE_SEC=5
(
  while true; do
    sleep 2
    age=$(( $(date +%s) - $(stat -c %Y "$ALIVE" 2>/dev/null || echo 0) ))
    if [ "$age" -gt $STALE_SEC ]; then
      log "log stalled ${age}s, restarting"
      pkill -P $$ -x loggingctl
      : > "$ALIVE"
    fi
  done
) &

# リモコン本体から来た音量キーだけを拾う。キーが押されると inputd が
# 「Display Power Resource Acquired for Key Event [KEY_xxx]」を押下 1 回につき 1 行書く。
# リモコン本体からのキーはその直前に生の信号（EV_MSC）の行があり、
# 偽のキーやアプリが流し直したキーは直前に「key event injection」の行がある（実機で確認）
while true; do
  : > "$ALIVE"
  from_remote=0
  loggingctl log -f 2>/dev/null | while IFS= read -r line; do
    : > "$ALIVE"
    case "$line" in
      *"not a key or switch type: EV_MSC"*) from_remote=1; continue ;;
      *"key event injection"*) from_remote=0; continue ;;
      *"Resource Acquired for Key Event ["*) ;;
      *) continue ;;
    esac
    if [ "$from_remote" = 1 ]; then
      case "$line" in
        *"[KEY_VOLUMEUP]"*) send volume_up & ;;
        *"[KEY_VOLUMEDOWN]"*) send volume_down & ;;
        *"[KEY_MUTE]"*) send mute & ;;
      esac
    fi
    from_remote=0
  done
  sleep 0.2
done
