import { useCallback, useEffect, useState } from "react";
import { X, Heart, ListPlus, Check } from "lucide-react";
import { usePriceHistory } from "../hooks/usePriceHistory";
import { PRICE_DISCLAIMER, productDateLabel } from "../lib/priceTrust";
import { enqueueCartAdd } from "../lib/cartDraft";
import { chainFromStoreName } from "../lib/constants";
import { fetchCheaperAlternatives } from "../lib/cheaperAlternatives";
import { normalizeImageUrl } from "../lib/productImage";

const fmt = (v) =>
  Number(v).toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

function formatHistoryDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function productChain(product) {
  return product?.chain || chainFromStoreName(product?.store) || null;
}

async function addProductToList(entry) {
  const chain = entry.chain || null;
  if (!chain) return { ok: false, reason: "missing_chain" };
  const rawCode = entry.barcode || null;
  const barcode =
    rawCode && String(rawCode).length >= 8 && !String(rawCode).includes("-")
      ? String(rawCode)
      : null;
  return enqueueCartAdd({
    name: entry.name,
    barcode,
    price: entry.price,
    originalPrice: entry.originalPrice ?? entry.price,
    priceSource: entry.priceSource === "sale" ? "sale" : "regular",
    chain,
  });
}

export function ProductSheet({ product, isOpen, onClose, isFavorite, onToggleFavorite }) {
  const { history, loading } = usePriceHistory(product?.barcode, product?.chain);
  const dateLabel = productDateLabel(product);
  const [listFeedback, setListFeedback] = useState(null); // 'ok' | string error
  const [adding, setAdding] = useState(false);
  const [cheaper, setCheaper] = useState([]);
  const [cheaperLoading, setCheaperLoading] = useState(false);
  const [altAdded, setAltAdded] = useState({}); // key -> true

  useEffect(() => {
    setListFeedback(null);
    setAdding(false);
    setCheaper([]);
    setAltAdded({});
  }, [product?.id, product?.barcode, product?.name, isOpen]);

  useEffect(() => {
    if (listFeedback !== "ok") return;
    const t = setTimeout(() => setListFeedback(null), 1800);
    return () => clearTimeout(t);
  }, [listFeedback]);

  useEffect(() => {
    if (!isOpen || !product) return;
    const chain = productChain(product);
    if (!chain) {
      setCheaper([]);
      return;
    }

    let cancelled = false;
    setCheaperLoading(true);
    fetchCheaperAlternatives({
      name: product.name,
      barcode: product.barcode,
      chain,
      salePrice: product.salePrice,
      price: product.salePrice,
      product_type: product.product_type || product.productType,
    })
      .then((rows) => {
        if (!cancelled) setCheaper(rows || []);
      })
      .catch(() => {
        if (!cancelled) setCheaper([]);
      })
      .finally(() => {
        if (!cancelled) setCheaperLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, product]);

  const handleAddToList = useCallback(async () => {
    if (!product || adding) return;
    const chain = productChain(product);
    if (!chain) {
      setListFeedback("Nedostaje lanac proizvoda — ne može se dodati na popis.");
      return;
    }

    setAdding(true);
    try {
      const result = await addProductToList({
        name: product.name,
        barcode: product.barcode,
        price: product.salePrice,
        originalPrice: product.originalPrice ?? product.salePrice,
        priceSource: product.priceSource,
        chain,
      });

      if (!result.ok && result.reason === "chain_mismatch") {
        setListFeedback(
          `Popis je za ${result.selectedChain}. Očisti popis ili dodaj iz istog lanca.`
        );
        return;
      }
      if (!result.ok) {
        setListFeedback("Nije moguće dodati na popis.");
        return;
      }
      setListFeedback("ok");
    } finally {
      setAdding(false);
    }
  }, [product, adding]);

  const handleAddAlt = useCallback(async (alt) => {
    const key = `${alt.barcode || ""}|${alt.name}`;
    if (altAdded[key]) return;
    const result = await addProductToList({
      name: alt.name,
      barcode: alt.barcode,
      price: alt.price,
      originalPrice: alt.price,
      priceSource: "regular",
      chain: alt.chain,
    });
    if (!result.ok && result.reason === "chain_mismatch") {
      setListFeedback(
        `Popis je za ${result.selectedChain}. Očisti popis ili dodaj iz istog lanca.`
      );
      return;
    }
    if (!result.ok) {
      setListFeedback("Nije moguće dodati na popis.");
      return;
    }
    setAltAdded((prev) => ({ ...prev, [key]: true }));
  }, [altAdded]);

  if (!isOpen || !product) return null;

  const addedOk = listFeedback === "ok";
  const errorMsg = listFeedback && listFeedback !== "ok" ? listFeedback : null;

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
            type="button"
            onClick={() => onToggleFavorite(product)}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
            aria-label={isFavorite ? "Ukloni iz favorita" : "Dodaj u favorite"}
          >
            <Heart size={16} fill={isFavorite ? "#ff6b6b" : "none"} stroke={isFavorite ? "#ff6b6b" : "#fff"} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)" }}
            aria-label="Zatvori"
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
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: 12, marginBottom: 4 }}>
            {product.chain || product.store || "Trgovina"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 16 }}>
            {product.category}
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
            {product.discount > 0 && (
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
            )}
          </div>

          <button
            type="button"
            onClick={handleAddToList}
            disabled={adding}
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 mb-2"
            style={{
              background: addedOk ? "rgba(0,255,136,0.18)" : "rgba(0,255,136,0.12)",
              border: "1px solid rgba(0,255,136,0.35)",
              color: "#00ff88",
              fontSize: 14,
              opacity: adding ? 0.7 : 1,
            }}
          >
            {addedOk ? <Check size={18} strokeWidth={2.5} /> : <ListPlus size={18} strokeWidth={2.2} />}
            {addedOk ? "Dodano na popis" : adding ? "Dodajem…" : "Dodaj na popis"}
          </button>
          <p
            style={{
              color: "rgba(255,255,255,0.38)",
              fontSize: 11,
              lineHeight: 1.45,
              marginBottom: errorMsg ? 8 : 16,
            }}
          >
            Dodaje se u tvoj popis za usporedbu — ništa se ne kupuje ni plaća.
          </p>
          {errorMsg && (
            <p
              className="mb-4"
              style={{ color: "rgba(255,107,107,0.9)", fontSize: 12, lineHeight: 1.4 }}
              role="status"
            >
              {errorMsg}
            </p>
          )}

          {dateLabel && (
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginBottom: 8 }}>
              {dateLabel}
            </p>
          )}
          <p style={{ color: "rgba(255,255,255,0.32)", fontSize: 11, lineHeight: 1.45, marginBottom: 16 }}>
            {PRICE_DISCLAIMER}
          </p>

          {product.description && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
              {product.description}
            </p>
          )}

          {!cheaperLoading && cheaper.length > 0 && (
            <div className="mb-5">
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.3)",
                  letterSpacing: "0.12em",
                  marginBottom: 10,
                }}
              >
                SLIČNO, JEFTINIJE
              </p>
              <ul className="flex flex-col gap-2">
                {cheaper.map((alt) => {
                  const key = `${alt.barcode || ""}|${alt.name}`;
                  const done = Boolean(altAdded[key]);
                  const thumb = normalizeImageUrl(alt.imageUrl);
                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2.5 rounded-xl px-2.5 py-2"
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          width={44}
                          height={44}
                          loading="lazy"
                          className="rounded-lg flex-shrink-0 object-cover"
                          style={{ width: 44, height: 44, background: "rgba(255,255,255,0.04)" }}
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate font-semibold text-white"
                          style={{ fontSize: 12 }}
                          title={alt.name}
                        >
                          {alt.name}
                        </p>
                        <p className="tabular-nums" style={{ fontSize: 11, color: "rgba(0,255,136,0.85)" }}>
                          {alt.perUnitLabel}
                          <span style={{ color: "rgba(255,255,255,0.35)" }}> · {fmt(alt.price)}</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddAlt(alt)}
                        className="flex-shrink-0 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1"
                        style={{
                          background: done ? "rgba(0,255,136,0.16)" : "rgba(0,255,136,0.08)",
                          border: "1px solid rgba(0,255,136,0.28)",
                          color: "#00ff88",
                          fontSize: 11,
                        }}
                        aria-label={`Dodaj ${alt.name} na popis`}
                      >
                        {done ? <Check size={13} /> : <ListPlus size={13} />}
                        {done ? "OK" : "Dodaj"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", marginBottom: 12 }}>
            POVIJEST CIJENA
          </p>
          {loading ? (
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13 }}>Učitavanje...</p>
          ) : history.length === 0 ? (
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, lineHeight: 1.45 }}>
              Povijest cijena tek počinje bilježiti. Promjene će se pojaviti nakon
              sljedećih ažuriranja cjenika.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {history.map((h, i) => (
                <div
                  key={h.id || `${h.detected_at}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="tabular-nums font-bold text-white" style={{ fontSize: 13 }}>
                    {fmt(h.old_price)}
                    <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 500 }}> → </span>
                    {fmt(h.new_price)}
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, flexShrink: 0 }}>
                    {formatHistoryDate(h.detected_at)}
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
