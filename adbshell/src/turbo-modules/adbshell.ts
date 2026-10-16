import type {KeplerTurboModule} from '@amazon-devices/keplerscript-turbomodule-api';
import {TurboModuleRegistry} from '@amazon-devices/keplerscript-turbomodule-api';

// Runs the volume watcher through the Fire TV developer-mode debug connection (127.0.0.1:5555).
// The native side only runs fixed commands; arbitrary commands cannot be passed.
export interface adbshell extends KeplerTurboModule {
  getMajorVersion: () => number;
  getMinorVersion: () => number;
  getPatchVersion: () => number;
  /** true if the watcher is running */
  isWatcherRunning: () => Promise<boolean>;
  /** Install and start the watcher (replaces a running one). token: letters, digits, - and _ only */
  startWatcher: (token: string) => Promise<void>;
  /** Show a 4-digit PIN on the TV */
  requestPin: () => Promise<void>;
  /** Send the PIN and receive a client token. Rejects with a message starting with "wrong-pin" on a bad PIN */
  verifyPin: (pin: string) => Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<adbshell>('adbshell');
