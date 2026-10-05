import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, colors, radius, spacing } from '@/components/ui';

const SENT = ['Issue type', 'Your description', 'Address and location note', 'Checklist answers'];
const NEVER_SENT = ['Your name, email and phone', 'Exact GPS location', 'Your photo'];

export function EmailPolishConsentSheet({
  onAllow,
  onDismiss,
  visible,
}: {
  onAllow: () => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onDismiss} transparent visible={visible}>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onDismiss}
        style={styles.backdrop}
      />
      <View accessibilityViewIsModal style={styles.sheet}>
        <Text style={styles.title}>Polish your email with AI?</Text>
        <Text style={styles.body}>
          Civic Snap sends your report to Google Gemini through its server to rewrite the email. You
          review the result before anything is sent to 311.
        </Text>

        <View style={styles.columns}>
          <View style={styles.column}>
            <Text style={styles.columnTitle}>Sent</Text>
            {SENT.map((item) => (
              <ListRow color={colors.primary} icon="check" key={item} text={item} />
            ))}
          </View>
          <View style={styles.column}>
            <Text style={styles.columnTitle}>Never sent</Text>
            {NEVER_SENT.map((item) => (
              <ListRow color={colors.muted} icon="ban" key={item} text={item} />
            ))}
          </View>
        </View>

        <Button onPress={onAllow} title="Allow and polish" />
        <Button onPress={onDismiss} title="Not now" variant="plain" />
        <Text style={styles.footnote}>You can turn this off any time in Settings.</Text>
      </View>
    </Modal>
  );
}

function ListRow({
  color,
  icon,
  text,
}: {
  color: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  text: string;
}) {
  return (
    <View style={styles.row}>
      <FontAwesome color={color} name={icon} size={14} style={styles.rowIcon} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    gap: spacing.md,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  body: {
    color: colors.mutedStrong,
    fontSize: 15,
    lineHeight: 22,
  },
  columns: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginVertical: spacing.xs,
  },
  column: {
    flex: 1,
    gap: spacing.sm,
  },
  columnTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowIcon: {
    marginTop: 3,
  },
  rowText: {
    color: colors.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  footnote: {
    color: colors.muted,
    fontSize: 13,
    textAlign: 'center',
  },
});
