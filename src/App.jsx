import { useState, useCallback, useEffect, useRef } from "react";
import { BottomNav }     from "./components/BottomNav";
import { ProductSheet }  from "./components/ProductSheet";
import { OnboardingSheet } from "./components/OnboardingSheet";
import { SoftPushSnackbar } from "./components/SoftPushSnackbar";
import { HomePage }      from "./pages/HomePage";
import { SearchPage }    from "./pages/SearchPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { CartPage }      from "./pages/CartPage";
import { Admin }         from "./pages/Admin";
import { useFavorites }  from "./hooks/useFavorites";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { UpdateBanner } from "./components/UpdateBanner";
import {
  trackPushSoftKlik,
  trackPushSoftPrikazan,
  trackPushSoftZatvoren,
  trackTabOnce,
} from "./lib/usageEvents";
import {
  ONBOARDING_DELAY_MS,
  shouldShowOnboarding,
} from "./lib/onboardingGate";
import {
  SOFT_PUSH_AUTO_DISMISS_MS,
  markSoftPushPromptDone,
  resolveSoftPushOffer,
  shouldAttemptSoftPushAfterToggle,
  shouldShowSoftPushPrompt,
} from "./lib/softPushPrompt";
import {
  TRACK_REGULAR_DENIED,
  TRACK_REGULAR_ENABLE_FALLBACK,
  trackEnableErrorMessage,
} from "./lib/trackRegularPrice";
import {
  barcodesFromFavorites,
  followChain,
  needsEnableBeforeFollow,
  resolvePushEndpoint,
} from "./lib/pushNotifications";

const VALID_TABS = new Set(["home", "search", "cart", "fav"]);

function tabFromLocation() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  const base = hash.split("?")[0].split("&")[0];
  if (VALID_TABS.has(base)) return base;
  const stateTab = window.history.state?.tab;
  if (VALID_TABS.has(stateTab)) return stateTab;
  return "home";
}

function urlForLocation(tab) {
  const path = `${window.location.pathname}${window.location.search}`;
  if (tab === "home") return path || "/";
  return `${path}#${tab}`;
}

function urlForTab(tab) {
  if (tab === "home") {
    return `${window.location.pathname}${window.location.search}` || "/";
  }
  return `#${tab}`;
}

