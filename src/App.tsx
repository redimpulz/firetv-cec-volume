import React, {useEffect, useState} from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';
import {PairingScreen} from './screens/PairingScreen';
import {RemoteScreen} from './screens/RemoteScreen';
import {SettingsScreen} from './screens/SettingsScreen';
import {clearToken, loadToken, saveToken} from './storage';
import {WebViewBridge} from './webViewTransport';

type Screen = 'loading' | 'remote' | 'pairing' | 'settings';

export const App = () => {
  const [screen, setScreen] = useState<Screen>('loading');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    loadToken().then((t) => {
      setToken(t);
      // トークンが無くても、まずはそのまま操作を試す。
      // 認証を求められたらペアリングに移る
      setScreen('remote');
    });
  }, []);

  // 設定画面とペアリング画面では、戻るキーでリモコン画面に戻す
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'settings' || screen === 'pairing') {
        setScreen('remote');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [screen]);

  const onPaired = async (t: string) => {
    await saveToken(t);
    setToken(t);
    setScreen('remote');
  };

  const onRepair = async () => {
    await clearToken();
    setToken(null);
    setScreen('pairing');
  };

  return (
    <View style={styles.container}>
      {screen === 'remote' && (
        <RemoteScreen
          token={token}
          onNeedPairing={() => setScreen('pairing')}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'pairing' && (
        <PairingScreen
          onPaired={onPaired}
          onOpenSettings={() => setScreen('settings')}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          token={token}
          onRepair={onRepair}
          onBack={() => setScreen('remote')}
        />
      )}
      <WebViewBridge />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#11141A',
  },
});
