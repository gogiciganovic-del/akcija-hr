import { Trash2 } from "lucide-react";
import { ProductCard } from "../components/ProductCard";
import { CjenkoFace } from "../components/CjenkoFace";
import { CjenkoShrug } from "../components/CjenkoShrug";

const fmtEur = (v) =>
  v.toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

function totalSavings(items) {
  return items.reduce((sum, p) => {
    const original = Number(p.originalPrice) || 0;
    const sale = Number(p.salePrice) || 0;
    return sum + Math.max(0, original - sale);
  }, 0);
}

function SavingsCard({ items }) {
  const saved = totalSavings(items);

  return (
    <div
      className="mx-4 mb-4 rounded-2xl p-4 flex items-center gap-3"
      style={{ background: "#EF9F27", border: "1px solid rgba(99,56,6,0.15)" }}
    >
      <CjenkoFace size={52} showTag />
      <div className="flex-1 min-w-0">
        <p className="font-black" style={{ color: "#633806", fontSize: 15, letterSpacing: "-0.02em" }}>
          Tvoja ušteda!
        </p>
        <p className="font-bold mt-1" style={{ color: "#633806", fontSize: 13, opacity: 0.85 }}>
          Ukupno si uštedio: {fmtEur(saved)}
        </p>
      </div>
    </div>
  );
}

function EmptySavingsCard() {
  return (
    <div
      className="mx-4 mb-6 rounded-2xl p-5 flex flex-col items-center text-center"
      style={{ background: "#EF9F27", border: "1px solid rgba(99,56,6,0.15)" }}
    >
      <CjenkoShrug size={72} />
      <p
        className="font-bold mt-3"
        style={{ color: "#633806", fontSize: 14, lineHeight: 1.5, maxWidth: 260 }}
      >
        Dodaj proizvode u favorite i vidi koliko šteđeš!
      </p>
    </div>
  );
}

export function FavoritesPage({
  favorites,
  onToggleFavorite,
  onClearAll,
  onProductSelect,
  onGoHome,
}) {
  const items = [...favorites.values()];
  const hasItems = items.length > 0;

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-white" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>
            Favoriti
          </h1>
          {hasItems && (
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
          {items.length} spremljenih akcija
        </p>
      </div>

      {hasItems ? <SavingsCard items={items} /> : <EmptySavingsCard />}

      {hasItems ? (
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
      ) : (
        <div className="px-6 pb-8 text-center">
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
      )}
    </div>
  );
}
