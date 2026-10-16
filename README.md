# テレビ音量リモコン（Fire TV / Vega OS）

Fire TV のリモコンの音量ボタンで、HDMI-CEC 経由でテレビの音量を変える。リモコンの IR プリセットに無いテレビ向け。YouTube などを見ている最中でも効く。

Fire TV Stick 4K Select（Vega OS）で動作を確認した。開発者モードを使う個人用の仕組みで、ストアには出せない。

## 仕組み

Fire TV は、公式のスマホ用 Fire TV アプリ向けのリモコン API（`https://<Fire TV の IP>:8080`）を持っている。この API に音量キーを送ると、Fire TV が HDMI-CEC でテレビに転送する。

[watcher/volume-watcher.sh](watcher/volume-watcher.sh) を Fire TV の開発者用シェルで常駐させる。リモコンの音量ボタンが押されるとログに記録されるので、それを見てこの API に送る。

- API の仕様は非公開。[hms-firetv](https://github.com/hms-homelab/hms-firetv) の解析結果と実機での確認に従っている
- API はふだん止まっていて、`http://<IP>:8009/apps/FireTVRemote` に POST すると起きる。見張りは 30 秒ごとに API を叩いて起こしておく
- API を使うにはペアリングが要る。テレビに出る 4 桁の数字を入力すると、トークンを受け取れる

## 使い方

### 最初の 1 回

1. Fire TV の 設定 → マイ Fire TV → バージョン情報 で、端末名を 7 回押す。開発者オプション → Developer Mode で 6 桁のコードを出す
2. PC で `vega devmode login` → `vega devmode enable-device --code <6 桁>`（Fire TV が再起動する）
3. 開発者オプション → Connection Mode を TCP/IP にする。バージョン情報 → ネットワーク で IP アドレスを確かめる
4. Fire TV の 設定 → ディスプレイとサウンド → HDMI CEC 機器コントロール を ON にする

WSL で `vega devmode login` が「org.freedesktop.secrets」のエラーで落ちるときは、`sudo apt install -y gnome-keyring libsecret-tools` のあと `echo -n "" | gnome-keyring-daemon --unlock --replace --daemonize --components=secrets` を実行してからやり直す。

### 見張りを動かす（Fire TV を再起動するたびに）

```bash
FIRETV_IP=10.0.4.69 ./watcher/start-watcher.sh
```

初回はテレビに 4 桁の数字が出るので入力する。トークンは `watcher/.token` に保存され、2 回目からは聞かれない。PC は動かし始めるときだけ要り、そのあとは切り離してよい。

止めるときは `vega exec vda shell sh /tmp/volume-watcher.sh stop`。送った記録は Fire TV の `/tmp/volume-watcher.log` に残る。

## 画面から操作するアプリ

`src/` は、画面の ＋ / − と電源オフのボタンで操作する Fire TV アプリ。見張りとは別に、画面から操作したいときに使う。

画面は全画面の WebView で、Fire TV のリモコン API のページを開き、そこに画面を書き込んでいる（[src/App.tsx](src/App.tsx)、[src/page.ts](src/page.ts)）。API の証明書は自己署名で、ネイティブの `fetch` では検証に通らないため、こうしている。

```bash
. ~/vega/env
npm install
npm run build:app      # build/armv7-release/volumeremote_armv7.vpkg が Fire TV Stick 用
npx tsc --noEmit && npm run lint && npm test
vega device install-app --packagePath build/armv7-release/volumeremote_armv7.vpkg
vega device launch-app --appName com.redimpulz.volumeremote.main
```

初回のペアリングで数字を確定すると、Fire TV の画面が真っ黒のまま残る。戻るボタンでアプリに戻る。
