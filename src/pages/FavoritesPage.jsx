import { LogOut, Trash2 } from "lucide-react";
import { ProductCard } from "../components/ProductCard";

export function FavoritesPage({
  favorites,
  favLoading,
  userEmail,
  onToggleFavorite,
  onClearAll,
  onProductSelect,
  onGoHome,
  onSignOut,
}) {
  const items = [...favorites.values()];

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-4 pt-8 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-white" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>
            Favoriti
          </h1>
          {items.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{
                background: "rgba(255,107,107,0.08)",
                border: "1px solid rgba(255,107,107,0.2)",
                color: "#ff6b6b",
              }}
            >
              <Trash2 size={12} /> Očisti
            </button>
          )}
        </div>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          {favLoading ? "Sinkronizacija..." : `${items.length} spremljenih akcija`}
        </p>
        {userEmail && (
          <p className="truncate mt-1" style={{ color: "rgba(255,255,255,0.2)", fontSize: 11 }}>
            {userEmail}
          </p>
        )}
      </div>

      <div className="px-4 mb-4">
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          <LogOut size={14} /> Odjavi se
        </button>
      </div>

      {favLoading ? (
        <p className="text-center py-16" style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
          Učitavanje favorita...
        </p>
      ) : items.length === 0 ? (
        <div className="py-16 text-center px-6">
          <div className="text-5xl mb-4 opacity-40">💛</div>
          <p className="font-black mb-2" style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>
            Nema favorita
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", lineHeight: 1.7, marginBottom: 20 }}>
            Dodirni srce na proizvodu da ga spremiš ovdje
          </p>
          <button
            onClick={onGoHome}
            className="px-5 py-2.5 rounded-2xl font-bold text-sm"
            style={{
              background: "rgba(0,255,136,0.1)",
              border: "1px solid rgba(0,255,136,0.2)",
              color: "#00ff88",
            }}
          >
            Pregledaj akcije
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 px-4 pb-8">
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isFavorite
              onToggleFavorite={onToggleFavorite}
              onClick={() => onProductSelect(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
