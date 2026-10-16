// watcher/volume-watcher.sh を C++ のヘッダに埋め込む。見張りを書き換えたら npm run embed-watcher を実行する
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../../watcher/volume-watcher.sh');
const out = path.join(__dirname, '../kepler/turbo-modules/generated/watcherScript.h');
const b64 = fs.readFileSync(src).toString('base64');

fs.writeFileSync(
  out,
  `// watcher/volume-watcher.sh を base64 にしたもの。scripts/embed-watcher.js が作る。手で書き換えない
#pragma once
constexpr const char* WATCHER_SCRIPT_BASE64 = "${b64}";
`,
);
console.log(`embedded ${src} (${b64.length} chars)`);
