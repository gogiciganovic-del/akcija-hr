import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, X, Trash2, Loader2, ChevronDown, Share2, MapPin } from "lucide-react";
import { CjenkoFace } from "../components/CjenkoFace";
import { analyzeChainCart, REGULAR_PRICE_CHAINS } from "../lib/cartCompare";
import { useProductSuggestions } from "../hooks/useProductSuggestions";
import { useUserLocation } from "../hooks/useUserLocation";
import { STORES } from "../lib/constants";
import { loadCartDraft, saveCartDraft } from "../lib/cartDraft";
import { enrichItemsWithBarcodes, resolveUniqueBarcode } from "../lib/resolveCartBarcode";
import { PRICE_DISCLAIMER } from "../lib/priceTrust";

const fmtEur = (v) =>
  (v ?? 0).toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

/** Ispod ovoga ušteda nije hero (izbjegava 0,01 € spektakl) — samo UI, ne dira izračun. */
const MIN_SAVINGS_HIGHLIGHT = 0.1;

/** Koliko linija ima cijenu — samo za prikaz X od Y. */
function countFound(lines) {
  if (!Array.isArray(lines)) return 0;
  return lines.filter((l) => l?.available && l.price != null).length;
}

function foundLabel(found, total) {
  if (!total) return null;
  if (found >= total) return `Pronađeno ${total} od ${total} · kompletna košarica`;
  if (found === 0) return `Pronađeno 0 od ${total} · nema pogodaka`;
  return `Pronađeno ${found} od ${total} · djelomična usporedba`;
}

const CHAIN_OPTIONS = STORES.filter((s) => REGULAR_PRICE_CHAINS.includes(s.id));

/**
 * Google Maps pretraga SAMO za taj lanac.
 * S GPS: centrira mapu na korisnika (bliže lokacije).
 * Bez GPS: samo ime lanca — bez grada u queryju (izbjegava "sve u Zagrebu").
 * Ne prikazuje adresu u app UI.
 */
