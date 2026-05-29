'use client';

import { useEffect, useState } from "react";

// SSR-safe online/offline status. Defaults to true on the server (and first
// client render, to match SSR) so nothing flashes an offline state during
// hydration. navigator.onLine and the event listeners are only touched inside
// useEffect, on the client.
export function useOnlineStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
