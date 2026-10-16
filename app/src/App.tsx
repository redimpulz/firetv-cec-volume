// 音量の見張り（watcher/volume-watcher.sh）を Fire TV の中で動かすアプリ。
// 開くと見張りが動いているかを確かめ、止まっていれば動かす。Fire TV を再起動したら 1 回開く。
// 初回だけ、テレビに出る 4 桁の数字でリモコン用 API とペアリングする。

import {AsyncStorage} from '@amazon-devices/react-native-kepler';
import {adbshell} from '@redimpulz/adbshell';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {
  AppState,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

const TOKEN_KEY = 'volumeremote.clientToken';
const PIN_LENGTH = 4;
const KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '消す',
  '0',
  'やり直す',
];

type State =
  | {kind: 'busy'; message: string}
  | {kind: 'running'}
  | {kind: 'pairing'; message: string}
  | {kind: 'error'; message: string};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const App = () => {
  const [state, setState] = useState<State>({
    kind: 'busy',
    message: '確認しています…',
  });
  const [pin, setPin] = useState('');
  // テレビに数字を出すとアプリは一瞬裏に回り、また手前に戻る。そのたびに数字を出し直さないよう、今の状態を覚えておく
  const stateRef = useRef(state);
  stateRef.current = state;
  const {height} = useWindowDimensions();
  // 画面の高さを 1080 とみなした大きさ
  const u = (px: number) => (px * height) / 1080;

  const startPairing = useCallback(async () => {
    setPin('');
    setState({kind: 'pairing', message: 'テレビに 4 桁の数字を出しています…'});
    try {
      await adbshell.requestPin();
      setState({
        kind: 'pairing',
        message: 'テレビに出た 4 桁の数字を入力してください',
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: `数字を出せませんでした: ${errorText(e)}`,
      });
    }
  }, []);

  const ensureRunning = useCallback(
    async (force = false) => {
      setState({kind: 'busy', message: '確認しています…'});
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (!token) {
          await startPairing();
          return;
        }
        if (force || !(await adbshell.isWatcherRunning())) {
          setState({kind: 'busy', message: '見張りを動かしています…'});
          await adbshell.startWatcher(token);
        }
        setState({kind: 'running'});
      } catch (e) {
        setState({kind: 'error', message: errorText(e)});
      }
    },
    [startPairing],
  );

  // 開いたときと、ほかのアプリから戻ってきたときに確かめる
  useEffect(() => {
    ensureRunning();
    const sub = AppState.addEventListener('change', (s) => {
      const kind = stateRef.current.kind;
      if (s === 'active' && kind !== 'pairing' && kind !== 'busy') {
        ensureRunning();
      }
    });
    return () => sub.remove();
  }, [ensureRunning]);

  const verify = async (value: string) => {
    setState({kind: 'busy', message: '確認しています…'});
    try {
      const token = await adbshell.verifyPin(value);
      await AsyncStorage.setItem(TOKEN_KEY, token);
      await ensureRunning(true);
    } catch (e) {
      setPin('');
      setState({
        kind: 'pairing',
        message: `${errorText(e)}。もう一度入力してください`,
      });
    }
  };

  const press = (key: string) => {
    if (key === 'やり直す') {
      startPairing();
    } else if (key === '消す') {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < PIN_LENGTH) {
      const next = pin + key;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        verify(next);
      }
    }
  };

  const button = (label: string, onPress: () => void, focus = false) => (
    <FocusButton
      key={label}
      label={label}
      onPress={onPress}
      focus={focus}
      style={{height: u(90), minWidth: u(200), borderRadius: u(16)}}
      fontSize={u(label.length > 1 ? 28 : 44)}
    />
  );

  return (
    <View style={[styles.container, {padding: u(60), gap: u(32)}]}>
      <Text style={[styles.title, {fontSize: u(48)}]}>テレビ音量リモコン</Text>

      {state.kind === 'busy' && (
        <Text style={[styles.message, {fontSize: u(30)}]}>{state.message}</Text>
      )}

      {state.kind === 'running' && (
        <>
          <Text style={[styles.message, {fontSize: u(30)}]}>
            見張りが動いています。{'\n'}
            リモコンの音量ボタンでテレビの音量が変わります。{'\n'}
            ホームボタンで戻って大丈夫です。
          </Text>
          <View style={[styles.row, {gap: u(24)}]}>
            {button('動かし直す', () => ensureRunning(true), true)}
            {button('ペアリングし直す', async () => {
              await AsyncStorage.removeItem(TOKEN_KEY);
              startPairing();
            })}
          </View>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <Text style={[styles.error, {fontSize: u(28)}]}>{state.message}</Text>
          <Text style={[styles.message, {fontSize: u(24)}]}>
            開発者モードが有効で、接続方法が TCP/IP
            になっているか確かめてください。
          </Text>
          {button('もう一度試す', () => ensureRunning(), true)}
        </>
      )}

      {state.kind === 'pairing' && (
        <>
          <Text style={[styles.message, {fontSize: u(28)}]}>
            {state.message}
          </Text>
          <View style={[styles.row, {gap: u(16)}]}>
            {Array.from({length: PIN_LENGTH}, (_, i) => (
              <View
                key={i}
                style={[
                  styles.digit,
                  {width: u(70), height: u(90), borderRadius: u(10)},
                ]}>
                <Text style={[styles.digitText, {fontSize: u(52)}]}>
                  {pin[i] ?? ''}
                </Text>
              </View>
            ))}
          </View>
          <View
            style={[
              styles.keypad,
              {width: u(200) * 3 + u(16) * 2, gap: u(16)},
            ]}>
            {KEYS.map((k) => button(k, () => press(k), k === '1'))}
          </View>
        </>
      )}
    </View>
  );
};

const FocusButton = ({
  label,
  onPress,
  focus,
  style,
  fontSize,
}: {
  label: string;
  onPress: () => void;
  focus: boolean;
  style: object;
  fontSize: number;
}) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={[styles.button, style, focused && styles.focused]}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      hasTVPreferredFocus={focus}>
      <Text style={[styles.buttonText, {fontSize}]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {color: '#FFFFFF', fontWeight: 'bold'},
  message: {color: '#C9D1E0', textAlign: 'center'},
  error: {color: '#FFB4A9', textAlign: 'center'},
  row: {flexDirection: 'row'},
  keypad: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center'},
  digit: {
    borderWidth: 3,
    borderColor: '#5A6378',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {color: '#FFFFFF', fontWeight: 'bold'},
  button: {
    backgroundColor: '#2A2F3A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
    paddingHorizontal: 16,
  },
  focused: {backgroundColor: '#3D7BFF', borderColor: '#FFFFFF'},
  buttonText: {color: '#FFFFFF', fontWeight: 'bold'},
});
