import { useCallback, useEffect, useRef, useState } from "react";
import { classifyPushEnableFailure } from "../lib/pushEnableFailure";
import {
  barcodesFromFavorites,
  disablePushNotifications,
  enablePushNotifications,
  getNotificationPermission,
  isPushSupported,
  syncPushTrackedBarcodes,
} from "../lib/pushNotifications";
import { isTrackableBarcode } from "../lib/pushTrackedBarcodes";
import {
  trackPushGreska,
  trackPushIskljucen,
  trackPushKlik,
  trackPushOdbijen,
  trackPushUkljucen,
} from "../lib/usageEvents";

/**
 * @param {Map<string, any>} favorites
 * @param {boolean} [favoritesLoading=false]
 */
export function usePushNotifications(favorites, favoritesLoading = false) {
  const [status, setStatus] = useState(() => {
    if (!isPushSupported()) return "unsupported";
    const p = getNotificationPermission();
    if (p === "denied") return "denied";
    if (p === "granted") return "subscribed";
    return "prompt";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const refreshStatus = useCallback(async () => {
    if (!isPushSupported()) {
      setStatus("unsupported");
      return;
    }
    const p = Notification.permission;
    if (p === "denied") {
      setStatus("denied");
      return;
    }
    if (p === "granted") {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "subscribed" : "prompt");
      } catch {
        setStatus("prompt");
      }
      return;
    }
    setStatus("prompt");
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Sinkroniziraj barkodove kad se favoriti mijenjaju (localStorage ostaje u useFavorites).
  // Čekaj kraj učitavanja — inače mount s praznim Mapom upisuje tracked_barcodes=[].
  const initialSyncDoneRef = useRef(false);
  useEffect(() => {
    if (favoritesLoading) return;
    if (!(favorites instanceof Map)) return;
    const isInitialLoad = !initialSyncDoneRef.current;
    initialSyncDoneRef.current = true;
    syncPushTrackedBarcodes(favorites, { isInitialLoad });
  }, [favorites, favoritesLoading]);

  /**
   * @param {{ extraBarcodes?: string[] }} [opts]
   * @returns {Promise<{ ok: boolean, error?: Error|null }|void>}
   */
  const enable = useCallback(
    async (opts = {}) => {
      if (busy) return { ok: false, error: new Error("busy") };
      trackPushKlik();
      setBusy(true);
      setError(null);
      try {
        const merged = new Set(barcodesFromFavorites(favorites));
        for (const raw of opts.extraBarcodes || []) {
          const bc = String(raw || "").trim();
          if (isTrackableBarcode(bc)) merged.add(bc);
        }
        await enablePushNotifications([...merged]);
        setStatus("subscribed");
        trackPushUkljucen();
        return { ok: true };
      } catch (e) {
        const code = e?.code || Notification.permission;
        const { setDenied, event } = classifyPushEnableFailure(
          code,
          Notification.permission
        );
        if (setDenied) setStatus("denied");
        if (event === "push_odbijen") trackPushOdbijen();
        else trackPushGreska();
        const err =
          e instanceof Error
            ? e
            : new Error(e?.message || "Pretplata nije uspjela");
        setError(err.message || "Pretplata nije uspjela");
        return { ok: false, error: err };
      } finally {
        setBusy(false);
      }
    },
    [busy, favorites]
  );

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { remoteOk } = await disablePushNotifications();
      setStatus("prompt");
      trackPushIskljucen();
      if (!remoteOk) {
        setError(
          "Brisanje na poslužitelju nije uspjelo. Na ovom uređaju su obavijesti isključene."
        );
      }
    } catch {
      setStatus("prompt");
      setError(
        "Brisanje na poslužitelju nije uspjelo. Na ovom uređaju su obavijesti isključene."
      );
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return { status, busy, error, enable, disable, refreshStatus };
}
