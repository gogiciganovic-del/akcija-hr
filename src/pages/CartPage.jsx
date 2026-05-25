import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, X, Trash2, Loader2 } from "lucide-react";
import { CjenkoFace } from "../components/CjenkoFace";
import { compareCart } from "../lib/cartCompare";
import { useProductSuggestions } from "../hooks/useProductSuggestions";
import { resolveProductImage, productPlaceholderDataUri } from "../lib/productImage";

const fmtEur = (v) =>
  v.toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

function newItem(name) {
  return { id: crypto.randomUUID(), name: name.trim() };
}

function CartResultThumb({ product, onSelect }) {
  const src = product.image || resolveProductImage(product.name, product.image_url, 64);
  const fallback = productPlaceholderDataUri(product.name, 64);
  const price = product.salePrice ?? product.price;

  return (
    <button
      type="button"
      onClick={() => onSelect?.(product)}
      className="flex-shrink-0 rounded-xl overflow-hidden cursor-pointer transition-transform hover:scale-[1.03] active:scale-[0.98]"
      style={{
        width: 64,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      title={`${product.name} — ${fmtEur(price)}`}
      aria-label={`Detalji: ${product.name}`}
    >
      <img
        src={src}
        alt={product.name}
        width={64}
        height={64}
        loading="eager"
        decoding="async"
        referrerPolicy="no-referrer"
        className="block w-full object-cover pointer-events-none"
        style={{ height: 64, minHeight: 64, background: product.imageBg || "#0d1f3a" }}
        onError={(e) => {
          if (e.currentTarget.src !== fallback) {
            e.currentTarget.onerror = null;
            e.currentTarget.src = fallback;
          }
        }}
      />
    </button>
  );
}

export function CartPage({ onProductSelect }) {
  const [items, setItems] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputRef = useRef(null);
  const inputWrapRef = useRef(null);

  const { suggestions } = useProductSuggestions(input);

  const addByName = useCallback((name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setItems((prev) => [...prev, newItem(trimmed)]);
    setInput("");
    setSuggestionsOpen(false);
    setResults(null);
    setError(null);
    inputRef.current?.focus();
  }, []);

  const addItem = useCallback(() => {
    addByName(input);
  }, [input, addByName]);

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setResults(null);
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
    setResults(null);
    setError(null);
  }, []);

  const handleCompare = useCallback(async () => {
    if (items.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setSuggestionsOpen(false);
    try {
      const data = await compareCart(items);
      setResults(data);
    } catch (e) {
      setError(e.message || "Greška pri pretrazi.");
    } finally {
      setLoading(false);
    }
  }, [items]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestionsOpen && suggestions.length > 0) {
        addByName(suggestions[0]);
      } else {
        addItem();
      }
    }
    if (e.key === "Escape") setSuggestionsOpen(false);
  };

  useEffect(() => {
    setSuggestionsOpen(input.trim().length >= 2 && suggestions.length > 0);
  }, [input, suggestions]);

  useEffect(() => {
    function onPointerDown(e) {
      if (inputWrapRef.current && !inputWrapRef.current.contains(e.target)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-white" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>
            Košarica
          </h1>
          {items.length > 0 && (
            <button
              onClick={clearAll}
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
          {items.length} {items.length === 1 ? "proizvod" : "proizvoda"} na listi
        </p>
      </div>

      <div className="px-4 mb-4">
        <div className="flex gap-2">
          <div ref={inputWrapRef} className="relative flex-1">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
              <CjenkoFace size={22} />
            </div>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (input.trim().length >= 2 && suggestions.length > 0) setSuggestionsOpen(true);
              }}
              placeholder="Npr. Nutella, mlijeko, kruh..."
              className="w-full rounded-2xl pl-11 pr-4 py-3 text-white text-[15px] outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: suggestionsOpen
                  ? "1px solid rgba(239,159,39,0.45)"
                  : "1px solid rgba(255,255,255,0.1)",
                fontFamily: "'DM Sans', sans-serif",
              }}
              autoComplete="off"
            />
            {suggestionsOpen && (
              <ul
                className="absolute left-0 right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50"
                style={{
                  background: "#0f172a",
                  border: "1px solid rgba(255,255,255,0.1)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
                }}
              >
                {suggestions.map((name) => (
                  <li key={name}>
                    <button
                      type="button"
                      onClick={() => addByName(name)}
                      className="w-full text-left px-4 py-2.5 text-white truncate transition-colors hover:bg-white/5"
                      style={{ fontSize: 14 }}
                    >
                      {name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={addItem}
            disabled={!input.trim()}
            className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-opacity"
            style={{
              background: input.trim() ? "#EF9F27" : "rgba(255,255,255,0.06)",
              color: "#633806",
              opacity: input.trim() ? 1 : 0.4,
            }}
          >
            <Plus size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {items.length > 0 && (
        <ul className="px-4 mb-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <span className="text-white font-medium truncate pr-2" style={{ fontSize: 14 }}>
                {item.name}
              </span>
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.08)" }}
                aria-label="Ukloni"
              >
                <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length === 0 && (
        <p className="px-4 text-center py-8" style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Dodaj proizvode koje želiš kupiti — Cjenko će pronaći najjeftiniju košaricu po trgovinama.
        </p>
      )}

      {items.length > 0 && (
        <div className="px-4 mb-4">
          <button
            type="button"
            onClick={handleCompare}
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-black flex items-center justify-center gap-2 transition-opacity"
            style={{
              background: "#EF9F27",
              color: "#633806",
              fontSize: 15,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Cjenko pretražuje...
              </>
            ) : (
              "Pronađi najjeftinije"
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="px-4 mb-4 text-center" style={{ color: "#ff6b6b", fontSize: 13 }}>
          {error}
        </p>
      )}

      {results && results.rankings.length > 0 && (
        <div className="px-4 pb-8">
          <div
            className="rounded-2xl p-4 mb-4 flex items-center gap-3"
            style={{ background: "#EF9F27", border: "1px solid rgba(99,56,6,0.15)" }}
          >
            <CjenkoFace size={48} showTag />
            <p className="font-black" style={{ color: "#633806", fontSize: 14, lineHeight: 1.35 }}>
              Pronašao sam ti najjeftiniju košaricu!
            </p>
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {results.rankings.map((row) => {
              const best = row.isBest;
              const totalItems = results.itemCount ?? items.length;
              return (
                <div
                  key={row.chain}
                  className="px-4 py-3.5"
                  style={{
                    background: best ? "rgba(0,255,136,0.1)" : "rgba(255,255,255,0.03)",
                    borderTop: best ? "none" : "1px solid rgba(255,255,255,0.06)",
                    boxShadow: best ? "inset 0 0 0 1px rgba(0,255,136,0.35)" : "none",
                  }}
                >
                  {best && (
                    <p
                      className="font-bold mb-1.5"
                      style={{ fontSize: 9, color: "#00ff88", letterSpacing: "0.08em" }}
                    >
                      NAJBOLJA PONUDA
                    </p>
                  )}
                  <p
                    className="font-black"
                    style={{
                      fontSize: 15,
                      color: best ? "#00ff88" : "rgba(255,255,255,0.9)",
                    }}
                  >
                    {row.label} — {fmtEur(row.total)}
                  </p>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {row.found} od {totalItems} stavki
                    {row.complete ? " · kompletna košarica" : ""}
                  </p>
                  {row.items?.length > 0 && (
                    <div className="flex gap-2 mt-3 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
                      {row.items.map((product, idx) => (
                        <CartResultThumb
                          key={`${row.chain}-${idx}-${product.cartName || ""}-${product.id || product.name}`}
                          product={product}
                          onSelect={onProductSelect}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {results.unmatched.length > 0 && (
            <p className="mt-3 text-center" style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
              Nije pronađeno u bazi: {results.unmatched.join(", ")}
            </p>
          )}
        </div>
      )}

      {results && results.rankings.length === 0 && (
        <div
          className="mx-4 mb-8 rounded-2xl p-5 text-center"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>
            Nema podataka za proizvode na listi. Pokušaj drugačije nazive.
          </p>
          {results.unmatched.length > 0 && (
            <p className="mt-2" style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
              Nije pronađeno: {results.unmatched.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
