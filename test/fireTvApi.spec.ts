import {resolveOrigin} from '../src/fireTvApi';

describe('resolveOrigin', () => {
  it('DIAL の Application-URL から API の origin を作る', async () => {
    globalThis.fetch = jest.fn(() =>
      Promise.resolve({
        headers: {get: () => 'http://10.0.4.69:8009/apps/'},
      }),
    ) as unknown as typeof fetch;
    await expect(resolveOrigin()).resolves.toBe('https://10.0.4.69:8080');
  });
});
