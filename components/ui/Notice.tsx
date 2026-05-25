import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from './theme';

type NoticeProps = {
  text: string;
  tone?: 'plain' | 'warning';
};

export function Notice({ text, tone = 'plain' }: NoticeProps) {
  return (
    <View style={[styles.notice, tone === 'warning' && styles.warning]}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.infoBackground,
    borderRadius: radius.lg,
    padding: 14,
  },
  text: {
    color: '#2f3a40',
    fontSize: 14,
    lineHeight: 20,
  },
  warning: {
    backgroundColor: colors.warningBackground,
  },
});
