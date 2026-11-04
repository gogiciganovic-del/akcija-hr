import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { STORES } from "../lib/constants";
import { FLYER_FOLLOW_CHAINS } from "../lib/pushFlyerFollow";
import {
  writeInterest,
  writePreferredStores,
} from "../lib/onboardingGate";
import {
  barcodesFromFavorites,
  enablePushNotifications,
  followChain,
} from "../lib/pushNotifications";
import { classifyPushEnableFailure } from "../lib/pushEnableFailure";
import {
  trackLetakPratim,
  trackOnboardingKorak,
  trackOnboardingPrikazan,
  trackOnboardingPreskocen,
  trackOnboardingZavrsen,
  trackPushGreska,
  trackPushKlik,
  trackPushOdbijen,
  trackPushUkljucen,
} from "../lib/usageEvents";
import { markOnboardingDone } from "../lib/onboardingGate";

const INTEREST_OPTIONS = [
  { id: "hrana", label: "Hrana i piće" },
  { id: "higijena", label: "Higijena i kućanstvo" },
  { id: "sve", label: "Sve" },
];

const BTN_MIN = 44;

/** Svijetla podloga čipa → tamni tekst (npr. Kaufland žuta). */
function chipForeground(bgHex) {
  const raw = String(bgHex || "").replace("#", "").trim();
  if (raw.length !== 6) return "#fff";
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  if (![r, g, b].every((n) => Number.isFinite(n))) return "#fff";
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#020617" : "#fff";
}

/**
 * Donji sheet (fixed) — ne gura layout. Zatvaranje uvijek označi done.
 */
