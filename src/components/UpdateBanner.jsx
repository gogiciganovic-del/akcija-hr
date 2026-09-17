import { useEffect, useState } from "react";

export function UpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onNeedRefresh = () => setVisible(true);
    window.addEventListener("cjenko:need-refresh", onNeedRefresh);
    return () => window.removeEventListener("cjenko:need-refresh", onNeedRefresh);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed left-1/2 z-[45] flex items-center gap-3 px-3 py-2 rounded-2xl"
      style={{
        bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 8px)",
        transform: "translateX(-50%)",
        maxWidth: "min(340px, calc(100% - 24px))",
        width: "calc(100% - 24px)",
        background: "rgba(2,6,23,0.96)",
        border: "1px solid rgba(0,255,136,0.35)",
        color: "#e2e8f0",
        fontSize: 13,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        pointerEvents: "auto",
      }}
      role="status"
    >
      <span className="flex-1 leading-snug">Dostupna je nova verzija — osvježi</span>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("cjenko:apply-update"))}
        className="shrink-0 px-3 py-1.5 rounded-xl font-bold"
        style={{
          background: "rgba(0,255,136,0.2)",
          border: "1px solid rgba(0,255,136,0.45)",
          color: "#00ff88",
          fontSize: 12,
        }}
      >
        Osvježi
      </button>
    </div>
  );
}
