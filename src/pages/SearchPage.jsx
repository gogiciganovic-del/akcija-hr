import { useState, useRef, useEffect, useCallback } from "react";
import { X, ScanBarcode } from "lucide-react";
import { CjenkoFace } from "../components/CjenkoFace";
import { useProducts } from "../hooks/useProducts";
import { supabase } from "../lib/supabase";
import { adaptDeal, adaptRegularPrice } from "../lib/adapters";
import { chainFromStoreName } from "../lib/constants";
import { productPlaceholderDataUri } from "../lib/productImage";

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

const fmt = (v) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("hr-HR", {
    style: "currency",
    currency: "EUR",
  });

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
  } else {
    copy.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0));
  }
  return copy;
}

async function findSaleExactForChain(name, chain) {
  const { data, error } = await supabase
    .from("active_deals")
    .select(
      "deal_id, product_id, name, store_name, price, original_price, discount_pct, image_url, category"
    )
    .eq("name", name)
    .order("price", { ascending: true })
    .limit(40);

  if (error) throw error;

  for (const row of data || []) {
    if (chainFromStoreName(row.store_name) !== chain) continue;
    const price = parseFloat(row.price);
    if (Number.isNaN(price)) continue;
    return row;
  }
  return null;
}

async function lookupByBarcode(barcode) {
  const code = String(barcode || "").trim();
  if (!code) return [];

  const { data: regRows, error } = await supabase
    .from("regular_prices")
    .select("barcode, name, brand, chain, price, category, special_price")
    .eq("barcode", code)
    .order("price", { ascending: true });

  if (error) throw error;
  if (!regRows?.length) return [];

  const results = [];
  for (let i = 0; i < regRows.length; i++) {
    const row = regRows[i];
    const exactName = (row.name || "").trim();
    const saleRow = exactName ? await findSaleExactForChain(exactName, row.chain) : null;

    if (saleRow) {
      const adapted = adaptDeal(saleRow);
      results.push({
        ...adapted,
        id: `scan-sale-${row.chain}-${code}-${i}`,
        chain: row.chain,
        priceSource: "sale",
        image: adapted.image || productPlaceholderDataUri(adapted.name, 80),
      });
    } else {
      const adapted = adaptRegularPrice(row);
      results.push({
        ...adapted,
        id: `scan-regular-${row.chain}-${code}-${i}`,
        image: productPlaceholderDataUri(row.name, 80),
      });
    }
  }
  return results;
}

function ProductResultCard({ p, highlightQuery, onSelect }) {
  const isRegular = p.priceSource === "regular";
  const storeLabel = p.chain ?? chainFromStoreName(p.store);
  const imgSrc = isRegular
    ? productPlaceholderDataUri(p.name, 80)
    : p.image || productPlaceholderDataUri(p.name, 80);
  const showStrike =
    !isRegular && Number.isFinite(p.originalPrice) && p.originalPrice > p.salePrice;
  const showDiscount = !isRegular && (p.discount ?? 0) > 0;

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
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginBottom: 6 }}
          >
            {storeLabel}
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
              className="ml-auto px-1.5 py-0.5 rounded-lg font-black text-[10px]"
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
        </div>
      </div>
    </div>
  );
}

