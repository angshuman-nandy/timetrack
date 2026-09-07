import styles from "./SkeletonLines.module.css";

const DEFAULT_WIDTHS = ["92%", "78%", "56%"];

export function SkeletonLines({ widths = DEFAULT_WIDTHS }: { widths?: string[] }) {
  return (
    <>
      {widths.map((w, i) => (
        <div key={i} className={styles.line} style={{ width: w, animationDelay: `${i * 0.2}s` }} />
      ))}
    </>
  );
}
