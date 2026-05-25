import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { listReports } from './reports';
import type { Report } from './types';

export function useReportsOnFocus() {
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      setError(false);
      setLoading(true);

      listReports()
        .then((rows) => {
          if (mounted) setReports(rows);
        })
        .catch(() => {
          if (mounted) setError(true);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });

      return () => {
        mounted = false;
      };
    }, [])
  );

  return { error, loading, reports };
}
