export default {
  getMajorVersion: () => 1,
  getMinorVersion: () => 0,
  getPatchVersion: () => 0,
  isWatcherRunning: () => Promise.resolve(false),
  startWatcher: () => Promise.resolve(),
  requestPin: () => Promise.resolve(),
  verifyPin: () => Promise.resolve('token'),
};
