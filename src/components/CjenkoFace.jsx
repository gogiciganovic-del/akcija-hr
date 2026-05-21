/** Samo Cjenko smajlić (bez wordmarka). */
export function CjenkoFace({ size = 68, showTag = false }) {
  return (
    <svg
      viewBox="0 0 68 68"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      <rect x="0" y="0" width="68" height="68" rx="34" fill="#EF9F27" />
      <ellipse cx="22" cy="26" rx="5.5" ry="6" fill="#633806" />
      <ellipse cx="46" cy="26" rx="5.5" ry="6" fill="#633806" />
      <path
        d="M 19 36 Q 34 52 49 36"
        fill="none"
        stroke="#633806"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {showTag && (
        <>
          <rect x="18" y="48" width="32" height="14" rx="4" fill="#633806" />
          <text
            x="34"
            y="58.5"
            textAnchor="middle"
            fill="#EF9F27"
            fontSize="9"
            fontWeight="700"
            fontFamily="'DM Sans', 'Inter', system-ui, sans-serif"
          >
            -50%
          </text>
        </>
      )}
    </svg>
  );
}