function googleMapsChainUrl(chainLabel, coords) {
  const chain = String(chainLabel || "").trim();
  if (!chain) return "https://www.google.com/maps";

  if (
    coords &&
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng)
  ) {
    return `https://www.google.com/maps/search/${encodeURIComponent(chain)}/@${coords.lat},${coords.lng},14z`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(chain)}`;
}

function OpenInMapsButton({ chainLabel, coords }) {
  const href = googleMapsChainUrl(chainLabel, coords);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold"
      style={{
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.85)",
        fontSize: 12,
        textDecoration: "none",
      }}
    >
      <MapPin size={13} />
      Otvori u Google Maps
    </a>
  );
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

export function CartPage() {
  const initialDraft = loadCartDraft();
  const [selectedChain, setSelectedChain] = useState(initialDraft.selectedChain);
  const [items, setItems] = useState(initialDraft.items);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [chainMenuOpen, setChainMenuOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(null);
  const inputRef = useRef(null);
  const inputWrapRef = useRef(null);
  const chainWrapRef = useRef(null);

  const { coords } = useUserLocation();

  const { suggestions } = useProductSuggestions(input, selectedChain);

  // Persist draft (tab switch / sken → košarica). Ne dira izračun.
  useEffect(() => {
    saveCartDraft({ selectedChain, items });
  }, [selectedChain, items]);

  const clearCartState = useCallback(() => {
    setItems([]);
    setResults(null);
    setError(null);
    setInput("");
  }, []);

  const handleSelectChain = useCallback(
    (chainId) => {
      if (chainId === selectedChain) {
        setChainMenuOpen(false);
        return;
      }
      if (items.length > 0) {
        const ok = window.confirm(
          "Promjena trgovine briše trenutnu košaricu. Nastaviti?"
        );
        if (!ok) {
          setChainMenuOpen(false);
          return;
        }
      }
      setSelectedChain(chainId);
      clearCartState();
      setChainMenuOpen(false);
    },
    [selectedChain, items.length, clearCartState]
  );

  const addFromSuggestion = useCallback(
    async (s) => {
      if (!s?.name) return;
      const name = s.name.trim();
      let barcode = s.barcode || null;
      // Strogi lookup samo ako barkod fali — ne dira cijene ni soft match.
      if (!barcode && selectedChain) {
        barcode = await resolveUniqueBarcode(name, selectedChain);
      }
      setItems((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          name,
          barcode,
          price: s.price,
          originalPrice: s.originalPrice ?? s.price,
          priceSource: s.source,
        },
      ]);
      setInput("");
      setSuggestionsOpen(false);
      setResults(null);
      setError(null);
      inputRef.current?.focus();
    },
    [selectedChain]
  );

  const removeItem = useCallback((id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setResults(null);
  }, []);

  const clearAll = useCallback(() => {
    clearCartState();
  }, [clearCartState]);

  const handleAnalyze = useCallback(async () => {
    if (!selectedChain || items.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setShareFeedback(null);
    setSuggestionsOpen(false);
    try {
      // Prije izračuna dopuni barkode (točan naziv+lanac) — bez soft matcha.
      const enriched = await enrichItemsWithBarcodes(items, selectedChain);
      setItems(enriched);
      const data = await analyzeChainCart(selectedChain, enriched);
      setResults(data);
    } catch (e) {
      setError(e.message || "Greška pri izračunu košarice.");
    } finally {
      setLoading(false);
    }
  }, [selectedChain, items]);

  const handleShareSavings = useCallback(async () => {
    const primary = results?.primary;
    if (!primary || !((primary.savings ?? 0) >= MIN_SAVINGS_HIGHLIGHT)) return;

    const text =
      `Uštedio sam ${fmtEur(primary.savings)} kupujući u ${primary.label} uz Cjenko Akcije! 🛒\n` +
      `https://cjenko.app`;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: "Cjenko Akcije",
          text,
          url: "https://cjenko.app",
        });
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setShareFeedback("Kopirano!");
      window.setTimeout(() => setShareFeedback(null), 2000);
    } catch (e) {
      // Korisnik otkazao share — tiho ignoriraj
      if (e?.name === "AbortError") return;
      setShareFeedback("Kopiranje nije uspjelo");
      window.setTimeout(() => setShareFeedback(null), 2000);
    }
  }, [results]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (suggestionsOpen && suggestions.length > 0) {
        addFromSuggestion(suggestions[0]);
      }
    }
    if (e.key === "Escape") {
      setSuggestionsOpen(false);
      setChainMenuOpen(false);
    }
  };

  useEffect(() => {
    setSuggestionsOpen(
      Boolean(selectedChain) && input.trim().length >= 2 && suggestions.length > 0
    );
  }, [input, suggestions, selectedChain]);

  useEffect(() => {
    function onPointerDown(e) {
      if (inputWrapRef.current && !inputWrapRef.current.contains(e.target)) {
        setSuggestionsOpen(false);
      }
      if (chainWrapRef.current && !chainWrapRef.current.contains(e.target)) {
        setChainMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const selectedMeta = CHAIN_OPTIONS.find((s) => s.id === selectedChain);
  const canType = Boolean(selectedChain);

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-white" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>
            Košarica
          </h1>
          {items.length > 0 && (
            <button
              type="button"
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
          {selectedChain
            ? `${items.length} ${items.length === 1 ? "proizvod" : "proizvoda"} u ${selectedMeta?.label || selectedChain}`
            : "Prvo odaberi trgovinu"}
        </p>
      </div>

      {/* Korak 1: odabir lanca */}
      <div className="px-4 mb-3" ref={chainWrapRef}>
        <p className="mb-1.5 font-semibold" style={{ color: "rgba(255,255,255,0.45)", fontSize: 11 }}>
          Odaberi trgovinu
        </p>
        <div className="relative">
          <button
            type="button"
            onClick={() => setChainMenuOpen((o) => !o)}
            className="w-full flex items-center justify-between rounded-2xl px-4 py-3 text-left"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: chainMenuOpen
                ? "1px solid rgba(239,159,39,0.45)"
                : "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span className="flex items-center gap-2.5 min-w-0">
              {selectedMeta ? (
                <>
                  <img
                    src={selectedMeta.logo}
                    alt=""
                    width={22}
                    height={22}
                    className="rounded-md object-contain flex-shrink-0"
                    style={{ background: "#fff" }}
                  />
                  <span className="text-white font-bold truncate" style={{ fontSize: 15 }}>
                    {selectedMeta.label}
                  </span>
                </>
              ) : (
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 15 }}>
                  Npr. Lidl, Konzum, Spar…
                </span>
              )}
            </span>
            <ChevronDown
              size={18}
              style={{
                color: "rgba(255,255,255,0.45)",
                transform: chainMenuOpen ? "rotate(180deg)" : "none",
                transition: "transform 0.15s",
              }}
            />
          </button>
          {chainMenuOpen && (
            <ul
              className="absolute left-0 right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50 max-h-64 overflow-y-auto"
              style={{
                background: "#0f172a",
                border: "1px solid rgba(255,255,255,0.1)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
              }}
            >
              {CHAIN_OPTIONS.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleSelectChain(s.id)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-white/5"
                    style={{
                      background:
                        s.id === selectedChain ? "rgba(239,159,39,0.12)" : "transparent",
                    }}
                  >
                    <img
                      src={s.logo}
                      alt=""
                      width={20}
                      height={20}
                      className="rounded object-contain"
                      style={{ background: "#fff" }}
                    />
                    <span className="text-white font-medium" style={{ fontSize: 14 }}>
                      {s.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Korak 2: unos proizvoda */}
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
                if (canType && input.trim().length >= 2 && suggestions.length > 0) {
                  setSuggestionsOpen(true);
                }
              }}
              disabled={!canType}
              placeholder={
                canType
                  ? `Traži u ${selectedMeta?.label}…`
                  : "Prvo odaberi trgovinu"
              }
              className="w-full rounded-2xl pl-11 pr-4 py-3 text-white text-[15px] outline-none disabled:opacity-45"
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
                {suggestions.map((s) => (
                  <li key={`${s.source}-${s.name}-${s.barcode || ""}`}>
                    <button
                      type="button"
                      onClick={() => addFromSuggestion(s)}
                      className="w-full text-left px-4 py-2.5 text-white transition-colors hover:bg-white/5 flex items-center gap-2"
                      style={{ fontSize: 14 }}
                    >
                      <span className="truncate flex-1 min-w-0">{s.name}</span>
                      <span
                        className="flex-shrink-0 tabular-nums"
                        style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}
                      >
                        {fmtEur(s.price)}
                      </span>
                      <SourceBadge source={s.source} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (suggestionsOpen && suggestions.length > 0) {
                addFromSuggestion(suggestions[0]);
              }
            }}
            disabled={!canType || !suggestions.length}
            className="flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-opacity"
            style={{
              background: canType && suggestions.length ? "#EF9F27" : "rgba(255,255,255,0.06)",
              color: "#633806",
              opacity: canType && suggestions.length ? 1 : 0.4,
            }}
            aria-label="Dodaj prijedlog"
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
              className="flex items-center justify-between gap-2 rounded-xl px-3.5 py-2.5"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="text-white font-medium truncate" style={{ fontSize: 14 }}>
                  {item.name}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>
                    {fmtEur(item.price)}
                  </span>
                  <SourceBadge source={item.priceSource} />
                </div>
              </div>
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

      {!selectedChain && (
        <p className="px-4 text-center py-8" style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Odaberi trgovinu da kreneš sastavljati košaricu.
        </p>
      )}

      {selectedChain && items.length === 0 && (
        <p className="px-4 text-center py-8" style={{ color: "rgba(255,255,255,0.25)", fontSize: 13 }}>
          Dodaj proizvode iz {selectedMeta?.label} — Cjenko će izračunati ukupno, uštedu i usporedbu s drugim lancima.
        </p>
      )}

      {items.length > 0 && (
        <div className="px-4 mb-4">
          <button
            type="button"
            onClick={handleAnalyze}
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
                Cjenko računa...
              </>
            ) : (
              "Izračunaj košaricu"
            )}
          </button>
        </div>
      )}

      {error && (
        <p className="px-4 mb-4 text-center" style={{ color: "#ff6b6b", fontSize: 13 }}>
          {error}
        </p>
      )}

      {/* Korak 3 + 4: sažetak i druga mjesta */}
      {results?.primary && (
        <div className="px-4 pb-8">
          <div
            className="rounded-2xl p-4 mb-4 flex items-center gap-3"
            style={{ background: "#EF9F27", border: "1px solid rgba(99,56,6,0.15)" }}
          >
            <CjenkoFace size={48} showTag />
            <div>
              <p className="font-black" style={{ color: "#633806", fontSize: 14, lineHeight: 1.35 }}>
                Košarica u {results.primary.label}
              </p>
              <p style={{ color: "rgba(99,56,6,0.75)", fontSize: 12, marginTop: 2 }}>
                Ukupno {fmtEur(results.primary.total)}
              </p>
              {(() => {
                const y = results.itemCount || results.primary.lines?.length || 0;
                const x = countFound(results.primary.lines);
                if (!y || x >= y) return null;
                return (
                  <p style={{ color: "rgba(99,56,6,0.65)", fontSize: 11, marginTop: 4 }}>
                    Pronađeno {x} od {y} artikala
                  </p>
                );
              })()}
            </div>
          </div>

          <div
            className="rounded-2xl p-4 mb-4"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <p className="font-bold mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
              TVOJA KOŠARICA
            </p>
            <p
              className="mb-3"
              style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.45 }}
            >
              {PRICE_DISCLAIMER} Ušteda ovisi o trenutnim akcijama u bazi.
            </p>
            {(results.primary.savings ?? 0) >= MIN_SAVINGS_HIGHLIGHT ? (
              <>
                <p style={{ color: "rgba(0,255,136,0.75)", fontSize: 13, marginBottom: 4 }}>
                  Uštedio si!
                </p>
                <p
                  className="font-black tabular-nums"
                  style={{ color: "#00ff88", fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1.1 }}
                >
                  {fmtEur(results.primary.savings)}
                </p>
                <p
                  className="tabular-nums"
                  style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginTop: 6 }}
                >
                  Ukupno {fmtEur(results.primary.total)}
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={handleShareSavings}
                    className="w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2"
                    style={{
                      background: "rgba(0,255,136,0.1)",
                      border: "1px solid rgba(0,255,136,0.28)",
                      color: "#00ff88",
                      fontSize: 13,
                    }}
                  >
                    <Share2 size={15} />
                    {shareFeedback || "Podijeli uštedu"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="font-black text-white tabular-nums" style={{ fontSize: 22 }}>
                  {fmtEur(results.primary.total)}
                </p>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 4 }}>
                  Nema dodatne uštede na akcijama u ovoj košarici
                </p>
              </>
            )}
            <ul className="mt-3 space-y-2">
              {results.primary.lines.map((line, idx) => (
                <li
                  key={`primary-${idx}-${line.cartName}`}
                  className="flex items-center justify-between gap-2"
                  style={{ fontSize: 13 }}
                >
                  <span className="text-white/80 truncate min-w-0 flex-1">
                    {line.name || line.cartName}
                  </span>
                  {line.available ? (
                    <span className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-white/70 tabular-nums">{fmtEur(line.price)}</span>
                      <SourceBadge source={line.priceSource} />
                    </span>
                  ) : (
                    <span style={{ color: "#ff6b6b", fontSize: 12 }}>nedostupno</span>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <OpenInMapsButton chainLabel={results.primary.label} coords={coords} />
            </div>
          </div>

          {results.others?.length > 0 && (
            <div>
              <p className="font-bold mb-1 px-0.5" style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
                ISTA KOŠARICA DRUGDJE
              </p>
              <p
                className="mb-2 px-0.5"
                style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", lineHeight: 1.4 }}
              >
                Zbroj je samo za pronađene artikle (X od {results.itemCount}). Nije cijela košarica
                ako fali stavka.
              </p>
              <div
                className="rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {results.others.map((row, i) => {
                  const y = results.itemCount || row.lines?.length || 0;
                  const x = countFound(row.lines);
                  const complete = x >= y && y > 0;
                  const none = x === 0;
                  return (
                    <div
                      key={row.chain}
                      className="px-4 py-3.5"
                      style={{
                        background: complete
                          ? "rgba(0,255,136,0.06)"
                          : "rgba(255,255,255,0.03)",
                        borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="font-black text-white" style={{ fontSize: 15 }}>
                          {row.label}
                        </p>
                        <p
                          className="font-bold tabular-nums"
                          style={{
                            fontSize: 14,
                            color: complete
                              ? "#00ff88"
                              : none
                                ? "rgba(255,255,255,0.35)"
                                : "rgba(255,255,255,0.65)",
                          }}
                        >
                          {none ? "—" : fmtEur(row.total)}
                        </p>
                      </div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                        {foundLabel(x, y)}
                        {!complete && !none ? " · zbroj pronađenih" : ""}
                      </p>
                      <ul className="mt-2 space-y-1">
                        {row.lines.map((line, idx) => (
                          <li key={`${row.chain}-${idx}`} className="py-0.5" style={{ fontSize: 12 }}>
                            <div className="flex justify-between gap-2">
                              <span className="truncate text-white/55 min-w-0">
                                {line.cartName}
                              </span>
                              {line.available ? (
                                <span className="tabular-nums text-white/70 flex-shrink-0">
                                  {fmtEur(line.price)}
                                </span>
                              ) : (
                                <span className="flex-shrink-0" style={{ color: "#ff6b6b" }}>
                                  nedostupno
                                </span>
                              )}
                            </div>
                            {!line.available && (
                              <p
                                className="mt-0.5 pr-1"
                                style={{
                                  color: "rgba(255,255,255,0.28)",
                                  fontSize: 10,
                                  lineHeight: 1.35,
                                }}
                              >
                                Vlastita marka ili drugačije pakiranje — nema izravne zamjene kod ovog
                                lanca
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
