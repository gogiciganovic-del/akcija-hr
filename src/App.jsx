import { useState, useCallback, useEffect, useRef } from "react";
import { BottomNav }     from "./components/BottomNav";
import { ProductSheet }  from "./components/ProductSheet";
import { HomePage }      from "./pages/HomePage";
import { SearchPage }    from "./pages/SearchPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { CartPage }      from "./pages/CartPage";
import { Admin }         from "./pages/Admin";
import { useFavorites }  from "./hooks/useFavorites";
import { usePushNotifications } from "./hooks/usePushNotifications";
import { CjenkoPeek }    from "./components/CjenkoPeek";

const VALID_TABS = new Set(["home", "search", "cart", "fav"]);

function tabFromLocation() {
  const hash = String(window.location.hash || "").replace(/^#/, "");
  if (VALID_TABS.has(hash)) return hash;
  const stateTab = window.history.state?.tab;
  if (VALID_TABS.has(stateTab)) return stateTab;
  return "home";
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
  } = usePushNotifications(favorites, favoritesLoading);
  const [activeTab, setActiveTab] = useState(() => tabFromLocation());
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [homeResetSignal, setHomeResetSignal] = useState(0);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [scanToast, setScanToast] = useState(null);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const sheetOpenRef = useRef(false);

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
    window.history.replaceState({ tab }, "", urlForTab(tab));
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
    setSelectedProduct(product);
    if (!sheetOpenRef.current) {
      sheetOpenRef.current = true;
      window.history.pushState(
        { tab: activeTabRef.current, sheet: true },
        "",
        window.location.href
      );
    }
  }, []);

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
      goTab(tab);
    },
    [goTab]
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
        onSearchFocus={() => goTab("search")}
        onBarcodeScanned={handleBarcodeScanned}
        isFav={isFav}
        onToggleFav={toggle}
        homeResetSignal={homeResetSignal}
      />
    ),
    search: (
      <SearchPage
        onProductSelect={handleProductSelect}
        pendingBarcode={pendingBarcode}
        onPendingBarcodeConsumed={handlePendingBarcodeConsumed}
        onCartFeedback={handleCartFeedback}
        onGoCart={() => goTab("cart")}
      />
    ),
    cart: <CartPage onProductSelect={handleProductSelect} />,
    fav: (
      <FavoritesPage
        favorites={favorites}
        onToggleFavorite={toggle}
        onClearAll={clear}
        onProductSelect={handleProductSelect}
        onGoHome={() => goTab("home")}
        pushStatus={pushStatus}
        pushBusy={pushBusy}
        pushError={pushError}
        onEnablePush={enablePush}
      />
    ),
  };

  return (
    <div
      className="relative flex flex-col h-screen max-w-sm mx-auto"
      style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
    >
      <CjenkoPeek />
      <main className="flex-1 min-h-0 overflow-hidden pb-[72px]">
        {pages[activeTab]}
      </main>
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onHomeClick={handleHomeClick}
        favCount={favorites.size}
      />
      <ProductSheet
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={handleCloseSheet}
        isFavorite={selectedProduct ? isFav(selectedProduct.id) : false}
        onToggleFavorite={toggle}
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
