// Fire TV 自身が LAN に公開しているリモコン用 API（通称 Lightning）のクライアント。
// 公式のスマホ用 Fire TV アプリが使っているもので、音量・電源のキーを送ると
// Fire TV が HDMI-CEC でテレビに転送する。アプリは同じ端末の中から 127.0.0.1 で叩く。
// 仕様は非公開。https://github.com/hms-homelab/hms-firetv などの解析結果に従っている。

import {ORIGIN, webViewTransport} from './webViewTransport';

// 全端末で共通の固定値
const API_KEY = '0987654321';
const TIMEOUT_MS = 5000;

export type RemoteAction =
  | 'volume_up'
  | 'volume_down'
  | 'mute'
  | 'power'
  | 'sleep';

export type HttpRequest = {
  method: 'GET' | 'POST';
  path: string;
  headers: Record<string, string>;
  body?: string;
};
export type HttpResponse = {status: number; text: string};
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

/** HTTP の応答は来たがエラーだったもの。status が無いものは届かなかった */
export class LightningError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export const fetchTransport: Transport = async ({
  method,
  path,
  headers,
  body,
}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    return {status: res.status, text: await res.text()};
  } finally {
    clearTimeout(timer);
  }
};

// 証明書は端末ごとの自己署名なので、ネイティブの fetch は検証で落ちる見込みが高い。
// 落ちたら、証明書エラーを許可できる WebView 経由に切り替えて以後そちらを使う。
let preferred: 'fetch' | 'webview' = 'fetch';

export function currentTransport(): string {
  return preferred;
}

async function send(req: HttpRequest): Promise<HttpResponse> {
  if (preferred === 'fetch') {
    try {
      return await fetchTransport(req);
    } catch (e) {
      console.error(`[lightning] fetch failed, switching to webview: ${e}`);
      preferred = 'webview';
    }
  }
  return webViewTransport(req);
}

async function post(
  path: string,
  token: string | null,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    'X-Api-Key': API_KEY,
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['X-Client-Token'] = token;
  }
  let res: HttpResponse;
  try {
    res = await send({
      method: 'POST',
      path,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    throw new LightningError(e instanceof Error ? e.message : String(e));
  }
  if (res.status < 200 || res.status >= 300) {
    throw new LightningError(`HTTP ${res.status} ${res.text}`, res.status);
  }
  try {
    return res.text ? JSON.parse(res.text) : null;
  } catch {
    return res.text;
  }
}

/** テレビ画面に 4 桁の PIN を出させる */
export async function requestPin(friendlyName: string): Promise<void> {
  await post('/v1/FireTV/pin/display', null, {friendlyName});
}

/** 画面に出た PIN を送り、以後の操作に使うトークンを受け取る */
export async function verifyPin(pin: string): Promise<string> {
  const res = (await post('/v1/FireTV/pin/verify', null, {pin})) as {
    description?: string;
  } | null;
  const token = res?.description;
  if (!token || token === 'OK') {
    throw new LightningError('トークンを受け取れませんでした');
  }
  return token;
}

export async function sendAction(
  action: RemoteAction,
  token: string | null,
): Promise<void> {
  await post(`/v1/FireTV?action=${action}`, token);
}

export function isAuthError(e: unknown): boolean {
  return e instanceof LightningError && (e.status === 401 || e.status === 403);
}

export type ProbeResult = {label: string; ok: boolean; detail: string};

async function probe(
  label: string,
  transport: Transport,
  req: HttpRequest,
): Promise<ProbeResult> {
  const started = Date.now();
  try {
    const res = await transport(req);
    return {
      label,
      ok: true,
      detail: `HTTP ${res.status}（${Date.now() - started}ms）${res.text.slice(
        0,
        200,
      )}`,
    };
  } catch (e) {
    return {
      label,
      ok: false,
      detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  }
}

/** 実機で API に届くかを経路ごとに確かめる。応答の中身ではなく、届いたか・何で落ちたかを見る */
export async function diagnose(token: string | null): Promise<ProbeResult[]> {
  const headers: Record<string, string> = {'X-Api-Key': API_KEY};
  if (token) {
    headers['X-Client-Token'] = token;
  }
  const req: HttpRequest = {method: 'GET', path: '/v1/FireTV', headers};
  // 並べて投げると WebView の読み込みと競合するので順に試す
  const results = [
    await probe('fetch で HTTPS 8080', fetchTransport, req),
    await probe('WebView で HTTPS 8080', webViewTransport, req),
  ];
  return results;
}
