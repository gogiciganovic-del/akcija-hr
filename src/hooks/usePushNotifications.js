import { useCallback, useEffect, useRef, useState } from "react";
import { classifyPushEnableFailure } from "../lib/pushEnableFailure";
import {
  barcodesFromFavorites,
  enablePushNotifications,
  getNotificationPermission,
  isPushSupported,
  syncPushTrackedBarcodes,
} from "../lib/pushNotifications";
import {
  trackPushGreska,
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

  const enable = useCallback(async () => {
    if (busy) return;
    trackPushKlik();
    setBusy(true);
    setError(null);
    try {
      const barcodes = barcodesFromFavorites(favorites);
      await enablePushNotifications(barcodes);
      setStatus("subscribed");
      trackPushUkljucen();
    } catch (e) {
      const code = e?.code || Notification.permission;
      const { setDenied, event } = classifyPushEnableFailure(
        code,
        Notification.permission
      );
      if (setDenied) setStatus("denied");
      if (event === "push_odbijen") trackPushOdbijen();
      else trackPushGreska();
      setError(e?.message || "Pretplata nije uspjela");
    } finally {
      setBusy(false);
    }
  }, [busy, favorites]);

  return { status, busy, error, enable, refreshStatus };
}
