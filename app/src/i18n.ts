// UI strings in English and Japanese. The language follows the device locale.

const en = {
  title: 'CEC Volume',
  checking: 'Checking…',
  starting: 'Starting the watcher…',
  running:
    'The watcher is running.\nThe remote volume buttons now change the TV volume.\nYou can press Home to leave.',
  restart: 'Restart',
  repair: 'Pair again',
  showingPin: 'Showing a 4-digit PIN on the TV…',
  enterPin: 'Enter the 4-digit PIN shown on the TV',
  wrongPin: 'The PIN did not match. Try again.',
  pinFailed: 'Could not show the PIN',
  errorHint:
    'Make sure developer mode is on and Connection Mode is set to TCP/IP.',
  retry: 'Try again',
  keyClear: 'Delete',
  keyRetry: 'New PIN',
};

const ja: typeof en = {
  title: 'CEC Volume',
  checking: '確認しています…',
  starting: '見張りを動かしています…',
  running:
    '見張りが動いています。\nリモコンの音量ボタンでテレビの音量が変わります。\nホームボタンで戻って大丈夫です。',
  restart: '動かし直す',
  repair: 'ペアリングし直す',
  showingPin: 'テレビに 4 桁の数字を出しています…',
  enterPin: 'テレビに出た 4 桁の数字を入力してください',
  wrongPin: '数字が違うようです。もう一度入力してください',
  pinFailed: '数字を出せませんでした',
  errorHint:
    '開発者モードが有効で、接続方法が TCP/IP になっているか確かめてください。',
  retry: 'もう一度試す',
  keyClear: '消す',
  keyRetry: 'やり直す',
};

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return 'en';
  }
}

export const t = deviceLocale().toLowerCase().startsWith('ja') ? ja : en;
