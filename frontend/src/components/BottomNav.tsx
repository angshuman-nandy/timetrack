import { Clock, CalendarDays, Download } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import styles from "./BottomNav.module.css";

const ITEMS = [
  { to: "/", label: "Today", Icon: Clock, isActive: (path: string) => path === "/" },
  // Day detail keeps Calendar active (per design) even though its own route is /day/:date.
  { to: "/calendar", label: "Calendar", Icon: CalendarDays, isActive: (path: string) => path.startsWith("/calendar") || path.startsWith("/day") },
  { to: "/export", label: "Export", Icon: Download, isActive: (path: string) => path.startsWith("/export") },
];

export function BottomNav() {
  const { pathname } = useLocation();

  return (
    <nav className={styles.nav}>
      {ITEMS.map(({ to, label, Icon, isActive }) => {
        const active = isActive(pathname);
        return (
          <Link
            key={to}
            to={to}
            className={`${styles.item} ${active ? styles.active : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon className={styles.icon} strokeWidth={1.75} />
            <span className={styles.label}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
