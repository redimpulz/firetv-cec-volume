# テレビ音量リモコン（Fire TV / Vega OS）

Fire TV のリモコンの音量ボタンで、HDMI-CEC 経由でテレビの音量を変える。リモコンの IR プリセットに無いテレビ向け。YouTube などを見ている最中でも効く。

Fire TV Stick 4K Select（Vega OS）で動作を確認した。開発者モードを使う個人用の仕組みで、ストアには出せない。

## 仕組み

- Fire TV は、公式のスマホ用 Fire TV アプリ向けのリモコン API（`https://<Fire TV の IP>:8080`）を持っている。この API に音量キーを送ると、Fire TV が HDMI-CEC でテレビに転送する
- 見張り（[watcher/volume-watcher.sh](watcher/volume-watcher.sh)）が Fire TV の開発者用シェルで常駐し、ログに記録されるリモコンの音量ボタンを見て、この API に送る
- アプリ（[app/](app/)）は、開発者モードのデバッグ用接続（127.0.0.1:5555）を使って見張りを置き、動かす。接続には C++ の部品（[adbshell/](adbshell/)）を使う。実行できるのは見張りの起動・確認とペアリングだけ

API の仕様は非公開で、[hms-firetv](https://github.com/hms-homelab/hms-firetv) の解析結果と実機での確認に従っている。

## 使い方

### 最初の 1 回

PC に Vega SDK（`vega` コマンド。`~/vega/env` を読み込む）を入れておく。

1. Fire TV の 設定 → マイ Fire TV → バージョン情報 で、端末名を 7 回押す。開発者オプション → Developer Mode で 6 桁のコードを出す
2. PC で `vega devmode login` → `vega devmode enable-device --code <6 桁>`（Fire TV が再起動する）
3. 開発者オプション → Connection Mode を TCP/IP にする。バージョン情報 → ネットワーク で IP アドレスを確かめ、`vega exec vda connect <IP>:5555` で繋ぐ
4. Fire TV の 設定 → ディスプレイとサウンド → HDMI CEC 機器コントロール を ON にする
5. アプリを入れる（下の「ビルド」）
6. アプリを開くと、テレビに 4 桁の数字が出る。アプリのテンキーで入力する（ペアリング。最初の 1 回だけ）

WSL で `vega devmode login` が「org.freedesktop.secrets」のエラーで落ちるときは、`sudo apt install -y gnome-keyring libsecret-tools` のあと `echo -n "" | gnome-keyring-daemon --unlock --replace --daemonize --components=secrets` を実行してからやり直す。

### Fire TV を再起動したら

アプリを 1 回開く。「見張りが動いています」と出たら、ホームボタンで戻ってよい。

Fire TV の電源をテレビの USB 端子から取っていると、テレビを消すたびに再起動する。付属の AC アダプタでコンセントから取ると、再起動は停電やソフト更新のときだけになる。

## ビルド

```bash
. ~/vega/env
(cd adbshell && npm install && npm run build)   # 見張りを書き換えたら、ここからやり直す
cd app && npm install && npm run build:app      # build/armv7-release/volumeremote_armv7.vpkg が Fire TV Stick 用
vega device install-app --packagePath build/armv7-release/volumeremote_armv7.vpkg
vega device launch-app --appName com.redimpulz.volumeremote.main
```

見張りは `adbshell` のビルドで C++ のヘッダに埋め込まれる（`npm run embed-watcher`）。

PC から直接動かすこともできる: `FIRETV_IP=<IP> ./watcher/start-watcher.sh`（初回はターミナルで 4 桁の数字を入力する）。

## 注意

開発者モードで接続方法が TCP/IP のあいだ、同じ LAN の機器なら誰でも認証なしで Fire TV のシェルに入れる。共用のネットワークでは、Fire TV をゲスト用ネットワークなどに分ける。

送った記録は Fire TV の `/tmp/volume-watcher.log` に残る。
