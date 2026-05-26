import { useState, useRef } from "react";
import { X } from "lucide-react";
import { CjenkoFace } from "../components/CjenkoFace";
import { useProducts } from "../hooks/useProducts";
import { chainFromStoreName } from "../lib/constants";

function highlight(text, query) {
  if (!query) return text;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(re);
  return parts.map((part, i) =>
    re.test(part) ? <mark key={i} style={{ background:"transparent",color:"#00ff88",fontWeight:900 }}>{part}</mark> : part
  );
}

const fmt = (v) => v.toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

export function SearchPage({ onProductSelect }) {
  const [query, setQuery]   = useState("");
  const [sortMode, setSort] = useState("discount");
  const [catFilter, setCat] = useState("Sve");
  const inputRef = useRef(null);

  const { products, loading } = useProducts({
    search: query.trim() || undefined,
    sortBy: sortMode,
  });

  const results = catFilter !== "Sve"
    ? products.filter(p => p.category === catFilter)
    : products;

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto" style={{ scrollbarWidth:"none" }}>
      <div className="px-4 pt-8 pb-4">
        <h1 className="font-black text-white mb-1" style={{ fontSize:26,letterSpacing:"-0.03em" }}>Pretraga</h1>
        <p style={{ color:"rgba(255,255,255,0.3)",fontSize:13,marginBottom:16 }}>Pronađi svoju sljedeću uštedu</p>

        <div className="relative mb-4">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
            <CjenkoFace size={22} />
          </div>
          <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Npr. Nike, Lidl, kava..."
            className="w-full rounded-2xl pl-11 pr-11 py-3.5 text-white text-[15px] outline-none transition-all duration-200"
            style={{ background:"rgba(255,255,255,0.05)",
              border: query ? "1px solid rgba(0,255,136,0.4)" : "1px solid rgba(255,255,255,0.1)",
              fontFamily:"'DM Sans',sans-serif",
              boxShadow: query ? "0 0 0 3px rgba(0,255,136,0.06)" : "none" }} />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background:"rgba(255,255,255,0.08)" }}>
              <X size={13} style={{ color:"rgba(255,255,255,0.5)" }} />
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto mb-2" style={{ scrollbarWidth:"none" }}>
          {["Sve"].map((c) => (
            <button key={c} onClick={() => setCat(c)}
              className="whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0 transition-all duration-200"
              style={{ background: catFilter===c?"rgba(0,255,136,0.1)":"rgba(255,255,255,0.04)",
                border: catFilter===c?"1px solid rgba(0,255,136,0.3)":"1px solid rgba(255,255,255,0.07)",
                color: catFilter===c?"#00ff88":"rgba(255,255,255,0.45)" }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {query && (
        <div className="px-4">
          <div className="flex items-center justify-between mb-3">
            <p style={{ fontSize:12,color:"rgba(255,255,255,0.4)" }}>
              {loading ? "Tražim..." : <><span className="text-white font-bold">{results.length}</span> rezultata</>}
            </p>
            <button onClick={() => setSort(s => s==="discount"?"price_asc":"discount")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.6)" }}>
              ↕ {sortMode==="discount"?"Najveći popust":"Najniža cijena"}
            </button>
          </div>

          {!loading && results.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-5xl mb-4 opacity-40">🔍</div>
              <p className="font-black mb-2" style={{ fontSize:18,color:"rgba(255,255,255,0.4)" }}>Nema rezultata</p>
              <p style={{ fontSize:13,color:"rgba(255,255,255,0.22)",lineHeight:1.7 }}>Pokušaj s drugim pojmom</p>
              <button onClick={() => setQuery("")}
                className="mt-4 px-5 py-2.5 rounded-2xl font-bold text-sm"
                style={{ background:"rgba(0,255,136,0.1)",border:"1px solid rgba(0,255,136,0.2)",color:"#00ff88" }}>
                Očisti pretragu
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5 pb-8">
              {results.map((p) => {
                const storeLabel = p.chain ?? chainFromStoreName(p.store);
                return (
                <div key={p.id} onClick={() => onProductSelect(p)}
                  className="flex items-center rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                  style={{ background:"rgba(255,255,255,0.03)",
                    border: p.isGlitch?"1px solid rgba(0,255,136,0.14)":"1px solid rgba(255,255,255,0.06)" }}>
                  <img src={p.image} alt={p.name} className="flex-shrink-0 object-cover"
                    style={{ width:80,height:80,background:p.imageBg,opacity:0.85 }}
                    onError={(e) => e.target.style.display="none"} />
                  <div className="flex-1 px-3 py-2.5 min-w-0">
                    <p className="font-bold text-white text-[12.5px] leading-tight mb-1 truncate">{highlight(p.name,query)}</p>
                    {storeLabel && (
                      <p className="truncate" style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginBottom: 6 }}>
                        {storeLabel}
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <div>
                        <p style={{ color:"rgba(255,255,255,0.25)",fontSize:10,textDecoration:"line-through" }}>{fmt(p.originalPrice)}</p>
                        <p className="font-black text-white" style={{ fontSize:16,letterSpacing:"-0.02em" }}>{fmt(p.salePrice)}</p>
                      </div>
                      <div className="ml-auto px-1.5 py-0.5 rounded-lg font-black text-[10px]"
                        style={{ background: p.isGlitch?"linear-gradient(135deg,#00ff88,#00cc6a)":"linear-gradient(135deg,#ffd700,#ffaa00)", color:"#020617" }}>
                        -{p.discount}%
                      </div>
                    </div>
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
