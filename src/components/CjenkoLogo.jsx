import { CjenkoFace } from "./CjenkoFace";

/** Cjenko brand mark — smajlić + wordmark. */
export function CjenkoLogo({ height = 32 }) {
  return (
    <div className="flex items-center" style={{ gap: height * 0.2 }} role="img" aria-label="Cjenko">
      <CjenkoFace size={height} showTag />
      <span
        style={{
          color: "#633806",
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
