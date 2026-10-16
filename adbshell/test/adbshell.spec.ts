import {adbshell} from '../src';

jest.mock('../src/turbo-modules/adbshell');

describe('Template Turbomodule library tests', () => {
  it('Sample Test Case', () => {
    expect(adbshell.getMajorVersion()).toBe(1);
  });
});
