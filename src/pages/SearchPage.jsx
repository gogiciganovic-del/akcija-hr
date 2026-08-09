import { useState, useRef, useEffect, useCallback } from "react";
import { X, Plus, ShoppingCart } from "lucide-react";
import { CjenkoFace } from "../components/CjenkoFace";
import { BarcodeScannerModal, ScanBarcodeButton } from "../components/BarcodeScannerModal";
import { useProducts } from "../hooks/useProducts";
import { supabase } from "../lib/supabase";
import { adaptRegularPrice } from "../lib/adapters";
import { lookupByBarcode } from "../lib/barcodeLookup";
import { enqueueCartAdd } from "../lib/cartDraft";
import { loadScanHistory, pushScanHistory, clearScanHistory } from "../lib/scanHistory";
import { chainFromStoreName } from "../lib/constants";
import { productPlaceholderDataUri } from "../lib/productImage";
import { PRICE_DISCLAIMER, productDateLabel } from "../lib/priceTrust";

function highlight(text, query) {
  if (!query) return text;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? (
      <mark key={i} style={{ background: "transparent", color: "#00ff88", fontWeight: 900 }}>
        {part}
      </mark>
    ) : (
      part
    )
  );
}

function fmt(v) {
  return (Number.isFinite(v) ? v : 0).toLocaleString("hr-HR", {
    style: "currency",
    currency: "EUR",
  });
}

function SourceBadge({ source }) {
  const isRegular = source === "regular";
  return (
    <span
      className="flex-shrink-0 font-bold rounded px-1.5 py-0.5"
      style={{
        fontSize: 9,
        letterSpacing: "0.04em",
        color: isRegular ? "rgba(255,255,255,0.85)" : "#633806",
        background: isRegular ? "rgba(255,255,255,0.12)" : "rgba(239,159,39,0.95)",
      }}
    >
      {isRegular ? "REDOVNA" : "AKCIJA"}
    </span>
  );
}

function sortProducts(list, sortMode) {
  const copy = [...list];
  if (sortMode === "price_asc") {
    copy.sort((a, b) => (a.salePrice ?? 0) - (b.salePrice ?? 0));
  } else if (sortMode === "price_desc") {
    copy.sort((a, b) => (b.salePrice ?? 0) - (a.salePrice ?? 0));
  } else if (sortMode === "sale_first") {
    copy.sort((a, b) => {
      const as = a.priceSource === "sale" ? 0 : 1;
      const bs = b.priceSource === "sale" ? 0 : 1;
      if (as !== bs) return as - bs;
      return (a.salePrice ?? 0) - (b.salePrice ?? 0);
    });
  } else {
    copy.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0));
  }
  return copy;
}

