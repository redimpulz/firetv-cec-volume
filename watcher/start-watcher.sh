#!/usr/bin/env bash
# Install and start the watcher (volume-watcher.sh) on the Fire TV from a PC.
# This is an alternative to the app. Run it again after the Fire TV restarts.
#
#   FIRETV_IP=192.168.1.10 ./watcher/start-watcher.sh
#
# Requires developer mode with Connection Mode set to TCP/IP (see README).
# The first run shows a 4-digit PIN on the TV; type it here. The token is saved to watcher/.token.
set -euo pipefail

: "${FIRETV_IP:?Set FIRETV_IP to the Fire TV IP address}"
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
    -d '{"friendlyName":"Fire TV CEC Volume"}' "$API/v1/FireTV/pin/display"
  read -r -p "4-digit PIN shown on the TV: " pin
  token=$(curl -sk -m 5 -X POST -H "X-Api-Key: $API_KEY" -H 'Content-Type: application/json' \
    -d "{\"pin\":\"$pin\"}" "$API/v1/FireTV/pin/verify" | sed -n 's/.*"description":"\([^"]*\)".*/\1/p')
  if [ -z "$token" ] || [ "$token" = OK ]; then
    echo "Pairing failed" >&2
    exit 1
  fi
  echo "$token" > "$TOKEN_FILE"
fi

vega exec vda connect "$FIRETV_IP:5555"
vega exec vda push "$HERE/volume-watcher.sh" /tmp/volume-watcher.sh
vega exec vda push "$TOKEN_FILE" /tmp/volume-watcher.token
vega exec vda shell sh /tmp/volume-watcher.sh start
