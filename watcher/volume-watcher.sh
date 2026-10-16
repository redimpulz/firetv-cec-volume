#!/bin/sh
# Watcher that runs inside the Fire TV (developer-mode shell).
# It notices remote volume button presses in the system log and sends them to the
# Fire TV's remote-control API, which forwards them to the TV over HDMI-CEC.
#
#   sh volume-watcher.sh start   # start in the background (replaces a running one)
#   sh volume-watcher.sh stop
#
# The client token goes in volume-watcher.token next to this script.
# Observed on a real device (Vega OS 2.0):
# - Regular apps stop receiving remote keys once they go to the background. The log records
#   keys from "Amazon Fire TV Remote" no matter which app is in front.
# - Sending through the API makes the Fire TV inject fake volume keys; the log order tells them apart.
# - The API is usually stopped and starts on a POST to DIAL. It stops ~60 s after the last request.

DIR=$(cd "$(dirname "$0")" && pwd)
LOG=/tmp/volume-watcher.log
PID_FILE=/tmp/volume-watcher.pid
API_KEY=0987654321
KEEP_ALIVE_SEC=30

# The watcher owns a process group (setsid). Stop the whole group.
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

# The device's own LAN IP (127.0.0.1:8080 is not reachable). Taken from DIAL's Application-URL.
lan_ip() {
  curl -s -m 3 -D - -o /dev/null http://127.0.0.1:60000/dd.xml |
    sed -n 's#^Application-URL: http://\([^:/]*\).*#\1#p' | tr -d '\r'
}

wake() {
  curl -s -m 3 -o /dev/null -X POST -d '' http://127.0.0.1:8009/apps/FireTVRemote
  sleep 1.2
}

# $1: GET|POST, $2: path. Prints the HTTP status.
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

# Keep the API awake so a button press takes effect right away.
(
  while true; do
    [ "$(call GET /v1/FireTV)" = 200 ] || wake
    sleep $KEEP_ALIVE_SEC
  done
) &

# When the journal fills up it rotates, and `loggingctl log -f` receives nothing afterwards.
# Something is logged every second, so restart loggingctl when the stream goes quiet.
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

# Pick up only volume keys that came from the physical remote. For each key press, inputd logs
# "Display Power Resource Acquired for Key Event [KEY_xxx]" once. A key from the remote is preceded
# by a raw-signal (EV_MSC) line; fake keys and keys re-injected by apps are preceded by a
# "key event injection" line.
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
