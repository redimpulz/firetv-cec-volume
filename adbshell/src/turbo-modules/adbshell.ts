import type {KeplerTurboModule} from '@amazon-devices/keplerscript-turbomodule-api';
import {TurboModuleRegistry} from '@amazon-devices/keplerscript-turbomodule-api';

// Fire TV の開発者モードのデバッグ用接続（127.0.0.1:5555）を使い、音量の見張りを動かす。
// 実行するコマンドはネイティブ側で決まったものだけで、任意のコマンドは渡せない。
export interface adbshell extends KeplerTurboModule {
  getMajorVersion: () => number;
  getMinorVersion: () => number;
  getPatchVersion: () => number;
  /** 見張りが動いていれば true */
  isWatcherRunning: () => Promise<boolean>;
  /** 見張りを置いて動かす（動いていれば入れ替える）。token は英数字と - _ だけ */
  startWatcher: (token: string) => Promise<void>;
  /** テレビに 4 桁の PIN を出させる */
  requestPin: () => Promise<void>;
  /** PIN を送ってトークンを受け取る。pin は数字 4 桁 */
  verifyPin: (pin: string) => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<adbshell>('adbshell');
