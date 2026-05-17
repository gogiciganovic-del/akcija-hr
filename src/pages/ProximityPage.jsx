import { useState, useCallback } from "react";
import { Navigation } from "lucide-react";
import { useProximity } from "../hooks/useProximity";

const fmt = (v) => v.toLocaleString("hr-HR", { style: "currency", currency: "EUR" });
const DIST_OPTIONS = [500, 1000, 2000, 5000];

const STORE_COLORS = {
  Lidl: "#00c864", Kaufland: "#d4af37", Spar: "#e63329",
  Konzum: "#d4af37", Eurospin: "#0055a5", Plodine: "#e63329",
};

const STORE_EMOJI = {
  Lidl: "🛒", Kaufland: "🏪", Spar: "🛍", Konzum: "🏪", Eurospin: "💛", Plodine: "🟠",
};

export function ProximityPage({ onProductSelect }) {
  const [maxDist, setMaxDist] = useState(2);
  const { deals, loading, error } = useProximity({ radiusKm: maxDist });

  // Grupiraj po trgovini
  const storeGroups = deals.reduce((acc, deal) => {
    const key = deal.store
    if (!acc[key]) acc[key] = { name: key, deals: [], distanceM: deal.distanceM || 0 }
    acc[key].deals.push(deal)
    return acc
  }, {})

  const nearbyStores = Object.values(storeGroups)
    .sort((a, b) => a.distanceM - b.distanceM)

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-white" style={{ fontSize:26,letterSpacing:"-0.03em" }}>Blizina</h1>
        </div>
        <p style={{ color:"rgba(255,255,255,0.3)",fontSize:13,marginBottom:14 }}>
          {loading ? "Tražim lokaciju..." : (
            error ? <span style={{ color:"#ff6b6b" }}>{error}</span>
            : <><span style={{ color:"#00ff88" }}>{nearbyStores.length} trgovina</span> u blizini</>
          )}
        </p>

        <div className="grid grid-cols-4 gap-1.5 mb-6">
          {DIST_OPTIONS.map((d) => (
            <button key={d} onClick={() => setMaxDist(d / 1000)}
              className="py-2 rounded-[14px] text-center text-[11px] font-bold transition-all duration-200"
              style={{ background: maxDist===(d/1000)?"rgba(0,255,136,0.1)":"rgba(255,255,255,0.04)",
                border: maxDist===(d/1000)?"1px solid rgba(0,255,136,0.3)":"1px solid rgba(255,255,255,0.08)",
                color: maxDist===(d/1000)?"#00ff88":"rgba(255,255,255,0.4)" }}>
              {d >= 1000 ? `${d/1000} km` : `${d}m`}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-8">
        {loading && (
          <div className="py-20 text-center">
            <div className="text-5xl mb-4 opacity-40">📍</div>
            <p style={{ color:"rgba(255,255,255,0.3)",fontSize:14 }}>Tražim akcije u blizini...</p>
          </div>
        )}

        {!loading && nearbyStores.length === 0 && !error && (
          <div className="py-10 text-center">
            <div className="text-5xl mb-4 opacity-40">📍</div>
            <p className="font-black mb-2" style={{ fontSize:18,color:"rgba(255,255,255,0.4)" }}>Nema trgovina u blizini</p>
            <p style={{ fontSize:13,color:"rgba(255,255,255,0.22)",lineHeight:1.7 }}>Povećaj radijus pretrage</p>
          </div>
        )}

        {nearbyStores.map((store) => {
          const color = STORE_COLORS[store.name] || "#8888aa"
          const emoji = STORE_EMOJI[store.name] || "🏪"
          return (
            <div key={store.name} className="mb-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center text-base flex-shrink-0"
                    style={{ background:`${color}18`, border:`1px solid ${color}40` }}>
                    {emoji}
                  </div>
                  <div>
                    <p className="font-black text-white" style={{ fontSize:14 }}>{store.name}</p>
                    <p style={{ fontSize:11,color:"#00ff88",fontWeight:700 }}>
                      📍 {store.distanceM ? `${store.distanceM}m` : "U blizini"} · {store.deals.length} akcija
                    </p>
                  </div>
                </div>
                <button className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-[10px] font-bold"
                  style={{ background:"rgba(0,255,136,0.08)",border:"1px solid rgba(0,255,136,0.18)",color:"#00ff88" }}>
                  <Navigation size={11} /> Navigiraj
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {store.deals.map((p) => (
                  <div key={p.id} onClick={() => onProductSelect(p)}
                    className="flex items-center rounded-[14px] overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                    style={{ background:"rgba(255,255,255,0.03)",
                      border: p.isGlitch?"1px solid rgba(0,255,136,0.14)":"1px solid rgba(255,255,255,0.06)" }}>
                    <img src={p.image} alt={p.name} className="flex-shrink-0 object-cover"
                      style={{ width:70,height:70,background:p.imageBg,opacity:0.85 }}
                      onError={(e)=>e.target.style.display="none"} />
                    <div className="flex-1 px-3 py-2.5 min-w-0">
                      <p className="font-bold text-white text-[12px] leading-tight mb-1 truncate">{p.name}</p>
                      <p style={{ color:"rgba(255,255,255,0.3)",fontSize:10,marginBottom:6 }}>{p.category}{p.isHot?" · 🔥":""}</p>
                      <div className="flex items-center gap-2">
                        <div>
                          <p style={{ color:"rgba(255,255,255,0.25)",fontSize:10,textDecoration:"line-through" }}>{fmt(p.originalPrice)}</p>
                          <p className="font-black text-white" style={{ fontSize:15,letterSpacing:"-0.02em" }}>{fmt(p.salePrice)}</p>
                        </div>
                        <div className="ml-auto px-1.5 py-0.5 rounded-lg font-black text-[9.5px]"
                          style={{ background: p.isGlitch?"linear-gradient(135deg,#00ff88,#00cc6a)":"linear-gradient(135deg,#ffd700,#ffaa00)", color:"#020617" }}>
                          -{p.discount}%
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4" style={{ height:1,background:"rgba(255,255,255,0.05)" }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