export function SearchPage({ onProductSelect }) {
  const [query, setQuery] = useState("");
  const [sortMode, setSort] = useState("discount");
  const [catFilter, setCat] = useState("Sve");
  const [regularProducts, setRegularProducts] = useState([]);
  const [regularLoading, setRegularLoading] = useState(false);
  const inputRef = useRef(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  const [scannerStatus, setScannerStatus] = useState("");
  const [scanResults, setScanResults] = useState(null);
  const [scanBarcode, setScanBarcode] = useState(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanNotFound, setScanNotFound] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const scannedLockRef = useRef(false);

  const searchTerm = query.trim();
  const { products: saleProducts, loading: saleLoading } = useProducts({
    search: searchTerm || undefined,
    sortBy: sortMode,
  });

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    detectorRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const closeScanner = useCallback(() => {
    scannedLockRef.current = false;
    stopCamera();
    setScannerOpen(false);
    setScannerError(null);
    setScannerStatus("");
  }, [stopCamera]);

  const runBarcodeLookup = useCallback(async (code) => {
    setScanLoading(true);
    setScanNotFound(false);
    setScanResults(null);
    setScanBarcode(code);
    setQuery("");
    try {
      const list = await lookupByBarcode(code);
      if (!list.length) {
        setScanNotFound(true);
        setScanResults([]);
      } else {
        setScanNotFound(false);
        setScanResults(list);
      }
    } catch {
      setScanNotFound(true);
      setScanResults([]);
    } finally {
      setScanLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!scannerOpen) return;

    scannedLockRef.current = false;
    setScannerError(null);
    setScannerStatus("Pokrećem kameru...");

    if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
      setScannerError("Skeniranje nije podržano na ovom uređaju");
      setScannerStatus("");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Skeniranje nije podržano na ovom uređaju");
      setScannerStatus("");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a"],
        });
        detectorRef.current = detector;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();
        setScannerStatus("Usmjeri kameru na barkod");

        const tick = async () => {
          if (cancelled || scannedLockRef.current) return;
          const v = videoRef.current;
          const det = detectorRef.current;
          if (v && det && v.readyState >= 2) {
            try {
              const codes = await det.detect(v);
              if (codes?.length && !scannedLockRef.current) {
                const raw = codes[0].rawValue;
                if (raw) {
                  scannedLockRef.current = true;
                  setScannerStatus("Pronađen barkod...");
                  stopCamera();
                  setScannerOpen(false);
                  setScannerError(null);
                  setScannerStatus("");
                  await runBarcodeLookup(raw);
                  return;
                }
              }
            } catch {
              // ignore frame errors
            }
          }
          rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        const denied =
          err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        setScannerError(
          denied
            ? "Dopusti pristup kameri da skeniraš barkod"
            : "Skeniranje nije podržano na ovom uređaju"
        );
        setScannerStatus("");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [scannerOpen, stopCamera, runBarcodeLookup]);

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
  const scanSorted = sortProducts(scanResults || [], sortMode === "discount" ? "price_asc" : sortMode);

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
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl px-3"
            style={{
              minWidth: 72,
              background: "rgba(0,255,136,0.08)",
              border: "1px solid rgba(0,255,136,0.25)",
              color: "#00ff88",
            }}
            aria-label="Skeniraj barkod"
          >
            <ScanBarcode size={20} strokeWidth={2} />
            <span style={{ fontSize: 10, fontWeight: 700 }}>Skeniraj</span>
          </button>
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
          <div className="flex items-center justify-between mb-3">
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

          {!scanLoading && scanNotFound ? (
            <div className="py-10 text-center">
              <div className="text-5xl mb-4 opacity-40">📷</div>
              <p className="font-black mb-2" style={{ fontSize: 18, color: "rgba(255,255,255,0.4)" }}>
                Proizvod nije pronađen u bazi
              </p>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.22)", lineHeight: 1.7 }}>
                Barkod {scanBarcode} nije u redovnim cijenama ni kod jednog lanca
              </p>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="mt-4 px-5 py-2.5 rounded-2xl font-bold text-sm"
                style={{
                  background: "rgba(0,255,136,0.1)",
                  border: "1px solid rgba(0,255,136,0.2)",
                  color: "#00ff88",
                }}
              >
                Skeniraj ponovo
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-8">
              {scanSorted.map((p) => (
                <ProductResultCard key={p.id} p={p} onSelect={onProductSelect} />
              ))}
            </div>
          )}
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
                />
              ))}
            </div>
          )}
        </div>
      )}

      {scannerOpen && (
        <div
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: "#020617" }}
        >
          <div className="flex items-center justify-between px-4 pt-4 pb-3">
            <p className="font-bold text-white" style={{ fontSize: 16 }}>
              Skeniraj barkod
            </p>
            <button
              type="button"
              onClick={closeScanner}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.08)" }}
              aria-label="Zatvori skener"
            >
              <X size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
            </button>
          </div>

          <div className="flex-1 relative mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: "#000" }}>
            {!scannerError && (
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {scannerError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                <p className="font-black mb-2" style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>
                  {scannerError}
                </p>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                  Koristi tekstualnu pretragu ili otvori aplikaciju u Chromeu na Androidu.
                </p>
              </div>
            ) : (
              <div
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                style={{
                  width: "72%",
                  maxWidth: 280,
                  aspectRatio: "3 / 1.2",
                  border: "2px solid rgba(0,255,136,0.65)",
                  borderRadius: 12,
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
                }}
              />
            )}
          </div>

          <p
            className="text-center pb-8 px-4"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}
          >
            {scannerError ? " " : scannerStatus || " "}
          </p>
        </div>
      )}
    </div>
  );
}
