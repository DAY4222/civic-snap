import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type StickyActionBarProps = {
  children: ReactNode;
};

export function StickyActionBar({ children }: StickyActionBarProps) {
  return <View style={styles.bar}>{children}</View>;
}

const styles = StyleSheet.create({
  bar: {
    gap: 10,
  },
});
