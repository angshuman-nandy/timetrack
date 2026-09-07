import { useOnlineStatus } from "../hooks/useOnlineStatus";
import styles from "./OfflineBanner.module.css";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.dot} />
      <span className={styles.text}>
        Offline. Times are saved on this phone and will sync when you reconnect.
      </span>
    </div>
  );
}
