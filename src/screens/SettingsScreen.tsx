import React, {useState} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {FocusButton} from '../components/FocusButton';
import {
  ProbeResult,
  RemoteAction,
  currentTransport,
  diagnose,
  sendAction,
} from '../lightning';

export interface SettingsScreenProps {
  token: string | null;
  onRepair: () => void;
  onBack: () => void;
}

// 実機で、どのキーが CEC でテレビに届くかを一つずつ試すためのもの
const TEST_ACTIONS: RemoteAction[] = [
  'volume_up',
  'volume_down',
  'mute',
  'power',
  'sleep',
];

export const SettingsScreen = ({
  token,
  onRepair,
  onBack,
}: SettingsScreenProps) => {
  const [lines, setLines] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const log = (line: string) =>
    setLines((prev) =>
      [`${new Date().toLocaleTimeString()} ${line}`, ...prev].slice(0, 30),
    );

  const runDiagnose = async () => {
    setRunning(true);
    log('診断を始めます');
    const results: ProbeResult[] = await diagnose(token);
    results.forEach((r) => log(`${r.ok ? '○' : '×'} ${r.label}: ${r.detail}`));
    log(`使っている経路: ${currentTransport()}`);
    setRunning(false);
  };

  const test = async (action: RemoteAction) => {
    try {
      await sendAction(action, token);
      log(`○ ${action}（経路: ${currentTransport()}）`);
    } catch (e) {
      log(`× ${action}: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>設定・診断</Text>
      <Text style={styles.info}>
        ペアリング: {token ? '済み' : 'まだ'} ／ 経路: {currentTransport()}
      </Text>
      <View style={styles.row}>
        <FocusButton
          label="戻る"
          labelSize={24}
          style={styles.button}
          hasTVPreferredFocus
          onPress={onBack}
        />
        <FocusButton
          label={running ? '診断中…' : '接続を診断'}
          labelSize={24}
          style={styles.button}
          onPress={runDiagnose}
        />
        <FocusButton
          label="ペアリングし直す"
          labelSize={24}
          style={styles.button}
          onPress={onRepair}
        />
      </View>
      <View style={styles.row}>
        {TEST_ACTIONS.map((a) => (
          <FocusButton
            key={a}
            label={a}
            labelSize={20}
            style={styles.small}
            onPress={() => test(a)}
          />
        ))}
      </View>
      <ScrollView style={styles.log}>
        {lines.map((l, i) => (
          <Text key={i} style={styles.logLine}>
            {l}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#11141A',
    padding: 48,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: 'bold',
  },
  info: {
    color: '#C9D1E0',
    fontSize: 24,
    marginVertical: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 24,
    marginBottom: 24,
  },
  button: {
    minWidth: 220,
    height: 72,
  },
  small: {
    minWidth: 160,
    height: 60,
  },
  log: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 16,
  },
  logLine: {
    color: '#9FE6A0',
    fontSize: 20,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
});