export default function App() {
  const { favorites, isFav, toggle, clear, loading: favoritesLoading } = useFavorites();
  const {
    status: pushStatus,
    busy: pushBusy,
    error: pushError,
    enable: enablePush,
    disable: disablePush,
  } = usePushNotifications(favorites, favoritesLoading);
  const [activeTab, setActiveTab] = useState(() => tabFromLocation());
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [homeResetSignal, setHomeResetSignal] = useState(0);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [pendingSearchQuery, setPendingSearchQuery] = useState(null);
  const [pendingOpenScanner, setPendingOpenScanner] = useState(false);
  const [scanToast, setScanToast] = useState(null);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [preferredStoresTick, setPreferredStoresTick] = useState(0);
  const [softPushOffer, setSoftPushOffer] = useState(null);
  const [softPushBusy, setSoftPushBusy] = useState(false);
  const [softPushFeedback, setSoftPushFeedback] = useState(null);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const sheetOpenRef = useRef(false);
  const mainRef = useRef(null);
  const onboardingTimerRef = useRef(null);
  const sessionSkipOnboardingRef = useRef(false);
  const sessionSoftPushBlockedRef = useRef(false);
  const pushStatusRef = useRef(pushStatus);
  pushStatusRef.current = pushStatus;
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const cancelOnboardingForSession = useCallback(() => {
    if (onboardingTimerRef.current) {
      window.clearTimeout(onboardingTimerRef.current);
      onboardingTimerRef.current = null;
    }
    sessionSkipOnboardingRef.current = true;
  }, []);

  useEffect(() => {
    trackTabOnce(activeTab);
  }, [activeTab]);

  // Samo Vite DEV + ?shot=1 (Playwright). U produkcijskom buildu import.meta.env.DEV === false.
  useEffect(() => {
    if (import.meta.env.DEV !== true) return undefined;
    const params = new URLSearchParams(window.location.search);
    if (params.get("shot") !== "1") return undefined;
    window.__cjenkoOpenProductSheet = (product) => {
      setSelectedProduct(product && typeof product === "object" ? product : null);
    };
    window.__cjenkoOpenSoftPush = (offer) => {
      setSoftPushFeedback(null);
      setSoftPushOffer(offer && typeof offer === "object" ? offer : null);
    };
    return () => {
      try {
        delete window.__cjenkoOpenProductSheet;
        delete window.__cjenkoOpenSoftPush;
      } catch {
        // ignore
      }
    };
  }, []);

  const maybeOpenSoftPush = useCallback((product) => {
    if (
      !shouldShowSoftPushPrompt({
        pushStatus: pushStatusRef.current,
        product,
        sessionBlocked: sessionSoftPushBlockedRef.current,
      })
    ) {
      return;
    }
    const offer = resolveSoftPushOffer(product);
    if (!offer) return;
    markSoftPushPromptDone();
    trackPushSoftPrikazan();
    setSoftPushFeedback(null);
    setSoftPushOffer(offer);
  }, []);

  const handleToggleFavorite = useCallback(
    (product, opts) => {
      const id = product?.id;
      const wasFav = id != null && favoritesRef.current.has(id);
      toggle(product);
      if (
        product &&
        shouldAttemptSoftPushAfterToggle({ wasFavorite: wasFav, opts })
      ) {
        maybeOpenSoftPush(product);
      }
    },
    [toggle, maybeOpenSoftPush]
  );

  // Soft snackbar nestaje kad push više nije "prompt".
  useEffect(() => {
    if (pushStatus === "subscribed" || pushStatus === "denied") {
      setSoftPushOffer(null);
      setSoftPushFeedback(null);
    }
  }, [pushStatus]);

  // Auto-zatvori ~15s bez događaja / session block.
  useEffect(() => {
    if (!softPushOffer) return undefined;
    const t = window.setTimeout(() => {
      setSoftPushOffer(null);
      setSoftPushFeedback(null);
    }, SOFT_PUSH_AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [softPushOffer]);

  const handleSoftPushDismiss = useCallback(() => {
    trackPushSoftZatvoren();
    sessionSoftPushBlockedRef.current = true;
    setSoftPushOffer(null);
    setSoftPushFeedback(null);
  }, []);

  const handleSoftPushEnable = useCallback(async () => {
    if (!softPushOffer || softPushBusy) return;
    trackPushSoftKlik();
    setSoftPushBusy(true);
    setSoftPushFeedback(null);
    try {
      if (softPushOffer.kind === "price") {
        const res = await enablePush({
          extraBarcodes: [softPushOffer.barcode],
        });
        if (res && res.ok === false) {
          const msg =
            pushStatusRef.current === "denied"
              ? TRACK_REGULAR_DENIED
              : trackEnableErrorMessage(res.error);
          if (msg) setSoftPushFeedback(msg);
          sessionSoftPushBlockedRef.current = true;
          return;
        }
        setSoftPushOffer(null);
        return;
      }

      // flyer
      const barcodes = barcodesFromFavorites(favoritesRef.current);
      const endpoint = await resolvePushEndpoint();
      if (needsEnableBeforeFollow(endpoint)) {
        const res = await enablePush({ extraBarcodes: barcodes });
        if (res && res.ok === false) {
          const msg =
            pushStatusRef.current === "denied"
              ? TRACK_REGULAR_DENIED
              : trackEnableErrorMessage(res.error);
          if (msg) setSoftPushFeedback(msg);
          sessionSoftPushBlockedRef.current = true;
          return;
        }
      }
      const followRes = await followChain(softPushOffer.chain, {
        trackedBarcodes: barcodesFromFavorites(favoritesRef.current),
      });
      if (!followRes?.ok) {
        setSoftPushFeedback(TRACK_REGULAR_ENABLE_FALLBACK);
        sessionSoftPushBlockedRef.current = true;
        return;
      }
      setSoftPushOffer(null);
    } catch (e) {
      const msg =
        pushStatusRef.current === "denied"
          ? TRACK_REGULAR_DENIED
          : trackEnableErrorMessage(e);
      if (msg) setSoftPushFeedback(msg);
      sessionSoftPushBlockedRef.current = true;
    } finally {
      setSoftPushBusy(false);
    }
  }, [softPushOffer, softPushBusy, enablePush]);

  // Onboarding: ~3s na Homeu; engažman prije toga → samo ova sesija.
  // Timer se ne resetira na svaki re-render (cleanup ne briše timeout).
  useEffect(() => {
    if (sessionSkipOnboardingRef.current || onboardingOpen) return;
    if (activeTab !== "home" || selectedProduct) {
      if (onboardingTimerRef.current) cancelOnboardingForSession();
      return;
    }
    if (!shouldShowOnboarding()) return;
    if (onboardingTimerRef.current) return;
    onboardingTimerRef.current = window.setTimeout(() => {
      onboardingTimerRef.current = null;
      if (sessionSkipOnboardingRef.current) return;
      if (activeTabRef.current !== "home") return;
      if (sheetOpenRef.current) return;
      if (!shouldShowOnboarding()) return;
      setOnboardingOpen(true);
    }, ONBOARDING_DELAY_MS);
  }, [activeTab, selectedProduct, onboardingOpen, cancelOnboardingForSession]);

  useEffect(() => {
    return () => {
      if (onboardingTimerRef.current) {
        window.clearTimeout(onboardingTimerRef.current);
        onboardingTimerRef.current = null;
      }
    };
  }, []);

  /** Promjena taba s history entryjem (korak-po-korak back). */
  const goTab = useCallback((tab) => {
    if (!VALID_TABS.has(tab)) return;
    if (tab === activeTabRef.current) {
      setActiveTab(tab);
      return;
    }
    setActiveTab(tab);
    window.history.pushState({ tab }, "", urlForTab(tab));
  }, []);

  useEffect(() => {
    const tab = tabFromLocation();
    const path = `${window.location.pathname}${window.location.search}`;
    const href = window.location.hash
      ? `${path}${window.location.hash}`
      : urlForLocation(tab);
    window.history.replaceState({ tab }, "", href);
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      sheetOpenRef.current = false;
      setSelectedProduct(null);
      setActiveTab(tabFromLocation());
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    const onPopState = (event) => {
      const state = event.state;

      if (!state?.sheet) {
        sheetOpenRef.current = false;
        setSelectedProduct(null);
      }

      const tab = VALID_TABS.has(state?.tab)
        ? state.tab
        : tabFromLocation();
      setActiveTab(tab);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleProductSelect = useCallback((product) => {
    if (!onboardingOpen) cancelOnboardingForSession();
    setSelectedProduct(product);
    if (!sheetOpenRef.current) {
      sheetOpenRef.current = true;
      window.history.pushState(
        { tab: activeTabRef.current, sheet: true },
        "",
        window.location.href
      );
    }
  }, [onboardingOpen, cancelOnboardingForSession]);

  const handleCloseSheet = useCallback(() => {
    if (sheetOpenRef.current && window.history.state?.sheet) {
      window.history.back();
      return;
    }
    sheetOpenRef.current = false;
    setSelectedProduct(null);
  }, []);

  const handleHomeClick = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setHomeResetSignal((n) => n + 1);
  }, []);

  const handleTabChange = useCallback(
    (tab) => {
      if (tab !== "home") cancelOnboardingForSession();
      goTab(tab);
    },
    [goTab, cancelOnboardingForSession]
  );

  const handleBarcodeScanned = useCallback(
    (code) => {
      setPendingBarcode(code);
      setScanToast({ message: "Barkod pronađen — cijene su na Pretrazi" });
      goTab("search");
    },
    [goTab]
  );

  const handlePendingBarcodeConsumed = useCallback(() => {
    setPendingBarcode(null);
  }, []);

  const handleGoScanFromFavorites = useCallback(() => {
    setPendingOpenScanner(true);
    goTab("search");
  }, [goTab]);

  const handlePendingOpenScannerConsumed = useCallback(() => {
    setPendingOpenScanner(false);
  }, []);

  const handleCartFeedback = useCallback((payload) => {
    if (typeof payload === "string") {
      setScanToast({ message: payload });
      return;
    }
    setScanToast(payload && payload.message ? payload : null);
  }, []);

  useEffect(() => {
    if (!scanToast) return;
    const ms = scanToast.actionLabel ? 6000 : 2800;
    const t = window.setTimeout(() => setScanToast(null), ms);
    return () => window.clearTimeout(t);
  }, [scanToast]);

  if (window.location.pathname === "/admin") return <Admin />;

  const pages = {
    home: (
      <HomePage
        onProductSelect={handleProductSelect}
        onSearchFocus={() => {
          cancelOnboardingForSession();
          goTab("search");
        }}
        onSearchKeyword={(kw) => {
          cancelOnboardingForSession();
          setPendingSearchQuery(String(kw || "").trim() || null);
          goTab("search");
        }}
        onBarcodeScanned={handleBarcodeScanned}
        isFav={isFav}
        onToggleFav={handleToggleFavorite}
        homeResetSignal={homeResetSignal}
        favorites={favorites}
        favoritesLoading={favoritesLoading}
        preferredStoresTick={preferredStoresTick}
        onEarlyEngage={cancelOnboardingForSession}
      />
    ),
    search: (
      <SearchPage
        onProductSelect={handleProductSelect}
        pendingBarcode={pendingBarcode}
        onPendingBarcodeConsumed={handlePendingBarcodeConsumed}
        pendingSearchQuery={pendingSearchQuery}
        onPendingSearchQueryConsumed={() => setPendingSearchQuery(null)}
        pendingOpenScanner={pendingOpenScanner}
        onPendingOpenScannerConsumed={handlePendingOpenScannerConsumed}
        onCartFeedback={handleCartFeedback}
        onGoCart={() => goTab("cart")}
        onToggleFavorite={handleToggleFavorite}
        isBarcodeFavorite={(code) => {
          const c = String(code || "").trim();
          if (!c) return false;
          for (const p of favorites.values()) {
            if (String(p.barcode || "").trim() === c) return true;
          }
          return false;
        }}
        onGoFav={() => goTab("fav")}
      />
    ),
    cart: <CartPage onProductSelect={handleProductSelect} />,
    fav: (
      <FavoritesPage
        favorites={favorites}
        favoritesLoading={favoritesLoading}
        onToggleFavorite={handleToggleFavorite}
        onClearAll={clear}
        onProductSelect={handleProductSelect}
        onGoHome={() => goTab("home")}
        onGoScan={handleGoScanFromFavorites}
        pushStatus={pushStatus}
        pushBusy={pushBusy}
        pushError={pushError}
        onEnablePush={enablePush}
        onDisablePush={disablePush}
      />
    ),
  };

  return (
    <div
      className="relative flex flex-col h-screen max-w-sm mx-auto"
      style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
    >
      {/* CjenkoPeek na 390×844 (top:38%, right:0) preklapa cijene/gumbe na Pretrazi, Košarici i Favoritima; Home već isključen. */}
      <main
        id="cjenko-main"
        ref={mainRef}
        tabIndex={-1}
        className="flex-1 min-h-0 overflow-hidden pb-[72px] outline-none"
      >
        {pages[activeTab]}
      </main>
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onHomeClick={handleHomeClick}
        favCount={favorites.size}
      />
      <UpdateBanner />
      <SoftPushSnackbar
        open={Boolean(softPushOffer)}
        message={softPushOffer?.message || null}
        busy={softPushBusy}
        feedback={softPushFeedback}
        onEnable={handleSoftPushEnable}
        onDismiss={handleSoftPushDismiss}
      />
      <OnboardingSheet
        open={onboardingOpen}
        favorites={favorites}
        returnFocusEl={mainRef}
        onClosed={() => {
          setOnboardingOpen(false);
          setPreferredStoresTick((n) => n + 1);
          sessionSkipOnboardingRef.current = true;
        }}
      />
      <ProductSheet
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={handleCloseSheet}
        isFavorite={selectedProduct ? isFav(selectedProduct.id) : false}
        onToggleFavorite={handleToggleFavorite}
        isBarcodeFavorite={(code) => {
          const c = String(code || "").trim();
          if (!c) return false;
          for (const p of favorites.values()) {
            if (String(p.barcode || "").trim() === c) return true;
          }
          return false;
        }}
        pushStatus={pushStatus}
        pushBusy={pushBusy}
        onEnablePush={enablePush}
        onGoCart={() => {
          handleCloseSheet();
          goTab("cart");
        }}
      />
      {scanToast?.message && (
        <div
          className="fixed left-1/2 z-[90] px-4 py-2.5 rounded-2xl font-semibold text-center flex flex-col items-center gap-2"
          style={{
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px) + 12px)",
            transform: "translateX(-50%)",
            maxWidth: "min(340px, calc(100% - 32px))",
            background: "rgba(0,255,136,0.14)",
            border: "1px solid rgba(0,255,136,0.35)",
            color: "#00ff88",
            fontSize: 13,
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
          role="status"
        >
          <span>{scanToast.message}</span>
          {scanToast.actionLabel && (
            <button
              type="button"
              onClick={() => {
                setScanToast(null);
                goTab("cart");
              }}
              className="w-full py-2 rounded-xl font-bold"
              style={{
                background: "rgba(0,255,136,0.2)",
                border: "1px solid rgba(0,255,136,0.45)",
                color: "#00ff88",
                fontSize: 12,
              }}
            >
              {scanToast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
