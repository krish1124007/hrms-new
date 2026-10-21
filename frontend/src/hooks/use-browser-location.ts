import { useCallback, useState } from 'react';

export interface BrowserFix {
  lat: number;
  lng: number;
  accuracy: number;
}

type State =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ok'; fix: BrowserFix }
  | { status: 'error'; message: string };

const MESSAGES: Record<number, string> = {
  1: 'Location permission was denied — allow it in the browser to record where you are.',
  2: 'Your position could not be determined.',
  3: 'Finding your position took too long.',
};

/** One GPS fix from the browser, on request (for visit check-in / check-out). */
export function useBrowserLocation() {
  const [state, setState] = useState<State>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'error', message: 'This browser cannot share its location.' });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setState({
          status: 'ok',
          fix: {
            lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
            lng: Math.round(pos.coords.longitude * 1e6) / 1e6,
            accuracy: Math.round(pos.coords.accuracy),
          },
        }),
      (err) => setState({ status: 'error', message: MESSAGES[err.code] ?? 'Location unavailable.' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { ...state, fix: state.status === 'ok' ? state.fix : undefined, request, reset };
}
