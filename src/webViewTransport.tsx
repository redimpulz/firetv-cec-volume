// 見えない WebView で Lightning の origin（https://127.0.0.1:8080）を開き、
// そのページの中から同一 origin の fetch を投げる経路。
// ネイティブの fetch は自己署名証明書を許可できないが、WebView は onSslError で許可できる。
// 同一 origin なので、独自ヘッダを付けても CORS に引っかからない。

import {WebView} from '@amazon-devices/webview';
import type {
  SslErrorData,
  OnSslErrorCallback,
  WebViewMessageEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import * as React from 'react';
import {useEffect, useRef} from 'react';
import {StyleSheet, View} from 'react-native';
import type {HttpRequest, HttpResponse} from './lightning';

export const ORIGIN = 'https://127.0.0.1:8080';
const READY_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 5000;
const RELOAD_MS = 10000;

type WebViewHandle = React.ElementRef<typeof WebView> & {reload: () => void};
type Pending = {
  resolve: (res: HttpResponse) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let webview: WebViewHandle | null = null;
let ready = false;
let lastError = 'WebView がまだ読み込まれていません';
let readyWaiters: Array<() => void> = [];
let nextId = 1;
const pending = new Map<number, Pending>();

function setReady(value: boolean, error?: string) {
  ready = value;
  if (error) {
    lastError = error;
  }
  if (value) {
    readyWaiters.forEach((w) => w());
    readyWaiters = [];
  }
}

function waitReady(): Promise<void> {
  if (ready) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      readyWaiters = readyWaiters.filter((w) => w !== done);
      reject(new Error(`WebView 経由で繋がりません: ${lastError}`));
    }, READY_TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    readyWaiters.push(done);
  });
}

export async function webViewTransport(
  req: HttpRequest,
): Promise<HttpResponse> {
  await waitReady();
  const id = nextId++;
  return new Promise<HttpResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('WebView 経由の要求が時間切れになりました'));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, {resolve, reject, timer});
    // 値は JSON.stringify で埋め込み、ページ側でそのまま使う
    const script = `(function(){
  var id = ${id};
  var post = function(m){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); };
  fetch(${JSON.stringify(req.path)}, {
    method: ${JSON.stringify(req.method)},
    headers: ${JSON.stringify(req.headers)},
    body: ${JSON.stringify(req.body ?? null)}
  }).then(function(r){
    return r.text().then(function(t){ post({id: id, status: r.status, text: t}); });
  }).catch(function(e){ post({id: id, error: String(e)}); });
})(); true;`;
    if (!webview) {
      clearTimeout(timer);
      pending.delete(id);
      reject(new Error('WebView がありません'));
      return;
    }
    webview.injectJavaScript(script);
  });
}

function onMessage({nativeEvent}: WebViewMessageEvent) {
  let msg: {id?: number; status?: number; text?: string; error?: string};
  try {
    msg = JSON.parse(nativeEvent.data);
  } catch {
    return;
  }
  const p = msg.id === undefined ? undefined : pending.get(msg.id);
  if (!p || msg.id === undefined) {
    return;
  }
  pending.delete(msg.id);
  clearTimeout(p.timer);
  if (msg.error !== undefined) {
    p.reject(new Error(msg.error));
  } else {
    p.resolve({status: msg.status ?? 0, text: msg.text ?? ''});
  }
}

/** 画面の隅に置く 1px の WebView。アプリの間ずっと置いておく */
export const WebViewBridge = () => {
  const ref = useRef<WebViewHandle>(null);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    webview = ref.current;
    return () => {
      webview = null;
      setReady(false);
      if (reloadTimer.current) {
        clearTimeout(reloadTimer.current);
      }
    };
  }, []);

  // 読み込めなかったら間を空けて読み直す（起動直後で API がまだ上がっていない等）
  const scheduleReload = () => {
    if (reloadTimer.current) {
      clearTimeout(reloadTimer.current);
    }
    reloadTimer.current = setTimeout(() => ref.current?.reload(), RELOAD_MS);
  };

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        ref={ref}
        style={styles.webview}
        source={{uri: `${ORIGIN}/`}}
        javaScriptEnabled
        // ページの本文は使わない。origin を得るためだけに開く（404 でも構わない）
        onLoad={() => setReady(true)}
        onError={({nativeEvent: {description}}) => {
          console.error(`[bridge] onError ${description}`);
          setReady(false, description);
          scheduleReload();
        }}
        onSslError={(e: SslErrorData, callback: OnSslErrorCallback) => {
          // Fire TV 自身の自己署名証明書だけを許可する
          if (e.url.startsWith(ORIGIN)) {
            callback.proceed();
          } else {
            callback.cancel();
          }
        }}
        onMessage={onMessage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  webview: {width: 1, height: 1},
});