function ProductResultCard({ p, highlightQuery, onSelect, onAddToCart, showMeta }) {
  const isRegular = p.priceSource === "regular";
  const storeLabel = p.chain ?? chainFromStoreName(p.store);
  const imgSrc = isRegular
    ? productPlaceholderDataUri(p.name, 80)
    : p.image || productPlaceholderDataUri(p.name, 80);
  const showStrike =
    !isRegular && Number.isFinite(p.originalPrice) && p.originalPrice > p.salePrice;
  const showDiscount = !isRegular && (p.discount ?? 0) > 0;
  const dateLabel = showMeta ? productDateLabel(p) : null;

  return (
    <div
      onClick={() => onSelect(p)}
      className="flex items-center rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: p.isGlitch
          ? "1px solid rgba(0,255,136,0.14)"
          : "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <img
        src={imgSrc}
        alt={p.name}
        className="flex-shrink-0 object-cover"
        style={{ width: 80, height: 80, background: p.imageBg || "#0d1f3a", opacity: 0.85 }}
        onError={(e) => {
          const fallback = productPlaceholderDataUri(p.name, 80);
          if (e.currentTarget.src !== fallback) {
            e.currentTarget.onerror = null;
            e.currentTarget.src = fallback;
          }
        }}
      />
      <div className="flex-1 px-3 py-2.5 min-w-0">
        <div className="flex items-start gap-2 mb-1">
          <p className="font-bold text-white text-[12.5px] leading-tight truncate flex-1 min-w-0">
            {highlightQuery ? highlight(p.name, highlightQuery) : p.name}
          </p>
          <SourceBadge source={isRegular ? "regular" : "sale"} />
        </div>
        {storeLabel && (
          <p
            className="truncate"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginBottom: 4 }}
          >
            {storeLabel}
          </p>
        )}
        {dateLabel && (
          <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, marginBottom: 4 }}>
            {dateLabel}
          </p>
        )}
        <div className="flex items-center gap-2">
          <div>
            {showStrike && (
              <p
                style={{
                  color: "rgba(255,255,255,0.25)",
                  fontSize: 10,
                  textDecoration: "line-through",
                }}
              >
                {fmt(p.originalPrice)}
              </p>
            )}
            <p className="font-black text-white" style={{ fontSize: 16, letterSpacing: "-0.02em" }}>
              {fmt(p.salePrice)}
            </p>
          </div>
          {showDiscount && (
            <div
              className="px-1.5 py-0.5 rounded-lg font-black text-[10px]"
              style={{
                background: p.isGlitch
                  ? "linear-gradient(135deg,#00ff88,#00cc6a)"
                  : "linear-gradient(135deg,#ffd700,#ffaa00)",
                color: "#020617",
              }}
            >
              -{p.discount}%
            </div>
          )}
          {onAddToCart && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(p);
              }}
              className="ml-auto flex items-center gap-1 px-2 py-1.5 rounded-xl font-bold"
              style={{
                background: "rgba(0,255,136,0.1)",
                border: "1px solid rgba(0,255,136,0.28)",
                color: "#00ff88",
                fontSize: 10,
              }}
              aria-label="Dodaj u košaricu"
            >
              <Plus size={12} strokeWidth={2.5} />
              Košarica
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SearchPage({
  onProductSelect,
  pendingBarcode = null,
  onPendingBarcodeConsumed,
  onCartFeedback,
  onGoCart,
}) {
  const [query, setQuery] = useState("");
  const [sortMode, setSort] = useState("discount");
  const [catFilter, setCat] = useState("Sve");
  const [regularProducts, setRegularProducts] = useState([]);
  const [regularLoading, setRegularLoading] = useState(false);
  const inputRef = useRef(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResults, setScanResults] = useState(null);
  const [scanBarcode, setScanBarcode] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanNotFound, setScanNotFound] = useState(false);
  const [scanSort, setScanSort] = useState("price_asc");
  const [scanSaleOnly, setScanSaleOnly] = useState(false);
  const [history, setHistory] = useState(() => loadScanHistory());

  const searchTerm = query.trim();
  const { products: saleProducts, loading: saleLoading } = useProducts({
    search: searchTerm || undefined,
    sortBy: sortMode,
  });

  const runBarcodeLookup = useCallback(async (code) => {
    setScanLoading(true);
    setScanNotFound(false);
    setScanResults(null);
    setScanBarcode(code);
    setQuery("");
    setScanSaleOnly(false);
    setScanSort("price_asc");
    try {
      const list = await lookupByBarcode(code);
      if (!list.length) {
        setScanNotFound(true);
        setScanResults([]);
        setHistory(pushScanHistory({ barcode: code, found: false }));
      } else {
        setScanNotFound(false);
        setScanResults(list);
        setHistory(
          pushScanHistory({
            barcode: code,
            name: list[0]?.name || null,
            found: true,
          })
        );
      }
    } catch {
      setScanNotFound(true);
      setScanResults([]);
      setHistory(pushScanHistory({ barcode: code, found: false }));
    } finally {
      setScanLoading(false);
    }
  }, []);

  const handleDetected = useCallback(
    (code) => {
      setScannerOpen(false);
      runBarcodeLookup(code);
    },
    [runBarcodeLookup]
  );

  const handleAddToCart = useCallback(
    (p) => {
      const result = enqueueCartAdd({
        name: p.name,
        barcode: scanBarcode || p.product_id || null,
        price: p.salePrice,
        originalPrice: p.originalPrice ?? p.salePrice,
        priceSource: p.priceSource,
        chain: p.chain || chainFromStoreName(p.store),
      });

      if (!result.ok && result.reason === "chain_mismatch") {
        onCartFeedback?.(
          `Košarica je za ${result.selectedChain}. Očisti košaricu ili dodaj iz istog lanca.`
        );
        return;
      }
      if (!result.ok) {
        onCartFeedback?.("Nije moguće dodati u košaricu");
        return;
      }
      onCartFeedback?.(`Dodano u košaricu (${result.selectedChain})`);
    },
    [scanBarcode, onCartFeedback]
  );

  useEffect(() => {
    if (!pendingBarcode) return;
    runBarcodeLookup(pendingBarcode);
    onPendingBarcodeConsumed?.();
  }, [pendingBarcode, runBarcodeLookup, onPendingBarcodeConsumed]);

  useEffect(() => {
    if (searchTerm.length < 2) {
      setRegularProducts([]);
      setRegularLoading(false);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setRegularLoading(true);
      try {
        const { data, error } = await supabase
          .from("regular_prices")
          .select("barcode, name, brand, chain, price, category, special_price")
          .or(`name.ilike.%${searchTerm}%,brand.ilike.%${searchTerm}%`)
          .order("price", { ascending: true })
          .limit(40);

        if (error) throw error;
        if (cancelled) return;

        const adapted = (data || []).map((row, i) => {
          const p = adaptRegularPrice(row);
          return {
            ...p,
            id: `regular-${row.chain}-${row.barcode || row.name}-${i}`,
            image: productPlaceholderDataUri(row.name, 80),
          };
        });
        setRegularProducts(adapted);
      } catch {
        if (!cancelled) setRegularProducts([]);
      } finally {
        if (!cancelled) setRegularLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const clearScan = () => {
    setScanResults(null);
    setScanBarcode(null);
    setScanNotFound(false);
    setScanLoading(false);
    setScanSaleOnly(false);
  };

  const loading = saleLoading || regularLoading;

  const saleTagged = saleProducts.map((p) => ({
    ...p,
    priceSource: p.priceSource || "sale",
  }));

  const merged = [
    ...sortProducts(saleTagged, sortMode),
    ...sortProducts(regularProducts, sortMode === "discount" ? "price_asc" : sortMode),
  ];

  const results =
    catFilter !== "Sve" ? merged.filter((p) => p.category === catFilter) : merged;

  const showingScan = scanResults !== null || scanLoading || scanNotFound;
  const scanFiltered = scanSaleOnly
    ? (scanResults || []).filter((p) => p.priceSource === "sale")
    : scanResults || [];
  const scanSorted = sortProducts(scanFiltered, scanSort);
  const scanHasSale = (scanResults || []).some((p) => p.priceSource === "sale");
  const scanOnlyRegular =
    !scanLoading && !scanNotFound && (scanResults || []).length > 0 && !scanHasSale;

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-4 pt-8 pb-4">
        <h1 className="font-black text-white mb-1" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>
          Pretraga
        </h1>
        <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 13, marginBottom: 16 }}>
          Pronađi akcije i redovne cijene
        </p>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1 min-w-0">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
              <CjenkoFace size={22} />
            </div>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                clearScan();
                setQuery(e.target.value);
              }}
              placeholder="Npr. Nutella, kava, mlijeko..."
              className="w-full rounded-2xl pl-11 pr-11 py-3.5 text-white text-[15px] outline-none transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: query ? "1px solid rgba(0,255,136,0.4)" : "1px solid rgba(255,255,255,0.1)",
                fontFamily: "'DM Sans',sans-serif",
                boxShadow: query ? "0 0 0 3px rgba(0,255,136,0.06)" : "none",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <X size={13} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            )}
          </div>
          <ScanBarcodeButton onClick={() => setScannerOpen(true)} />
        </div>

        <div className="flex gap-2 overflow-x-auto mb-2" style={{ scrollbarWidth: "none" }}>
          {["Sve"].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0 transition-all duration-200"
              style={{
                background: catFilter === c ? "rgba(0,255,136,0.1)" : "rgba(255,255,255,0.04)",
                border:
                  catFilter === c ? "1px solid rgba(0,255,136,0.3)" : "1px solid rgba(255,255,255,0.07)",
                color: catFilter === c ? "#00ff88" : "rgba(255,255,255,0.45)",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {showingScan && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-2">
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {scanLoading ? (
                "Tražim po barkodu..."
              ) : (
                <>
                  Barkod{" "}
                  <span className="text-white font-bold">{scanBarcode}</span>
                  {" · "}
                  <span className="text-white font-bold">{scanSorted.length}</span> rezultata
                </>
              )}
            </p>
            <button
              type="button"
              onClick={clearScan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Očisti
            </button>
          </div>

          {!scanLoading && !scanNotFound && (scanResults || []).length > 0 && (
            <>
              <p
                className="mb-2"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.45 }}
              >
                {PRICE_DISCLAIMER} Akcije mogu ovisiti o trgovini i roku.
              </p>
              <div className="flex gap-2 mb-3 flex-wrap">
                <button
                  type="button"
                  onClick={() =>
                    setScanSort((s) => (s === "price_asc" ? "sale_first" : "price_asc"))
                  }
                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.65)",
                  }}
                >
                  ↕ {scanSort === "sale_first" ? "Prvo akcije" : "Najniža cijena"}
                </button>
                <button
                  type="button"
                  onClick={() => setScanSaleOnly((v) => !v)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold"
                  style={{
                    background: scanSaleOnly ? "rgba(0,255,136,0.1)" : "rgba(255,255,255,0.05)",
                    border: scanSaleOnly
                      ? "1px solid rgba(0,255,136,0.3)"
                      : "1px solid rgba(255,255,255,0.08)",
                    color: scanSaleOnly ? "#00ff88" : "rgba(255,255,255,0.65)",
                  }}
                >
                  Samo akcije
                </button>
              </div>
            </>
          )}

          {!scanLoading && scanNotFound ? (
            <div className="py-10 text-center">
              <div className="text-5xl mb-4 opacity-40">📷</div>
              <p className="font-black mb-2" style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>
                Proizvod nije pronađen u bazi
              </p>
              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.22)",
                  lineHeight: 1.7,
                  marginBottom: 8,
                }}
              >
                Barkod <span className="text-white/50">{scanBarcode}</span> nije u redovnim
                cijenama ni kod jednog lanca.
              </p>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", lineHeight: 1.6 }}>
                Pokušaj skenirati ponovo, unesi EAN ručno, ili potraži proizvod po nazivu.
              </p>
              <div className="mt-5 flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="px-5 py-2.5 rounded-2xl font-bold text-sm"
                  style={{
                    background: "rgba(0,255,136,0.1)",
                    border: "1px solid rgba(0,255,136,0.2)",
                    color: "#00ff88",
                  }}
                >
                  Skeniraj / unesi ponovo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearScan();
                    inputRef.current?.focus();
                  }}
                  className="px-5 py-2.5 rounded-2xl font-bold text-sm"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.55)",
                  }}
                >
                  Traži po nazivu
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-8">
              {scanOnlyRegular && (
                <p
                  className="rounded-xl px-3 py-2"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: "rgba(255,255,255,0.45)",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  Prikazane su redovne cijene. Akcija nije potvrđena po nazivu u bazi — može i dalje
                  biti na polici.
                </p>
              )}
              {!scanLoading && scanSaleOnly && scanSorted.length === 0 && (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
                  Nema potvrđenih akcija za ovaj barkod. Isključi „Samo akcije“.
                </p>
              )}
              {scanSorted.map((p) => (
                <ProductResultCard
                  key={p.id}
                  p={p}
                  onSelect={onProductSelect}
                  onAddToCart={handleAddToCart}
                  showMeta
                />
              ))}
              {!scanLoading && scanSorted.length > 0 && (
                <button
                  type="button"
                  onClick={() => onGoCart?.()}
                  className="mt-1 w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 13,
                  }}
                >
                  <ShoppingCart size={15} />
                  Otvori košaricu
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!showingScan && !query && history.length > 0 && (
        <div className="px-4 pb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold" style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
              NEDAVNI SKENOVI
            </p>
            <button
              type="button"
              onClick={() => setHistory(clearScanHistory())}
              className="text-[11px] font-semibold"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              Očisti
            </button>
          </div>
          <ul className="flex flex-col gap-1.5">
            {history.map((h) => (
              <li key={`${h.barcode}-${h.at}`}>
                <button
                  type="button"
                  onClick={() => runBarcodeLookup(h.barcode)}
                  className="w-full text-left rounded-xl px-3 py-2.5"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="font-bold text-white truncate" style={{ fontSize: 13 }}>
                    {h.name || h.barcode}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
                    {h.barcode}
                    {h.found ? "" : " · nije u bazi"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showingScan && query && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {loading ? (
                "Tražim..."
              ) : (
                <>
                  <span className="text-white font-bold">{results.length}</span> rezultata
                </>
              )}
            </p>
            <button
              type="button"
              onClick={() => setSort((s) => (s === "discount" ? "price_asc" : "discount"))}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              ↕ {sortMode === "discount" ? "Najveći popust" : "Najniža cijena"}
            </button>
          </div>

          {!loading && results.length > 0 && (
            <p
              className="mb-3"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.45 }}
            >
              {PRICE_DISCLAIMER}
            </p>
          )}

          {!loading && results.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-5xl mb-4 opacity-40">🔍</div>
              <p className="font-black mb-2" style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>
                Nema rezultata
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", lineHeight: 1.7 }}>
                Pokušaj s drugim pojmom
              </p>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="mt-4 px-5 py-2.5 rounded-2xl font-bold text-sm"
                style={{
                  background: "rgba(0,255,136,0.1)",
                  border: "1px solid rgba(0,255,136,0.2)",
                  color: "#00ff88",
                }}
              >
                Očisti pretragu
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-8">
              {results.map((p) => (
                <ProductResultCard
                  key={p.id}
                  p={p}
                  highlightQuery={query}
                  onSelect={onProductSelect}
                  showMeta
                />
              ))}
            </div>
          )}
        </div>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleDetected}
      />
    </div>
  );
}
