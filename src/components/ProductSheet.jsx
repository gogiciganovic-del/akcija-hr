import { X, Heart, MapPin } from "lucide-react";
import { usePriceHistory } from "../hooks/usePriceHistory";

const fmt = (v) => v.toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

export function ProductSheet({ product, isOpen, onClose, isFavorite, onToggleFavorite }) {
  const { history, loading } = usePriceHistory(product?.product_id);

  if (!isOpen || !product) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.65)" }} />
      <div
        className="relative rounded-t-3xl overflow-hidden max-h-[88vh] flex flex-col"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={() => onToggleFavorite(product)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <Heart size={16} fill={isFavorite ? "#ff6b6b" : "none"} stroke={isFavorite ? "#ff6b6b" : "#fff"} />
          </button>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <X size={16} style={{ color: "rgba(255,255,255,0.6)" }} />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-8" style={{ scrollbarWidth: "none" }}>
          <img
            src={product.image}
            alt={product.name}
            className="w-full rounded-2xl object-cover mb-4"
            style={{ height: 200, background: product.imageBg }}
            onError={(e) => { e.target.style.display = "none"; }}
          />

          <h2 className="font-black text-white mb-1" style={{ fontSize: 20, letterSpacing: "-0.03em" }}>
            {product.name}
          </h2>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 16 }}>
            {product.store} · {product.category}
          </p>

          <div className="flex items-center gap-3 mb-5">
            <div>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, textDecoration: "line-through" }}>
                {fmt(product.originalPrice)}
              </p>
              <p className="font-black text-white" style={{ fontSize: 28, letterSpacing: "-0.03em" }}>
                {fmt(product.salePrice)}
              </p>
            </div>
            <div
              className="px-3 py-1.5 rounded-xl font-black"
              style={{
                fontSize: 14,
                background: product.isGlitch
                  ? "linear-gradient(135deg,#00ff88,#00cc6a)"
                  : "linear-gradient(135deg,#ffd700,#ffaa00)",
                color: "#020617",
              }}
            >
              -{product.discount}%
            </div>
          </div>

          {product.description && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              {product.description}
            </p>
          )}

          <div
            className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5"
            style={{ background: "rgba(0,255,136,0.06)", border: "1px solid rgba(0,255,136,0.15)" }}
          >
            <MapPin size={14} style={{ color: "#00ff88" }} />
            <span style={{ color: "#00ff88", fontSize: 12, fontWeight: 600 }}>
              {product.distanceM ? `${product.distanceM}m udaljeno` : product.store}
            </span>
          </div>

          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", marginBottom: 12 }}>
            POVIJEST CIJENA
          </p>
          {loading ? (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Učitavanje...</p>
          ) : history.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>Nema povijesti cijena.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                    {h.stores?.name || h.stores?.chain || "Trgovina"}
                  </span>
                  <span className="font-bold text-white" style={{ fontSize: 13 }}>
                    {fmt(h.price)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
