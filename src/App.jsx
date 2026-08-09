import { useState, useCallback, useEffect } from "react";
import { BottomNav }     from "./components/BottomNav";
import { ProductSheet }  from "./components/ProductSheet";
import { HomePage }      from "./pages/HomePage";
import { SearchPage }    from "./pages/SearchPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { CartPage }      from "./pages/CartPage";
import { Admin }         from "./pages/Admin";
import { useFavorites }  from "./hooks/useFavorites";
import { CjenkoPeek }    from "./components/CjenkoPeek";

export default function App() {
  const { favorites, isFav, toggle, clear } = useFavorites();
  const [activeTab, setActiveTab] = useState("home");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [homeResetSignal, setHomeResetSignal] = useState(0);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [scanToast, setScanToast] = useState(null);

  const handleProductSelect = useCallback((product) => setSelectedProduct(product), []);
  const handleCloseSheet    = useCallback(() => setSelectedProduct(null), []);
  const handleHomeClick     = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setHomeResetSignal((n) => n + 1);
  }, []);
  const handleTabChange     = useCallback((tab) => setActiveTab(tab), []);
  const handleBarcodeScanned = useCallback((code) => {
    setPendingBarcode(code);
    setScanToast("Barkod pronađen — cijene su na Pretrazi");
    setActiveTab("search");
  }, []);
  const handlePendingBarcodeConsumed = useCallback(() => {
    setPendingBarcode(null);
  }, []);

  useEffect(() => {
    if (!scanToast) return;
    const t = window.setTimeout(() => setScanToast(null), 2800);
    return () => window.clearTimeout(t);
  }, [scanToast]);

  if (window.location.pathname === "/admin") return <Admin />;

  const pages = {
    home: (
      <HomePage
        onProductSelect={handleProductSelect}
        onSearchFocus={() => setActiveTab("search")}
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
      />
    ),
    cart: <CartPage onProductSelect={handleProductSelect} />,
    fav: (
      <FavoritesPage
        favorites={favorites}
        onToggleFavorite={toggle}
        onClearAll={clear}
        onProductSelect={handleProductSelect}
        onGoHome={() => setActiveTab("home")}
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
      {scanToast && (
        <div
          className="fixed left-1/2 z-[90] px-4 py-2.5 rounded-2xl font-semibold text-center"
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
          {scanToast}
        </div>
      )}
    </div>
  );
}
