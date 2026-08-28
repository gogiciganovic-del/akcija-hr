import { useState, useEffect } from "react";
import { Heart } from "lucide-react";
import { productPlaceholderDataUri } from "../lib/productImage";

const fmt = (v) => v.toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

function isRemoteSrc(src) {
  return typeof src === "string" && (src.startsWith("http://") || src.startsWith("https://"));
}

export function ProductCard({ product, size = "normal", isFavorite, onToggleFavorite, onClick }) {
  const large = size === "large";
  const imageHeight = large ? 140 : 100;
  const fallbackSrc = productPlaceholderDataUri(product.name, imageHeight);

  const [displaySrc, setDisplaySrc] = useState(product.image || fallbackSrc);
  const [imageLoading, setImageLoading] = useState(() => isRemoteSrc(product.image));
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const next = product.image || fallbackSrc;
    setDisplaySrc(next);
    setImageFailed(false);
    setImageLoading(isRemoteSrc(product.image));
  }, [product.image, product.name, fallbackSrc]);

  return (
    <div
      onClick={onClick}
      className="relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: product.isGlitch
          ? "1px solid rgba(0,255,136,0.18)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(product); }}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.45)" }}
      >
        <Heart
          size={13}
          fill={isFavorite ? "#ff6b6b" : "none"}
          stroke={isFavorite ? "#ff6b6b" : "rgba(255,255,255,0.6)"}
        />
      </button>

      <div
        className="relative w-full overflow-hidden"
        style={{
          height: imageHeight,
          background: product.imageBg || "#0d1f3a",
        }}
      >
        {imageLoading && !imageFailed && (
          <div
            className="absolute inset-0 animate-pulse"
            style={{ background: "rgba(255,255,255,0.06)" }}
            aria-hidden
          />
        )}
        <img
          src={displaySrc}
          alt={product.name}
          className="relative w-full h-full object-contain"
          style={{ opacity: imageLoading ? 0 : 0.9 }}
          onLoad={() => setImageLoading(false)}
          onError={() => {
            setImageFailed(true);
            setImageLoading(false);
            setDisplaySrc(fallbackSrc);
          }}
        />
      </div>

      <div className="p-2.5">
        <p
          className="font-bold text-white leading-tight mb-1 truncate"
          style={{ fontSize: large ? 13 : 11.5 }}
        >
          {product.name}
        </p>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginBottom: 6 }}>
          Hrvatska{product.isHot ? " · 🔥" : ""}
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, textDecoration: "line-through" }}>
              {fmt(product.originalPrice)}
            </p>
            <p className="font-black text-white" style={{ fontSize: large ? 16 : 14, letterSpacing: "-0.02em" }}>
              {fmt(product.salePrice)}
            </p>
          </div>
          <div
            className="px-1.5 py-0.5 rounded-lg font-black"
            style={{
              fontSize: 9,
              background: product.isGlitch
                ? "linear-gradient(135deg,#00ff88,#00cc6a)"
                : "linear-gradient(135deg,#ffd700,#ffaa00)",
              color: "#020617",
            }}
          >
            -{product.discount}%
          </div>
        </div>
        {product.expiresIn && (
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, marginTop: 4 }}>
            Ističe za {product.expiresIn}
          </p>
        )}
      </div>
    </div>
  );
}
