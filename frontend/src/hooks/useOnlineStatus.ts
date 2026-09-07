import { useEffect, useState } from "react";

/** Real connectivity, not a guess — navigator.onLine plus the online/offline events. A
 * failed fetch elsewhere in the app can also report offline via the same setter if a
 * caller wants finer-grained detection; this hook alone covers the common case. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return online;
}
