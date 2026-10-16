import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {FocusButton} from '../components/FocusButton';
import {RemoteAction, isAuthError, sendAction} from '../lightning';

export interface RemoteScreenProps {
  token: string | null;
  /** トークンが無い・無効になったとき */
  onNeedPairing: () => void;
  onOpenSettings: () => void;
}

// 電源ボタンは誤操作を避けるため、この時間内にもう一度押したときだけ切る
const POWER_CONFIRM_MS = 4000;

export const RemoteScreen = ({
  token,
  onNeedPairing,
  onOpenSettings,
}: RemoteScreenProps) => {
  const [status, setStatus] = useState('');
  const [powerArmed, setPowerArmed] = useState(false);
  const powerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (powerTimer.current) {
        clearTimeout(powerTimer.current);
      }
    },
    [],
  );

  const send = async (action: RemoteAction) => {
    try {
      await sendAction(action, token);
      setStatus('');
    } catch (e) {
      if (isAuthError(e)) {
        onNeedPairing();
        return;
      }
      setStatus(`送れませんでした: ${e instanceof Error ? e.message : e}`);
    }
  };

  const onPower = () => {
    if (!powerArmed) {
      setPowerArmed(true);
      setStatus('もう一度押すとテレビの電源を切ります');
      powerTimer.current = setTimeout(() => {
        setPowerArmed(false);
        setStatus('');
      }, POWER_CONFIRM_MS);
      return;
    }
    if (powerTimer.current) {
      clearTimeout(powerTimer.current);
    }
    setPowerArmed(false);
    // Fire TV をスリープさせると、HDMI-CEC でテレビも待機に入る
    send('sleep');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>テレビの音量</Text>
      <View style={styles.row}>
        <FocusButton
          label="−"
          labelSize={64}
          style={styles.volume}
          repeat
          onPress={() => send('volume_down')}
          testID="volume-down"
        />
        <FocusButton
          label="消音"
          style={styles.volume}
          onPress={() => send('mute')}
          testID="mute"
        />
        <FocusButton
          label="＋"
          labelSize={64}
          style={styles.volume}
          repeat
          hasTVPreferredFocus
          onPress={() => send('volume_up')}
          testID="volume-up"
        />
      </View>
      <View style={styles.row}>
        <FocusButton
          label={powerArmed ? 'もう一度押して電源オフ' : 'テレビの電源を切る'}
          style={[styles.power, powerArmed && styles.powerArmed]}
          onPress={onPower}
          testID="power"
        />
      </View>
      <Text style={styles.status}>{status}</Text>
      <View style={styles.footer}>
        <FocusButton
          label="設定・診断"
          labelSize={22}
          style={styles.settings}
          onPress={onOpenSettings}
          testID="settings"
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
    padding: 48,
  },
  title: {
    color: '#C9D1E0',
    fontSize: 36,
    marginBottom: 40,
  },
  row: {
    flexDirection: 'row',
    gap: 48,
    marginBottom: 48,
  },
  volume: {
    width: 220,
    height: 160,
  },
  power: {
    width: 756,
    height: 100,
  },
  powerArmed: {
    backgroundColor: '#C0392B',
  },
  status: {
    color: '#FFB4A9',
    fontSize: 26,
    minHeight: 36,
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
