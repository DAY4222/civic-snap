export const colors = {
  background: '#f5f5f7',
  border: '#d1d1d6',
  borderStrong: '#b8dce8',
  card: '#fff',
  danger: '#d43f2f',
  infoBackground: '#e9f5f9',
  muted: '#636366',
  mutedStrong: '#3a3a3c',
  primary: '#0a7ea4',
  primaryDark: '#0a5f7a',
  selectedBackground: '#f9fbfc',
  text: '#1d1d1f',
  warningBackground: '#fff4df',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 12,
  lg: 14,
  xl: 16,
  pill: 999,
} as const;

export const typography = {
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  label: {
    fontSize: 12,
    fontWeight: '800' as const,
    textTransform: 'uppercase' as const,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  title: {
    fontSize: 30,
    fontWeight: '800' as const,
  },
} as const;
