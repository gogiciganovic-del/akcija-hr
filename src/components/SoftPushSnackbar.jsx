/**
 * Neagresivna traka za soft push — ne modal.
 */
export function SoftPushSnackbar({
  open,
  message,
  busy = false,
  feedback = null,
  onEnable,
  onDismiss,
}) {
  if (!open || !message) return null;

  return (
    <div
      className="fixed left-1/2 z-[88] px-3 py-2.5 rounded-2xl flex flex-col gap-2"
      data-testid="soft-push-snackbar"
      style={{
        bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 12px)",
        transform: "translateX(-50%)",
        width: "min(360px, calc(100% - 24px))",
        background: "rgba(11,18,36,0.96)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.4)",
      }}
      role="status"
    >
      <p style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, lineHeight: 1.4, margin: 0 }}>
        {message}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="soft-push-dismiss"
          disabled={busy}
          onClick={onDismiss}
          className="flex-1 rounded-xl font-semibold"
          style={{
            minHeight: 40,
            color: "rgba(255,255,255,0.65)",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.1)",
            fontSize: 13,
            opacity: busy ? 0.7 : 1,
          }}
        >
          Ne sada
        </button>
        <button
          type="button"
          data-testid="soft-push-enable"
          disabled={busy}
          onClick={onEnable}
          className="flex-1 rounded-xl font-bold"
          style={{
            minHeight: 40,
            color: "#020617",
            background: "#00ff88",
            border: "1px solid rgba(0,255,136,0.5)",
            fontSize: 13,
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "…" : "Obavijesti me"}
        </button>
      </div>
      {feedback ? (
        <p
          style={{ color: "rgba(255,107,107,0.9)", fontSize: 11, lineHeight: 1.35, margin: 0 }}
          role="status"
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
