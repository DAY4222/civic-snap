import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AppStateProvider, useAppState } from '@/lib/appState';
import { sweepOrphanReportPhotos } from '@/lib/reports';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (!loaded) return;

    // Photo files left behind by crashes or abandoned retakes.
    sweepOrphanReportPhotos().catch(() => undefined);
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  // The splash screen stays up until the settings are loaded too.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppStateProvider>
        <RootLayoutNav />
      </AppStateProvider>
    </GestureHandlerRootView>
  );
}

function RootLayoutNav() {
  const { settings } = useAppState();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack>
        {/* Until onboarding is done it is the only screen; finishing it opens the app. */}
        <Stack.Protected guard={!settings.onboardingComplete}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={settings.onboardingComplete}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
          <Stack.Screen
            name="report/[id]"
            options={{ headerBackTitle: 'Back', title: 'Report detail' }}
          />
          {/* The wizard handles its own Back; a swipe would skip the save-and-confirm step. */}
          <Stack.Screen name="report/new" options={{ gestureEnabled: false, headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </ThemeProvider>
  );
}
