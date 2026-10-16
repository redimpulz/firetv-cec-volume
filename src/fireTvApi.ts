// Fire TV 自身が LAN に公開しているリモコン用 API（通称 Lightning）のうち、RN 側で扱う部分。
// 公式のスマホ用 Fire TV アプリが使っているもので、音量キーを送ると Fire TV が HDMI-CEC でテレビに転送する。
// 仕様は非公開。https://github.com/hms-homelab/hms-firetv などの解析結果と、実機（Vega OS 2.0）で確かめたことに従っている。
//
// 実機で分かったこと:
// - API（https://<IP>:8080）はふだん止まっている。DIAL（127.0.0.1:8009）に POST すると約 1 秒で上がる
// - 起こしてから何も送らないと約 12 秒、最後に送ってから約 60 秒で止まる
// - 端末の中からでも 127.0.0.1:8080 には繋がらない（No route to host）。端末自身の LAN の IP なら繋がる
// - 証明書は自己署名で、ネイティブの fetch は検証で落ちる（CURL error 60）。API への要求は WebView のページから送る

const DIAL_APP_URL = 'http://127.0.0.1:8009/apps/FireTVRemote';
// DIAL の機器説明。Application-URL ヘッダに端末自身の LAN の IP が入っている
const DIAL_DD_URL = 'http://127.0.0.1:60000/dd.xml';
const API_PORT = 8080;
const TIMEOUT_MS = 5000;
// DIAL で起こしてから API が上がるまで
const WAKE_WAIT_MS = 1200;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchWithTimeout(
  url: string,
  init: Parameters<typeof fetch>[1] = {},
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {...init, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

/** 端末自身の LAN の IP から API の origin を作る */
export async function resolveOrigin(): Promise<string> {
  const res = await fetchWithTimeout(DIAL_DD_URL);
  const appUrl = res.headers.get('Application-URL') ?? '';
  const host = /^https?:\/\/([^/:]+)/.exec(appUrl)?.[1];
  if (!host) {
    throw new Error(`端末の IP が分かりません（Application-URL: ${appUrl}）`);
  }
  return `https://${host}:${API_PORT}`;
}

/** 止まっている API を DIAL で起こす */
export async function wake(): Promise<void> {
  await fetchWithTimeout(DIAL_APP_URL, {method: 'POST', body: ''});
  await sleep(WAKE_WAIT_MS);
}
