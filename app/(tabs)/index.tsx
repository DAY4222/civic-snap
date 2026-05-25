import { lazy, Suspense } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/components/ui';

const ReportWizard = lazy(() =>
  import('@/features/report/ReportWizard').then((module) => ({ default: module.ReportWizard }))
);

export default function ReportScreen() {
  return (
    <Suspense
      fallback={
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      }>
      <ReportWizard />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flex: 1,
    justifyContent: 'center',
  },
});