export function OnboardingSheet({
  open,
  favorites = null,
  onClosed,
  returnFocusEl = null,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const finishedRef = useRef(false);
  const [step, setStep] = useState(1);
  const [selectedStores, setSelectedStores] = useState([]);
  const [interest, setInterest] = useState("sve");
  const [flyerChains, setFlyerChains] = useState(() => [...FLYER_FOLLOW_CHAINS]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    finishedRef.current = false;
    setStep(1);
    setSelectedStores([]);
    setInterest("sve");
    setFlyerChains([]);
    setBusy(false);
    trackOnboardingPrikazan();
    trackOnboardingKorak(1);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector("button")?.focus?.();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Predodabir: samo korak 1 ∩ Eurospin/Kaufland/Plodine; inače sva tri isključena.
    if (step === 3) {
      const fromStep1 = selectedStores.filter((id) =>
        FLYER_FOLLOW_CHAINS.includes(id)
      );
      setFlyerChains(fromStep1);
    }
  }, [step, selectedStores, open]);

  const restoreFocus = useCallback(() => {
    try {
      const el = returnFocusEl?.current ?? returnFocusEl;
      if (el && typeof el.focus === "function") {
        el.focus({ preventScroll: true });
        return;
      }
      document.getElementById("cjenko-main")?.focus?.({ preventScroll: true });
    } catch {
      // ignore
    }
  }, [returnFocusEl]);

  const finishSkip = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markOnboardingDone();
    trackOnboardingPreskocen();
    onClosed?.({ reason: "skip" });
    restoreFocus();
  }, [onClosed, restoreFocus]);

  const finishComplete = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    markOnboardingDone();
    trackOnboardingZavrsen();
    onClosed?.({ reason: "complete" });
    restoreFocus();
  }, [onClosed, restoreFocus]);

  // History entry + Android / browser Natrag → isti skip put.
  useEffect(() => {
    if (!open) return;
    const prev = window.history.state;
    window.history.pushState(
      { ...(prev && typeof prev === "object" ? prev : {}), onboarding: true },
      "",
      window.location.href
    );
    const onPopState = () => {
      if (finishedRef.current) return;
      finishSkip();
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [open, finishSkip]);

  const finishSkipAndBack = useCallback(() => {
    const had = Boolean(window.history.state?.onboarding);
    finishSkip();
    if (had) {
      try {
        window.history.back();
      } catch {
        // ignore
      }
    }
  }, [finishSkip]);

  const finishCompleteAndBack = useCallback(() => {
    const had = Boolean(window.history.state?.onboarding);
    finishComplete();
    if (had) {
      try {
        window.history.back();
      } catch {
        // ignore
      }
    }
  }, [finishComplete]);

  const toggleStore = (id) => {
    setSelectedStores((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleFlyer = (id) => {
    setFlyerChains((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const goNextFrom1 = () => {
    writePreferredStores(selectedStores);
    setStep(2);
    trackOnboardingKorak(2);
  };

  const goNextFrom2 = () => {
    writeInterest(interest);
    setStep(3);
    trackOnboardingKorak(3);
  };

  const onEnablePush = async () => {
    if (busy) return;
    setBusy(true);
    const barcodes = barcodesFromFavorites(favorites);
    const chains = flyerChains.filter((c) => FLYER_FOLLOW_CHAINS.includes(c));
    try {
      trackPushKlik();
      await enablePushNotifications(barcodes);
      trackPushUkljucen();
      for (const chain of chains) {
        try {
          const res = await followChain(chain, { trackedBarcodes: barcodes });
          if (res?.ok) trackLetakPratim();
        } catch {
          // tiho — završi onboarding
        }
      }
    } catch (e) {
      const code = e?.code || (typeof Notification !== "undefined" ? Notification.permission : "");
      const { event } = classifyPushEnableFailure(
        code,
        typeof Notification !== "undefined" ? Notification.permission : ""
      );
      if (event === "push_odbijen") trackPushOdbijen();
      else trackPushGreska();
    } finally {
      setBusy(false);
      finishCompleteAndBack();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex flex-col justify-end"
      role="presentation"
      data-testid="onboarding-root"
    >
      <button
        type="button"
        aria-label="Zatvori uvod"
        className="absolute inset-0 border-0 p-0 cursor-default"
        style={{ background: "rgba(0,0,0,0.45)" }}
        data-testid="onboarding-backdrop"
        onClick={finishSkipAndBack}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="onboarding-sheet"
        className="relative w-full max-w-sm mx-auto rounded-t-3xl px-4 pt-3 pb-3"
        style={{
          marginBottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          background: "#0b1224",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          boxShadow: "0 -12px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <p
            id={titleId}
            className="font-bold"
            style={{ color: "#fff", fontSize: 16 }}
          >
            {step === 1 && "Koje trgovine često koristiš?"}
            {step === 2 && "Što te zanima?"}
            {step === 3 && "Obavijesti o akcijama"}
          </p>
          <button
            type="button"
            aria-label="Preskoči uvod"
            data-testid="onboarding-close"
            onClick={finishSkipAndBack}
            className="flex items-center justify-center rounded-xl"
            style={{
              minWidth: BTN_MIN,
              minHeight: BTN_MIN,
              color: "rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.06)",
            }}
          >
            <X size={20} />
          </button>
        </div>

        {step === 1 && (
          <>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 10 }}>
              Odaberi jednu ili više — možeš kasnije promijeniti.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {STORES.map((store) => {
                const on = selectedStores.includes(store.id);
                return (
                  <button
                    key={store.id}
                    type="button"
                    onClick={() => toggleStore(store.id)}
                    className="rounded-xl font-semibold"
                    style={{
                      minHeight: BTN_MIN,
                      fontSize: 12,
                      color: on
                        ? chipForeground(store.color)
                        : "rgba(255,255,255,0.65)",
                      background: on ? store.color : "rgba(255,255,255,0.06)",
                      border: on
                        ? `1px solid ${store.color}`
                        : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {store.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="onboarding-skip"
                onClick={finishSkipAndBack}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  minHeight: BTN_MIN,
                  color: "rgba(255,255,255,0.55)",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                Preskoči
              </button>
              <button
                type="button"
                data-testid="onboarding-next"
                onClick={goNextFrom1}
                className="flex-1 rounded-xl font-bold"
                style={{
                  minHeight: BTN_MIN,
                  color: "#020617",
                  background: "#00ff88",
                }}
              >
                Dalje
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 10 }}>
              Odaberi što ti je bitnije u trgovini.
            </p>
            <div className="flex flex-col gap-2 mb-3">
              {INTEREST_OPTIONS.map((opt) => {
                const on = interest === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setInterest(opt.id)}
                    className="rounded-xl font-semibold text-left px-3 flex items-center justify-between gap-2"
                    style={{
                      minHeight: BTN_MIN,
                      fontSize: 14,
                      color: on ? "#fff" : "rgba(255,255,255,0.75)",
                      background: "rgba(255,255,255,0.06)",
                      border: on
                        ? "2px solid rgba(255,255,255,0.55)"
                        : "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    <span>{opt.label}</span>
                    {on ? (
                      <Check size={18} strokeWidth={2.5} aria-hidden />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={finishSkipAndBack}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  minHeight: BTN_MIN,
                  color: "rgba(255,255,255,0.55)",
                  background: "rgba(255,255,255,0.06)",
                }}
              >
                Preskoči
              </button>
              <button
                type="button"
                data-testid="onboarding-next"
                onClick={goNextFrom2}
                className="flex-1 rounded-xl font-bold"
                style={{
                  minHeight: BTN_MIN,
                  color: "#020617",
                  background: "#00ff88",
                }}
              >
                Dalje
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 13, marginBottom: 10 }}>
              Javimo ti kad se pojave nove akcije: Eurospin, Kaufland, Plodine.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {FLYER_FOLLOW_CHAINS.map((id) => {
                const meta = STORES.find((s) => s.id === id);
                const on = flyerChains.includes(id);
                const bg = meta?.color || "#334155";
                const fg = on ? chipForeground(bg) : "rgba(255,255,255,0.45)";
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleFlyer(id)}
                    className="rounded-xl font-semibold px-3 flex items-center gap-1.5"
                    style={{
                      minHeight: BTN_MIN,
                      fontSize: 13,
                      color: fg,
                      background: on ? bg : "rgba(255,255,255,0.06)",
                      border: on
                        ? `1px solid ${bg}`
                        : "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {on ? (
                      <Check size={16} strokeWidth={2.5} aria-hidden color={fg} />
                    ) : null}
                    {id}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="onboarding-push-later"
                disabled={busy}
                onClick={finishCompleteAndBack}
                className="flex-1 rounded-xl font-semibold"
                style={{
                  minHeight: BTN_MIN,
                  color: "rgba(255,255,255,0.55)",
                  background: "rgba(255,255,255,0.06)",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                Ne sada
              </button>
              <button
                type="button"
                data-testid="onboarding-push-enable"
                disabled={busy || flyerChains.length === 0}
                onClick={onEnablePush}
                className="flex-1 rounded-xl font-bold"
                style={{
                  minHeight: BTN_MIN,
                  color: "#020617",
                  background: "#00ff88",
                  opacity: busy || flyerChains.length === 0 ? 0.7 : 1,
                }}
              >
                {busy ? "…" : "Uključi"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
