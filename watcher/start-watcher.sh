#!/usr/bin/env bash
# PC から Fire TV に見張り（volume-watcher.sh）を入れて動かす。Fire TV を再起動したら、もう一度実行する。
#
#   FIRETV_IP=10.0.4.69 ./watcher/start-watcher.sh
#
# 前提: Fire TV が開発者モードで、接続方法が TCP/IP になっていること（README 参照）。
# 初回はテレビに 4 桁の数字が出るので、それを入力する。受け取ったトークンは watcher/.token に保存する。
set -euo pipefail

: "${FIRETV_IP:?FIRETV_IP に Fire TV の IP アドレスを入れてください}"
HERE=$(cd "$(dirname "$0")" && pwd)
TOKEN_FILE="$HERE/.token"
API="https://$FIRETV_IP:8080"
API_KEY=0987654321

# shellcheck disable=SC1091
. "$HOME/vega/env"

wake() {
  curl -s -m 5 -o /dev/null -X POST -d '' "http://$FIRETV_IP:8009/apps/FireTVRemote"
  sleep 1.5
}

if [ ! -s "$TOKEN_FILE" ]; then
  wake
  curl -sk -m 5 -o /dev/null -X POST -H "X-Api-Key: $API_KEY" -H 'Content-Type: application/json' \
    -d '{"friendlyName":"テレビ音量リモコン"}' "$API/v1/FireTV/pin/display"
  read -r -p "テレビに出た 4 桁の数字: " pin
  token=$(curl -sk -m 5 -X POST -H "X-Api-Key: $API_KEY" -H 'Content-Type: application/json' \
    -d "{\"pin\":\"$pin\"}" "$API/v1/FireTV/pin/verify" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')
  if [ -z "$token" ] || [ "$token" = OK ]; then
    echo "ペアリングに失敗しました" >&2
    exit 1
  fi
  echo "$token" > "$TOKEN_FILE"
fi

vega exec vda connect "$FIRETV_IP:5555"
vega exec vda push "$HERE/volume-watcher.sh" /tmp/volume-watcher.sh
vega exec vda push "$TOKEN_FILE" /tmp/volume-watcher.token
vega exec vda shell sh /tmp/volume-watcher.sh start
