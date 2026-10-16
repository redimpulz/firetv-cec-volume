# firetv-cec-volume

[日本語](README.ja.md)

Control your TV's volume over HDMI-CEC with the Fire TV remote's volume buttons — even while watching YouTube or other apps. Useful when your TV is missing from the remote's IR presets.

Tested on Fire TV Stick 4K Select (Vega OS). This is a personal-use tool that relies on developer mode; it cannot be published on the Amazon Appstore.

> [!WARNING]
> This is an unofficial project and is not affiliated with or endorsed by Amazon. It relies on undocumented Fire TV behavior that may change or stop working with any software update. Use it at your own risk. The software is provided "as is", without warranty of any kind, and the authors accept no liability for any damage or loss arising from its use (see [LICENSE](LICENSE)).

## How it works

- The Fire TV exposes a remote-control API (`https://<Fire TV IP>:8080`) used by the official Fire TV mobile app. Volume keys sent to this API are forwarded to the TV over HDMI-CEC.
- A watcher ([watcher/volume-watcher.sh](watcher/volume-watcher.sh)) runs in the Fire TV's developer shell. It sees remote volume button presses in the system log and sends them to the API.
- The app ([app/](app/)) installs and starts the watcher through the developer-mode debug connection (127.0.0.1:5555), using a small C++ module ([adbshell/](adbshell/)). The module can only start and check the watcher and pair with the API.

The API is undocumented. This project follows the analysis in [hms-firetv](https://github.com/hms-homelab/hms-firetv) and testing on a real device.

## Setup

You need the Vega SDK (the `vega` command, loaded with `~/vega/env`) on your PC.

1. On the Fire TV, open Settings → My Fire TV → About and select the device name 7 times. Then open Developer Options → Developer Mode to show a 6-digit code.
2. On the PC, run `vega devmode login`, then `vega devmode enable-device --code <6-digit code>`. The Fire TV restarts.
3. Set Developer Options → Connection Mode to TCP/IP. Find the IP address under About → Network, and connect with `vega exec vda connect <IP>:5555`.
4. Turn on Settings → Display & Sounds → HDMI CEC Device Control.
5. Build and install the app (see [Build](#build)).
6. Open the app. A 4-digit PIN appears on the TV; enter it with the app's keypad. You only pair once.

## Usage

After the Fire TV restarts, open the app once. When it says the watcher is running, you can press Home.

If the Fire TV is powered from the TV's USB port, it restarts every time the TV turns off. Powering it from the wall with the included adapter avoids this.

## Build

```bash
. ~/vega/env
(cd adbshell && npm install && npm run build)   # rebuild this after changing the watcher
cd app && npm install && npm run build:app      # build/armv7-release/volumeremote_armv7.vpkg is for Fire TV Stick
vega device install-app --packagePath build/armv7-release/volumeremote_armv7.vpkg
vega device launch-app --appName com.redimpulz.volumeremote.main
```

The watcher is embedded into a C++ header when `adbshell` is built.

You can also start the watcher from a PC without the app: `FIRETV_IP=<IP> ./watcher/start-watcher.sh` (the first run asks for the PIN in the terminal).

## Security

While developer mode is on with Connection Mode set to TCP/IP, any device on the same LAN can open a shell on the Fire TV without authentication. On shared networks, put the Fire TV on a separate network such as a guest network, or turn developer mode off when you don't need it.

## Troubleshooting

- `vega devmode login` fails with "org.freedesktop.secrets" on WSL: run `sudo apt install -y gnome-keyring libsecret-tools`, then `echo -n "" | gnome-keyring-daemon --unlock --replace --daemonize --components=secrets`, and try again.
- The watcher logs each volume command it sends to `/tmp/volume-watcher.log` on the Fire TV.

## License

[MIT](LICENSE)
