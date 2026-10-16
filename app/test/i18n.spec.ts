import {t} from '../src/i18n';

describe('i18n', () => {
  it('has a non-empty string for every key', () => {
    for (const value of Object.values(t)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
