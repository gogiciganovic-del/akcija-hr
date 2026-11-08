import { Heart } from "lucide-react";

/**
 * Shared stil za praćenje cijene (SearchPage sken + ProductSheet redovna).
 * @param {{
 *   tracking: boolean,
 *   onClick: () => void,
 *   labelIdle?: string,
 *   labelTracking?: string,
 *   disabled?: boolean,
 * }} props
 */
export function TrackPriceButton({
  tracking,
  onClick,
  labelIdle = "Prati cijenu",
  labelTracking = "Prati se u favoritima",
  disabled = false,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
      style={{
        background: tracking ? "rgba(255,255,255,0.05)" : "rgba(0,255,136,0.1)",
        border: tracking
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(0,255,136,0.28)",
        color: tracking ? "rgba(255,255,255,0.7)" : "#00ff88",
        fontSize: 13,
        opacity: disabled ? 0.7 : 1,
      }}
    >
      <Heart
        size={15}
        fill={tracking ? "#ff6b6b" : "none"}
        stroke={tracking ? "#ff6b6b" : "#00ff88"}
      />
      {tracking ? labelTracking : labelIdle}
    </button>
  );
}
