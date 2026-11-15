import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { STORES } from "../lib/constants";
import { FLYER_FOLLOW_CHAINS } from "../lib/pushFlyerFollow";
import { writePreferredStores, markOnboardingDone } from "../lib/onboardingGate";
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

/** @param {string[]} chains */
function formatFlyerChainsLabel(chains) {
  const list = Array.isArray(chains) ? chains.filter(Boolean) : [];
  if (list.length === 0) return "";
  if (list.length === 1) return `Za ${list[0]}`;
  if (list.length === 2) return `Za ${list[0]} i ${list[1]}`;
  return `Za ${list.slice(0, -1).join(", ")} i ${list[list.length - 1]}`;
}

/**
 * Jedan sheet: trgovine + opcionalni prekidač za letak.
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
  const [selectedStores, setSelectedStores] = useState([]);
  const [notifyOn, setNotifyOn] = useState(false);
  const [busy, setBusy] = useState(false);

  const flyerEligible = useMemo(
    () =>
      FLYER_FOLLOW_CHAINS.filter((id) => selectedStores.includes(id)),
    [selectedStores]
  );
  const showNotifyToggle = flyerEligible.length > 0;
  const flyerLabel = formatFlyerChainsLabel(flyerEligible);

  useEffect(() => {
    if (!open) return;
    finishedRef.current = false;
    setSelectedStores([]);
    setNotifyOn(false);
    setBusy(false);
    trackOnboardingPrikazan();
    trackOnboardingKorak(1);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector("button")?.focus?.();
    }, 50);
    return () => window.clearTimeout(t);
  }, [open]);

  // Nestane eligible lanaca → ugasi prekidač (bez auto-push).
  useEffect(() => {
    if (!showNotifyToggle && notifyOn) setNotifyOn(false);
  }, [showNotifyToggle, notifyOn]);

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

  const onEnablePush = async (chains) => {
    const barcodes = barcodesFromFavorites(favorites);
    const follow = chains.filter((c) => FLYER_FOLLOW_CHAINS.includes(c));
    trackPushKlik();
    await enablePushNotifications(barcodes);
    trackPushUkljucen();
    for (const chain of follow) {
      try {
        const res = await followChain(chain, { trackedBarcodes: barcodes });
        if (res?.ok) trackLetakPratim();
      } catch {
        // tiho
      }
    }
  };

  const onToggleNotify = async () => {
    if (busy || !showNotifyToggle) return;
    if (notifyOn) {
      setNotifyOn(false);
      return;
    }
    // Uključivanje samo na eksplicitni dodir — nikad automatski.
    setBusy(true);
    try {
      await onEnablePush(flyerEligible);
      setNotifyOn(true);
    } catch (e) {
      setNotifyOn(false);
      const code =
        e?.code ||
        (typeof Notification !== "undefined" ? Notification.permission : "");
      const { event } = classifyPushEnableFailure(
        code,
        typeof Notification !== "undefined" ? Notification.permission : ""
      );
      if (event === "push_odbijen") trackPushOdbijen();
      else trackPushGreska();
    } finally {
      setBusy(false);
    }
  };

  const onDone = () => {
    if (busy) return;
    writePreferredStores(selectedStores);
    finishCompleteAndBack();
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
            Gdje kupuješ?
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

        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: 12,
            marginBottom: 10,
          }}
        >
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

        {showNotifyToggle ? (
          <button
            type="button"
            role="switch"
            aria-checked={notifyOn}
            data-testid="onboarding-flyer-toggle"
            disabled={busy}
            onClick={onToggleNotify}
            className="w-full rounded-xl px-3 mb-3 flex items-center justify-between gap-3 text-left"
            style={{
              minHeight: BTN_MIN + 8,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              opacity: busy ? 0.75 : 1,
            }}
          >
            <span className="flex flex-col gap-0.5 min-w-0">
              <span
                className="font-semibold"
                style={{ color: "#fff", fontSize: 13 }}
              >
                Javi mi kad izađe novi letak
              </span>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
                {flyerLabel}
              </span>
            </span>
            <span
              aria-hidden
              className="shrink-0 rounded-full relative"
              style={{
                width: 44,
                height: 26,
                background: notifyOn ? "#00ff88" : "rgba(255,255,255,0.18)",
                transition: "background 0.15s ease",
              }}
            >
              <span
                className="absolute top-0.5 rounded-full"
                style={{
                  width: 22,
                  height: 22,
                  background: notifyOn ? "#020617" : "#fff",
                  left: notifyOn ? 20 : 2,
                  transition: "left 0.15s ease",
                }}
              />
            </span>
          </button>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            data-testid="onboarding-skip"
            disabled={busy}
            onClick={finishSkipAndBack}
            className="flex-1 rounded-xl font-semibold"
            style={{
              minHeight: BTN_MIN,
              color: "rgba(255,255,255,0.55)",
              background: "rgba(255,255,255,0.06)",
              opacity: busy ? 0.7 : 1,
            }}
          >
            Preskoči
          </button>
          <button
            type="button"
            data-testid="onboarding-done"
            disabled={busy}
            onClick={onDone}
            className="flex-1 rounded-xl font-bold"
            style={{
              minHeight: BTN_MIN,
              color: "#020617",
              background: "#00ff88",
              opacity: busy ? 0.7 : 1,
            }}
          >
            Gotovo
          </button>
        </div>
      </div>
    </div>
  );
}
