import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {FocusButton} from '../components/FocusButton';
import {requestPin, verifyPin} from '../lightning';

export interface PairingScreenProps {
  onPaired: (token: string) => void;
  onOpenSettings: () => void;
}

const PIN_LENGTH = 4;
// テレビの PIN 表示に出る名前
const FRIENDLY_NAME = 'テレビ音量リモコン';
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

export const PairingScreen = ({
  onPaired,
  onOpenSettings,
}: PairingScreenProps) => {
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const showPin = useCallback(async () => {
    setPin('');
    setMessage('テレビに 4 桁の数字を表示しています…');
    try {
      await requestPin(FRIENDLY_NAME);
      setMessage('画面に出た 4 桁の数字を入力してください');
    } catch (e) {
      setMessage(
        `数字を表示できませんでした: ${e instanceof Error ? e.message : e}`,
      );
    }
  }, []);

  useEffect(() => {
    showPin();
  }, [showPin]);

  const submit = async (value: string) => {
    setBusy(true);
    try {
      const token = await verifyPin(value);
      onPaired(token);
    } catch (e) {
      setPin('');
      setMessage(
        `数字が違うようです。もう一度入力してください（${
          e instanceof Error ? e.message : e
        }）`,
      );
    } finally {
      setBusy(false);
    }
  };

  const press = (key: string) => {
    if (busy) {
      return;
    }
    if (key === 'やり直す') {
      showPin();
      return;
    }
    if (key === '消す') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    const next = (pin + key).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length === PIN_LENGTH) {
      submit(next);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>はじめの設定</Text>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.digits}>
        {Array.from({length: PIN_LENGTH}, (_, i) => (
          <View key={i} style={styles.digit}>
            <Text style={styles.digitText}>{pin[i] ?? ''}</Text>
          </View>
        ))}
      </View>
      <View style={styles.keypad}>
        {KEYS.map((key) => (
          <FocusButton
            key={key}
            label={key}
            labelSize={key.length > 1 ? 24 : 40}
            style={styles.key}
            hasTVPreferredFocus={key === '1'}
            onPress={() => press(key)}
            testID={`key-${key}`}
          />
        ))}
      </View>
      <View style={styles.footer}>
        <FocusButton
          label="設定・診断"
          labelSize={22}
          style={styles.settings}
          onPress={onOpenSettings}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  message: {
    color: '#C9D1E0',
    fontSize: 26,
    marginBottom: 24,
    textAlign: 'center',
  },
  digits: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 28,
  },
  digit: {
    width: 80,
    height: 96,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#5A6378',
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitText: {
    color: '#FFFFFF',
    fontSize: 52,
    fontWeight: 'bold',
  },
  keypad: {
    width: 3 * 160 + 2 * 20,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  key: {
    width: 160,
    minWidth: 160,
    height: 80,
  },
  footer: {
    position: 'absolute',
    right: 48,
    bottom: 40,
  },
  settings: {
    minWidth: 0,
    height: 64,
  },
});
