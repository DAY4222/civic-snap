import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { type Region } from '@/components/CivicMap';
import { CITY, isWithinBounds } from '@/lib/city';

import type { PinSource } from './reportWizardState';
import { getCurrentLocationReportData, reverseGeocodeReportAddress } from './reportWizardServices';
import { openAppSettings, type WizardStore } from './wizardTypes';

const BLOCK_LEVEL_DELTA = 0.0012;
const REVERSE_GEOCODE_DELAY_MS = 450;

/** The phone's location lookup: running, refused in Settings, or failed. */
export type LocationStatus = 'idle' | 'locating' | 'denied' | 'unavailable';

/**
 * The location step's pin and address. The pin comes from the photo's GPS, the phone's location
 * or the user moving the map. A looked-up address only fills the field when the user hasn't
 * typed since the lookup started.
 */
export function useLocationPin({ state, dispatch }: WizardStore) {
  const { draft } = state;
  const hasPin = draft.latitude != null && draft.longitude != null;
  const [status, setStatus] = useState<LocationStatus>('idle');
  const addressEditVersion = useRef(0);
  const reverseGeocodeRequestId = useRef(0);
  const reverseGeocodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinVersion = useRef(0);
  const triedPhoneLocation = useRef(false);

  const pinRegion = useMemo<Region | null>(() => {
    if (draft.latitude == null || draft.longitude == null) return null;

    return {
      latitude: draft.latitude,
      longitude: draft.longitude,
      latitudeDelta: BLOCK_LEVEL_DELTA,
      longitudeDelta: BLOCK_LEVEL_DELTA,
    };
  }, [draft.latitude, draft.longitude]);

  const outsideCity =
    draft.latitude != null &&
    draft.longitude != null &&
    !isWithinBounds(draft.latitude, draft.longitude, CITY.bounds);

  useEffect(
    () => () => {
      if (reverseGeocodeTimeout.current) clearTimeout(reverseGeocodeTimeout.current);
    },
    []
  );

  // Reaching Location without a pin: try the phone's location once, without alerts.
  useEffect(() => {
    if (state.step !== 'location' || hasPin || triedPhoneLocation.current) return;
    triedPhoneLocation.current = true;
    void locate({ quiet: true });
  });

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

  /** Moves the pin to the phone's location. Quiet lookups never override a pin set meanwhile. */
  async function locate({ quiet }: { quiet: boolean }) {
    setStatus('locating');
    const versionAtStart = pinVersion.current;
    const lookup = startAddressLookup();
    try {
      const result = await getCurrentLocationReportData();
      if (result.status === 'denied') {
        setStatus('denied');
        if (!quiet) {
          Alert.alert('Location is off', 'Move the map to the spot, or type the address.', [
            { text: 'OK', style: 'cancel' },
            { text: 'Open Settings', onPress: openAppSettings },
          ]);
        }
        return;
      }

      setStatus('idle');
      if (quiet && versionAtStart !== pinVersion.current) return;

      pinVersion.current += 1;
      dispatch({
        type: 'setPinLocation',
        latitude: result.latitude,
        longitude: result.longitude,
        source: 'device',
      });
      if (result.address && isLookupCurrent(lookup)) {
        dispatch({ type: 'setResolvedAddress', address: result.address });
      }
    } catch {
      setStatus('unavailable');
      if (!quiet) Alert.alert('Location unavailable', 'Move the map to the spot, or type the address.');
    }
  }

  /** Sets the pin and looks up its address; after a map move, once the map has settled. */
  function placePin(latitude: number, longitude: number, source: PinSource) {
    pinVersion.current += 1;
    dispatch({ type: 'setPinLocation', latitude, longitude, source });
    const lookup = startAddressLookup();

    if (reverseGeocodeTimeout.current) clearTimeout(reverseGeocodeTimeout.current);
    reverseGeocodeTimeout.current = setTimeout(
      async () => {
        const address = await reverseGeocodeReportAddress(latitude, longitude);
        if (address && isLookupCurrent(lookup)) {
          dispatch({ type: 'setResolvedAddress', address });
        }
      },
      source === 'map' ? REVERSE_GEOCODE_DELAY_MS : 0
    );
  }

  function setAddress(address: string) {
    addressEditVersion.current += 1;
    dispatch({ type: 'setAddress', address });
  }

  return {
    locationStatus: status,
    outsideCity,
    pinRegion,
    placePin,
    setAddress,
    updatePinFromMap: (region: Region) => placePin(region.latitude, region.longitude, 'map'),
    useCurrentLocation: () => locate({ quiet: false }),
  };
}
