import { useState, useCallback } from "react";
import { BottomNav }     from "./components/BottomNav";
import { ProductSheet }  from "./components/ProductSheet";
import { HomePage }      from "./pages/HomePage";
import { SearchPage }    from "./pages/SearchPage";
import { FavoritesPage } from "./pages/FavoritesPage";
import { ProximityPage } from "./pages/ProximityPage";
import { LoginPage }     from "./pages/LoginPage";
import { Admin }         from "./pages/Admin";
import { useAuth }       from "./hooks/useAuth";
import { useFavorites }  from "./hooks/useFavorites";

function LoadingScreen() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
    >
      <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Učitavanje...</p>
    </div>
  );
}

export default function App() {
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();
  const { favorites, isFav, toggle, clear, loading: favLoading } = useFavorites(user);
  const [activeTab, setActiveTab] = useState("home");
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleProductSelect = useCallback((product) => setSelectedProduct(product), []);
  const handleCloseSheet    = useCallback(() => setSelectedProduct(null), []);
  const handleTabChange     = useCallback((tab) => setActiveTab(tab), []);

  if (window.location.pathname === "/admin") return <Admin />;

  if (authLoading) return <LoadingScreen />;

  if (!user) {
    return <LoginPage onSignIn={signIn} onSignUp={signUp} />;
  }

  const pages = {
    home: (
      <HomePage
        onProductSelect={handleProductSelect}
        onSponsorOpen={() => {}}
        onSearchFocus={() => setActiveTab("search")}
        isFav={isFav}
        onToggleFav={toggle}
      />
    ),
    search: <SearchPage onProductSelect={handleProductSelect} />,
    fav: (
      <FavoritesPage
        favorites={favorites}
        favLoading={favLoading}
        userEmail={user.email}
        onToggleFavorite={toggle}
        onClearAll={clear}
        onProductSelect={handleProductSelect}
        onGoHome={() => setActiveTab("home")}
        onSignOut={signOut}
      />
    ),
    near: <ProximityPage onProductSelect={handleProductSelect} />,
  };

  return (
    <div
      className="flex flex-col h-screen max-w-sm mx-auto"
      style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
    >
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
