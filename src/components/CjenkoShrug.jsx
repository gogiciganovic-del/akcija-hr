/** Cjenko smajlić koji slegne ramenima. */
export function CjenkoShrug({ size = 64 }) {
  return (
    <svg
      viewBox="0 0 68 68"
      width={size}
      height={size}
      style={{ display: "block", flexShrink: 0 }}
      aria-hidden
    >
      <rect x="0" y="0" width="68" height="68" rx="34" fill="#EF9F27" />
      {/* Ramena */}
      <path
        d="M 4 30 Q 10 14 20 22"
        fill="none"
        stroke="#633806"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 64 30 Q 58 14 48 22"
        fill="none"
        stroke="#633806"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <ellipse cx="22" cy="28" rx="5" ry="5.5" fill="#633806" />
      <ellipse cx="46" cy="28" rx="5" ry="5.5" fill="#633806" />
      <path
        d="M 24 40 Q 34 36 44 40"
        fill="none"
        stroke="#633806"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
