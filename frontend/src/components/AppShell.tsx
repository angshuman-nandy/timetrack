import type { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { OfflineBanner } from "./OfflineBanner";
import styles from "./AppShell.module.css";

interface AppShellProps {
  children: ReactNode;
  showNav?: boolean;
  /** For screens (like Today) that need a fixed action bar sitting above the nav,
   * inside the safe scroll boundary but outside the scrolling content. */
  fixedFooter?: ReactNode;
}

export function AppShell({ children, showNav = true, fixedFooter }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.statusSpacer} />
      <OfflineBanner />
      <div className={styles.scrollArea}>{children}</div>
      {fixedFooter}
      {showNav && <BottomNav />}
    </div>
  );
}
