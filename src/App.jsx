import { useState, useCallback } from "react";
import { BottomNav }     from "./components/BottomNav";
import { ProductSheet }  from "./components/ProductSheet";
import { HomePage }      from "./pages/HomePage";
import { SearchPage }    from "./pages/SearchPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { Admin }         from "./pages/Admin";
import { useFavorites }  from "./hooks/useFavorites";
import { CjenkoPeek }    from "./components/CjenkoPeek";

export default function App() {
  const { favorites, isFav, toggle, clear } = useFavorites();
  const [activeTab, setActiveTab] = useState("home");
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleProductSelect = useCallback((product) => setSelectedProduct(product), []);
  const handleCloseSheet    = useCallback(() => setSelectedProduct(null), []);
  const handleTabChange     = useCallback((tab) => setActiveTab(tab), []);

  if (window.location.pathname === "/admin") return <Admin />;

  const pages = {
    home: (
      <HomePage
        onProductSelect={handleProductSelect}
        onSearchFocus={() => setActiveTab("search")}
        isFav={isFav}
        onToggleFav={toggle}
      />
    ),
    search: <SearchPage onProductSelect={handleProductSelect} />,
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
      {pages[activeTab]}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} favCount={favorites.size} />
      <ProductSheet
        product={selectedProduct}
        isOpen={!!selectedProduct}
        onClose={handleCloseSheet}
        isFavorite={selectedProduct ? isFav(selectedProduct.id) : false}
        onToggleFavorite={toggle}
      />
    </div>
  );
}
