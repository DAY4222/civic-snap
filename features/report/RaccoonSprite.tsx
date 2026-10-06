import { useEffect, useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { RACCOON_SWEEPER_FRAMES } from './raccoonFrames';

const FRAME_INTERVAL_MS = 67;

/** The sweeping raccoon. It animates itself, so the screen around it doesn't re-render. */
export function RaccoonSprite({ style }: { style?: StyleProp<ViewStyle> }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((current) => (current + 1) % RACCOON_SWEEPER_FRAMES.length);
    }, FRAME_INTERVAL_MS);

    return () => clearInterval(timer);
  }, []);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={style}>
      <Image
        resizeMode="contain"
        source={RACCOON_SWEEPER_FRAMES[frameIndex]}
        style={styles.frame}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: '100%',
    width: '100%',
  },
});
