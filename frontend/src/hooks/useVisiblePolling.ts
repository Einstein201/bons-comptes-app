'use client';

import { useEffect, useRef } from 'react';

export const SHARED_DATA_REFRESH_INTERVAL_MS = 10_000;

export function useVisiblePolling(
  refresh: () => Promise<void>,
  intervalMs = SHARED_DATA_REFRESH_INTERVAL_MS,
): void {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let inFlight = false;

    function runRefresh() {
      if (document.visibilityState !== 'visible' || inFlight) return;

      inFlight = true;
      void refreshRef.current()
        .catch((error: unknown) => console.error(error))
        .finally(() => {
          inFlight = false;
        });
    }

    const timer = window.setInterval(runRefresh, intervalMs);
    document.addEventListener('visibilitychange', runRefresh);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', runRefresh);
    };
  }, [intervalMs]);
}
