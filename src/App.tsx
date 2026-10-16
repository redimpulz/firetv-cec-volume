// アプリの入れ物。画面は WebView 1 枚で、中身は page.ts。
// Fire TV のリモコン用 API（https://<端末の IP>:8080）を開き、そのページに画面を書き込む。
// こうすると自己署名証明書を onSslError で許可でき、API とも同一 origin で通信できる。
// RN 側は、ページから頼めない平文 HTTP の処理（端末の IP を調べる・API を起こす）を受け持つ。

import {WebView} from '@amazon-devices/webview';
import type {
  OnSslErrorCallback,
  SslErrorData,
  WebViewMessageEvent,
} from '@amazon-devices/webview/dist/types/WebViewTypes';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {resolveOrigin, wake} from './fireTvApi';
import {PAGE_HTML} from './page';
import {loadToken, saveToken} from './storage';

type WebViewHandle = React.ElementRef<typeof WebView> & {reload: () => void};

const RETRY_MS = 3000;

export const App = () => {
  const webRef = useRef<WebViewHandle>(null);
  const [origin, setOrigin] = useState<string | null>(null);
  const [message, setMessage] = useState('Fire TV に接続しています…');
  const tokenRef = useRef<string | null>(null);
  const loadFailed = useRef(false);

  // 端末の IP を調べ、API を起こしてから WebView で開く
  const connect = useCallback(async () => {
    try {
      tokenRef.current = await loadToken();
      const o = await resolveOrigin();
      await wake();
      setOrigin(o);
    } catch (e) {
      console.error(`[app] connect failed: ${e}`);
      setMessage(`Fire TV に接続できません（${e}）。再試行しています…`);
      setTimeout(connect, RETRY_MS);
    }
  }, []);

  useEffect(() => {
    connect();
  }, [connect]);

  const inject = (script: string) => webRef.current?.injectJavaScript(script);

  const onMessage = async ({nativeEvent}: WebViewMessageEvent) => {
    let msg: {type: string; token?: string};
    try {
      msg = JSON.parse(nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'wake') {
      try {
        await wake();
      } catch (e) {
        console.error(`[app] wake failed: ${e}`);
      }
      inject('window.__vr && window.__vr.woke(); true;');
    } else if (msg.type === 'saveToken' && msg.token) {
      tokenRef.current = msg.token;
      await saveToken(msg.token);
    }
  };

  if (!origin) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webRef}
        style={styles.webview}
        hasTVPreferredFocus
        source={{uri: `${origin}/`}}
        javaScriptEnabled
        allowSystemKeyEvents
        onLoadStart={() => {
          loadFailed.current = false;
        }}
        onLoad={() => {
          // 繋がらなかったときもエラーページの読み込みで onLoad が来るので、そのときは書き込まない
          if (loadFailed.current) {
            return;
          }
          const init = JSON.stringify({token: tokenRef.current});
          inject(`(function(){
  window.__vr = ${init};
  document.open();
  document.write(${JSON.stringify(PAGE_HTML)});
  document.close();
})(); true;`);
        }}
        onError={({nativeEvent: {description}}) => {
          console.error(`[app] onError ${description}`);
          loadFailed.current = true;
          // API が止まっていた。起こして読み直す
          wake()
            .catch(() => {})
            .then(() => setTimeout(() => webRef.current?.reload(), 500));
        }}
        onSslError={(e: SslErrorData, callback: OnSslErrorCallback) => {
          // Fire TV 自身の自己署名証明書だけを許可する
          if (e.url.startsWith(origin)) {
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
  container: {flex: 1, backgroundColor: '#11141A'},
  webview: {flex: 1, backgroundColor: '#11141A'},
  center: {
    flex: 1,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {color: '#C9D1E0', fontSize: 28},
});
