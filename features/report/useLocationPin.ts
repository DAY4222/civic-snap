import { useEffect, useMemo, useRef } from 'react';
import { Alert } from 'react-native';

import { type Region } from '@/components/CivicMap';

import { getCurrentLocationReportData, reverseGeocodeReportAddress } from './reportWizardServices';
import { openAppSettings, type WizardStore } from './wizardTypes';

const BLOCK_LEVEL_DELTA = 0.0012;
const REVERSE_GEOCODE_DELAY_MS = 450;

/**
 * The location step's pin and address. A reverse-geocoded address only fills the field when
 * the user hasn't typed since the lookup started.
 */
export function useLocationPin({ state, dispatch }: WizardStore) {
  const { draft } = state;
  const addressEditVersion = useRef(0);
  const reverseGeocodeRequestId = useRef(0);
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pinRegion = useMemo<Region | null>(() => {
    if (draft.latitude == null || draft.longitude == null) return null;

    return {
      latitude: draft.latitude,
      longitude: draft.longitude,
      latitudeDelta: BLOCK_LEVEL_DELTA,
      longitudeDelta: BLOCK_LEVEL_DELTA,
    };
  }, [draft.latitude, draft.longitude]);

  useEffect(
    () => () => {
      if (reverseGeocodeTimeout.current) clearTimeout(reverseGeocodeTimeout.current);
    },
    []
  );

  function startAddressLookup() {
    return {
      requestId: ++reverseGeocodeRequestId.current,
      editVersion: addressEditVersion.current,
    };
  }

  function isLookupCurrent(lookup: { requestId: number; editVersion: number }) {
    return (
      lookup.requestId === reverseGeocodeRequestId.current &&
      lookup.editVersion === addressEditVersion.current
    );
  }

  async function useCurrentLocation() {
    dispatch({ type: 'setBusy', busy: true });
    const lookup = startAddressLookup();
    try {
      const result = await getCurrentLocationReportData();
      if (result.status === 'denied') {
        Alert.alert('Location skipped', 'Enter the address manually to continue.', [
          { text: 'Enter manually', style: 'cancel' },
          { text: 'Open Settings', onPress: openAppSettings },
        ]);
        return;
      }

      dispatch({ type: 'setPinLocation', latitude: result.latitude, longitude: result.longitude });
      if (result.address && isLookupCurrent(lookup)) {
        dispatch({ type: 'setResolvedAddress', address: result.address });
      }
    } catch {
      Alert.alert('Location unavailable', 'Enter the address manually to continue.');
    } finally {
      dispatch({ type: 'setBusy', busy: false });
    }
  }

  /** Sets the pin and looks up its address after the map settles. */
  function setPin(latitude: number, longitude: number) {
    dispatch({ type: 'setPinLocation', latitude, longitude });
    const lookup = startAddressLookup();

    if (reverseGeocodeTimeout.current) clearTimeout(reverseGeocodeTimeout.current);
    reverseGeocodeTimeout.current = setTimeout(async () => {
      const address = await reverseGeocodeReportAddress(latitude, longitude);
      if (address && isLookupCurrent(lookup)) {
        dispatch({ type: 'setResolvedAddress', address });
      }
    }, REVERSE_GEOCODE_DELAY_MS);
  }

  function setAddress(address: string) {
    addressEditVersion.current += 1;
    dispatch({ type: 'setAddress', address });
  }

  return {
    pinRegion,
    setAddress,
    updatePinFromMap: (region: Region) => setPin(region.latitude, region.longitude),
    useCurrentLocation,
  };
}
