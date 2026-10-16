import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleProp, StyleSheet, Text, ViewStyle} from 'react-native';

export interface FocusButtonProps {
  label: string;
  onPress: () => void;
  /** 決定キーを押し続けている間 onPress を繰り返す */
  repeat?: boolean;
  hasTVPreferredFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  labelSize?: number;
  testID?: string;
}

const REPEAT_MS = 180;

export const FocusButton = ({
  label,
  onPress,
  repeat,
  hasTVPreferredFocus,
  style,
  labelSize = 32,
  testID,
}: FocusButtonProps) => {
  const [focused, setFocused] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => stopRepeat, []);

  return (
    <Pressable
      style={[styles.button, focused && styles.focused, style]}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        stopRepeat();
      }}
      onPress={onPress}
      onLongPress={
        repeat
          ? () => {
              stopRepeat();
              timer.current = setInterval(onPress, REPEAT_MS);
            }
          : undefined
      }
      onPressOut={stopRepeat}
      hasTVPreferredFocus={hasTVPreferredFocus}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}>
      <Text style={[styles.label, {fontSize: labelSize}]}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    minWidth: 160,
    height: 120,
    paddingHorizontal: 32,
    borderRadius: 24,
    backgroundColor: '#2A2F3A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'transparent',
  },
  focused: {
    backgroundColor: '#3D7BFF',
    borderColor: '#FFFFFF',
    transform: [{scale: 1.08}],
  },
  label: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
