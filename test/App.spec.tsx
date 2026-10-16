import 'react-native';
import {render} from '@testing-library/react-native';
import * as React from 'react';

import {RemoteScreen} from '../src/screens/RemoteScreen';

jest.mock('@amazon-devices/webview', () => ({WebView: () => null}));

describe('RemoteScreen', () => {
  it('音量と電源のボタンを出す', () => {
    const screen = render(
      <RemoteScreen
        token={null}
        onNeedPairing={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.getByTestId('volume-up')).toBeTruthy();
    expect(screen.getByTestId('volume-down')).toBeTruthy();
    expect(screen.getByTestId('mute')).toBeTruthy();
    expect(screen.getByTestId('power')).toBeTruthy();
  });
});
