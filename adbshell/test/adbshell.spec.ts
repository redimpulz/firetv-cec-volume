import {adbshell} from '../src';

jest.mock('../src/turbo-modules/adbshell');

describe('adbshell', () => {
  it('exposes only the fixed watcher operations', () => {
    expect(Object.keys(adbshell).sort()).toEqual(
      [
        'getMajorVersion',
        'getMinorVersion',
        'getPatchVersion',
        'isWatcherRunning',
        'requestPin',
        'startWatcher',
        'verifyPin',
      ].sort(),
    );
  });
});
