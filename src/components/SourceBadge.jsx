import { trackTapRedovna } from "../lib/usageEvents";

/** REDOVNA / AKCIJA — Search, Cart, ProductSheet, Favorites. */
export function SourceBadge({ source }) {
  if (source !== "sale" && source !== "regular") return null;
  const isRegular = source === "regular";
  return (
    <span
      className="flex-shrink-0 font-bold rounded px-1.5 py-0.5"
      style={{
        fontSize: 9,
        letterSpacing: "0.04em",
        color: isRegular ? "rgba(255,255,255,0.85)" : "#633806",
        background: isRegular ? "rgba(255,255,255,0.12)" : "rgba(239,159,39,0.95)",
      }}
      onClick={isRegular ? () => trackTapRedovna() : undefined}
    >
      {isRegular ? "REDOVNA" : "AKCIJA"}
    </span>
  );
}
