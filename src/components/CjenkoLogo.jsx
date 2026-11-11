import { CjenkoFace } from "./CjenkoFace";

/** Cjenko brand mark — smajlić + wordmark. */
export function CjenkoLogo({ height = 32 }) {
  return (
    <div className="flex items-center" style={{ gap: height * 0.2 }} role="img" aria-label="Cjenko">
      <CjenkoFace size={height} showTag />
      <span
        style={{
          // Brand narančasta na tamnoj pozadini (#020617) — čitljivo (~4.5:1+)
          color: "#EF9F27",
          fontSize: height * 0.97,
          fontWeight: 700,
          fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        Cjenko
      </span>
    </div>
  );
}
