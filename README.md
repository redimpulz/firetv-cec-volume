# テレビ音量リモコン（Fire TV / Vega OS）

Fire TV の画面から、テレビの音量と電源を操作するアプリ。リモコンの IR プリセットに無いテレビでも、HDMI-CEC が効けば使える。

## 仕組み

Fire TV は、公式のスマホ用 Fire TV アプリ向けのリモコン API（通称 Lightning、`https://<Fire TV>:8080`）を持っている。音量・電源のキーをこの API に送ると、Fire TV が HDMI-CEC でテレビに転送する。このアプリは同じ端末の中から `127.0.0.1:8080` にキーを送る。

- API は非公開。キー名などは [hms-firetv](https://github.com/hms-homelab/hms-firetv) の解析結果に従っている
- 証明書は自己署名。ネイティブの `fetch` で通らなければ、見えない WebView で `https://127.0.0.1:8080/` を開いて証明書エラーを許可し、そのページから同一 origin で送る（`src/webViewTransport.tsx`）
- 認証を求められたら、テレビに 4 桁の PIN を出させて入力してもらう。受け取ったトークンは AsyncStorage に保存する

Vega OS のシステム音量 API（`AudioManager`）は HDMI 出力では実機で `-8` を返して使えないと報告されている（[Qiita](https://qiita.com/R61/items/f9d502df66cc1e8b08a7)）ので使っていない。

## 使い方

1. アプリを開く。初回はテレビに 4 桁の数字が出るので、画面のテンキーで入力する（不要な端末ではそのまま使える）
2. `＋` `−` で音量（決定キー長押しで連続）、`消音`、`テレビの電源を切る`（2 回押し）

電源を入れるのは Fire TV リモコンの電源ボタンで足りる（Fire TV が起きると CEC でテレビも点く）。

Fire TV 側の設定 → ディスプレイとサウンド → HDMI CEC 機器コントロール を ON にしておく。

## 開発

```bash
. ~/vega/env
npm install
npm run build:app          # build/armv7-release/volumeremote_armv7.vpkg が Fire TV Stick 用
npx tsc --noEmit && npm run lint && npm test
```

### 実機に入れる

1. Fire TV の 設定 → マイ Fire TV → バージョン情報 で端末名を 7 回押す → 開発者オプション → Developer Mode で 6 桁のコードを出す
2. `vega devmode login` → `vega devmode enable-device --code <6 桁>`
3. `vega device install-app --packagePath build/armv7-release/volumeremote_armv7.vpkg`
4. `vega device launch-app --appName com.redimpulz.volumeremote.main`

ログは `vega device start-log-stream`（Release ビルドは `console.error` だけ出る）。

### 実機で最初に確かめること

アプリ右下の「設定・診断」→「接続を診断」で、`fetch` と WebView のどちらで API に届くかが出る。続けて `volume_up` などのボタンで、どのキーがテレビに届くかを一つずつ試せる。
