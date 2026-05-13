import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, router, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';

import { hasCompletedOnboarding } from '@/lib/profile';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });
  const [checkedOnboarding, setCheckedOnboarding] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    let active = true;

    if (!loaded) return;

    hasCompletedOnboarding()
      .then((completed) => {
        if (!active) return;

        setShowOnboarding(!completed);
      })
      .catch(() => {
        if (active) setShowOnboarding(true);
      })
      .finally(() => {
        if (active) setCheckedOnboarding(true);
      });

    return () => {
      active = false;
    };
  }, [loaded]);

  useEffect(() => {
    if (loaded && checkedOnboarding) {
      SplashScreen.hideAsync();
    }
  }, [checkedOnboarding, loaded]);

  if (!loaded || !checkedOnboarding) {
    return null;
  }

  return <RootLayoutNav setShowOnboarding={setShowOnboarding} showOnboarding={showOnboarding} />;
}

function RootLayoutNav({
  setShowOnboarding,
  showOnboarding,
}: {
  setShowOnboarding: (showOnboarding: boolean) => void;
  showOnboarding: boolean;
}) {
  const pathname = usePathname();

  useEffect(() => {
    let active = true;

    if (!showOnboarding || pathname === '/onboarding') return;

    hasCompletedOnboarding()
      .then((completed) => {
        if (!active) return;

        if (completed) {
          setShowOnboarding(false);
          return;
        }

        router.replace('/onboarding');
      })
      .catch(() => {
        if (active) router.replace('/onboarding');
      });

    return () => {
      active = false;
    };
  }, [pathname, setShowOnboarding, showOnboarding]);

  return (
    <ThemeProvider value={DefaultTheme}>
      <Stack initialRouteName={showOnboarding ? 'onboarding' : '(tabs)'}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
        <Stack.Screen name="report/[id]" options={{ title: 'Report detail' }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
