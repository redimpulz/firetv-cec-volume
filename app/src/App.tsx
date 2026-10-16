// App that runs the volume watcher (watcher/volume-watcher.sh) inside the Fire TV.
// On open it checks the watcher and starts it if needed. Open it once after the Fire TV restarts.
// The first time, it pairs with the remote-control API using a 4-digit PIN shown on the TV.

import {AsyncStorage} from '@amazon-devices/react-native-kepler';
import {adbshell} from '@redimpulz/adbshell';
import {t} from './i18n';
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
const CLEAR = 'clear';
const NEW_PIN = 'new-pin';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', CLEAR, '0', NEW_PIN];
const keyLabel = (k: string) =>
  k === CLEAR ? t.keyClear : k === NEW_PIN ? t.keyRetry : k;

type State =
  | {kind: 'busy'; message: string}
  | {kind: 'running'}
  | {kind: 'pairing'; message: string}
  | {kind: 'error'; message: string};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const App = () => {
  const [state, setState] = useState<State>({
    kind: 'busy',
    message: t.checking,
  });
  const [pin, setPin] = useState('');
  // Showing the PIN briefly sends the app to the background and back.
  // Remember the state so the PIN is not requested again each time.
  const stateRef = useRef(state);
  stateRef.current = state;
  const {height} = useWindowDimensions();
  // Size in units where the screen height is 1080
  const u = (px: number) => (px * height) / 1080;

  const startPairing = useCallback(async () => {
    setPin('');
    setState({kind: 'pairing', message: t.showingPin});
    try {
      await adbshell.requestPin();
      setState({
        kind: 'pairing',
        message: t.enterPin,
      });
    } catch (e) {
      setState({
        kind: 'error',
        message: `${t.pinFailed}: ${errorText(e)}`,
      });
    }
  }, []);

  const ensureRunning = useCallback(
    async (force = false) => {
      setState({kind: 'busy', message: t.checking});
      try {
        const token = await AsyncStorage.getItem(TOKEN_KEY);
        if (!token) {
          await startPairing();
          return;
        }
        if (force || !(await adbshell.isWatcherRunning())) {
          setState({kind: 'busy', message: t.starting});
          await adbshell.startWatcher(token);
        }
        setState({kind: 'running'});
      } catch (e) {
        setState({kind: 'error', message: errorText(e)});
      }
    },
    [startPairing],
  );

  // Check on open and when returning from another app
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
    setState({kind: 'busy', message: t.checking});
    try {
      const token = await adbshell.verifyPin(value);
      await AsyncStorage.setItem(TOKEN_KEY, token);
      await ensureRunning(true);
    } catch (e) {
      setPin('');
      setState({
        kind: 'pairing',
        message: errorText(e).startsWith('wrong-pin')
          ? t.wrongPin
          : errorText(e),
      });
    }
  };

  const press = (key: string) => {
    if (key === NEW_PIN) {
      startPairing();
    } else if (key === CLEAR) {
      setPin((p) => p.slice(0, -1));
    } else if (pin.length < PIN_LENGTH) {
      const next = pin + key;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        verify(next);
      }
    }
  };

  const button = (
    id: string,
    label: string,
    onPress: () => void,
    focus = false,
  ) => (
    <FocusButton
      key={id}
      label={label}
      onPress={onPress}
      focus={focus}
      style={{height: u(90), minWidth: u(200), borderRadius: u(16)}}
      fontSize={u(label.length > 1 ? 28 : 44)}
    />
  );

  return (
    <View style={[styles.container, {padding: u(60), gap: u(32)}]}>
      <Text style={[styles.title, {fontSize: u(48)}]}>{t.title}</Text>

      {state.kind === 'busy' && (
        <Text style={[styles.message, {fontSize: u(30)}]}>{state.message}</Text>
      )}

      {state.kind === 'running' && (
        <>
          <Text style={[styles.message, {fontSize: u(30)}]}>{t.running}</Text>
          <View style={[styles.row, {gap: u(24)}]}>
            {button('restart', t.restart, () => ensureRunning(true), true)}
            {button('repair', t.repair, async () => {
              await AsyncStorage.removeItem(TOKEN_KEY);
              startPairing();
            })}
          </View>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <Text style={[styles.error, {fontSize: u(28)}]}>{state.message}</Text>
          <Text style={[styles.message, {fontSize: u(24)}]}>{t.errorHint}</Text>
          {button('retry', t.retry, () => ensureRunning(), true)}
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
            {KEYS.map((k) => button(k, keyLabel(k), () => press(k), k === '1'))}
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
