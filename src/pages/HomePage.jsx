import { useState } from "react";
import { Zap, Star, Search, ChevronRight } from "lucide-react";
import { ProductCard } from "../components/ProductCard";
import { useProducts } from "../hooks/useProducts";
import { CATEGORIES } from "../lib/constants";

function HeroCard({ onOpen }) {
  return (
    <div onClick={onOpen} className="relative rounded-3xl overflow-hidden cursor-pointer mx-4 mb-4 transition-all duration-300 hover:-translate-y-0.5"
      style={{ background: "linear-gradient(135deg,rgba(15,12,5,0.97),rgba(22,18,7,0.98))", border: "1px solid rgba(212,175,55,0.22)", minHeight: 170 }}>
      <div className="absolute pointer-events-none" style={{ top:-40,right:-40,width:180,height:180,background:"radial-gradient(circle,rgba(212,175,55,0.22),transparent 70%)" }} />
      <div className="absolute bottom-0 left-0 right-0 h-px pointer-events-none" style={{ background:"linear-gradient(90deg,transparent,rgba(212,175,55,0.45),transparent)" }} />
      <div className="relative z-10 p-[22px]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <span style={{ color:"rgba(212,175,55,0.55)",fontSize:9,fontWeight:700,letterSpacing:"0.2em" }}>✦ PREMIUM PARTNER</span>
            </div>
            <h2 className="font-black text-white" style={{ fontSize:26,letterSpacing:"-0.03em",lineHeight:1.1 }}>Konzum PLUS</h2>
            <p style={{ color:"rgba(255,255,255,0.4)",fontSize:12,marginTop:4 }}>Ekskluzivne ponude samo za vas</p>
          </div>
          <div className="flex items-center justify-center rounded-[14px] font-black flex-shrink-0"
            style={{ width:54,height:54,background:"linear-gradient(135deg,#d4af37,#f5d981)",color:"#020617",fontSize:13 }}>K+</div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex-1 rounded-[14px] px-3.5 py-2.5"
            style={{ background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.15)" }}>
            <p style={{ color:"rgba(212,175,55,0.6)",fontSize:8,fontWeight:700,letterSpacing:"0.18em",marginBottom:3 }}>OVOTJEDNA PONUDA</p>
            <p className="font-bold text-white" style={{ fontSize:13 }}>Do -50% na svježe meso</p>
          </div>
          <div className="flex items-center justify-center rounded-[14px] flex-shrink-0"
            style={{ width:44,height:44,background:"rgba(212,175,55,0.12)",border:"1px solid rgba(212,175,55,0.28)",color:"#d4af37",fontSize:18 }}>↗</div>
        </div>
      </div>
    </div>
  );
}

function StatsRow({ total }) {
  const stats = [
    { label:"Aktivnih akcija", value: total.toString(), color:"#00ff88" },
    { label:"Glitch cijena",   value: Math.floor(total * 0.3).toString(), color:"#ffd700" },
    { label:"Prosj. ušteda",   value:"-45%",  color:"#ff6b6b" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mx-4 mb-4">
      {stats.map(({ label,value,color }) => (
        <div key={label} className="rounded-2xl p-3 text-center"
          style={{ background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)" }}>
          <p className="font-black" style={{ fontSize:15,letterSpacing:"-0.02em",color }}>{value}</p>
          <p style={{ color:"rgba(255,255,255,0.28)",fontSize:9,marginTop:2,lineHeight:1.35 }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

export function HomePage({ onProductSelect, onSponsorOpen, onSearchFocus, isFav, onToggleFav }) {
  const [activeCat, setActiveCat] = useState(null);
  const { products, loading } = useProducts({ category: activeCat, sortBy: 'discount' });

  const glitchProducts  = products.filter((p) => p.isGlitch);
  const regularProducts = products.filter((p) => !p.isGlitch);

  return (
    <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth:"none" }}>
      <div className="flex items-center justify-between px-5 pt-12 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-[26px] h-[26px] rounded-lg flex items-center justify-center"
              style={{ background:"linear-gradient(135deg,#00ff88,#00cc6a)" }}>
              <Zap size={13} fill="#020617" stroke="none" />
            </div>
            <h1 className="font-black text-white" style={{ fontSize:21,letterSpacing:"-0.03em" }}>
              akcije<span style={{ color:"#00ff88" }}>.hr</span>
            </h1>
          </div>
          <p style={{ color:"rgba(255,255,255,0.28)",fontSize:10,marginTop:2 }}>Zagreb, HR · Ažurirano upravo</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
          style={{ background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)" }}>
          <Star size={11} fill="#ffd700" stroke="#ffd700" />
          <span style={{ color:"rgba(255,255,255,0.7)",fontSize:11,fontWeight:700 }}>PRO</span>
        </div>
      </div>

      <div onClick={onSearchFocus} className="mx-4 mb-4 flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer"
        style={{ background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.07)" }}>
        <Search size={14} style={{ color:"rgba(255,255,255,0.3)" }} />
        <span style={{ color:"rgba(255,255,255,0.2)",fontSize:13 }}>Traži akcije, proizvode, trgovine…</span>
      </div>

      <HeroCard onOpen={onSponsorOpen} />
      <StatsRow total={products.length} />

      <div className="flex gap-2 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth:"none" }}>
        {CATEGORIES.map((c) => (
          <button key={c.label} onClick={() => setActiveCat(c.id)}
            className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0 transition-all duration-200"
            style={{ background: activeCat===c.id?"#00ff88":"rgba(255,255,255,0.05)",
              color: activeCat===c.id?"#020617":"rgba(255,255,255,0.45)",
              border: activeCat===c.id?"1px solid #00ff88":"1px solid rgba(255,255,255,0.06)" }}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p style={{ color:"rgba(255,255,255,0.3)",fontSize:14 }}>Učitavanje akcija...</p>
        </div>
      ) : (
        <>
          <section className="mb-5">
            <div className="flex items-center justify-between px-4 mb-3">
              <div>
                <h2 className="font-black text-white" style={{ fontSize:16,letterSpacing:"-0.02em" }}>⚡ Glitch Cijene</h2>
                <p style={{ color:"rgba(255,255,255,0.28)",fontSize:10,marginTop:2 }}>{glitchProducts.length} aktivnih · Ograničeno</p>
              </div>
              <button className="flex items-center gap-0.5" style={{ color:"#00ff88",fontSize:11,fontWeight:700 }}>
                Sve <ChevronRight size={12} />
              </button>
            </div>
            {glitchProducts.length === 0 ? (
              <p className="px-4" style={{ color:"rgba(255,255,255,0.2)",fontSize:13 }}>Nema glitch cijena trenutno.</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 px-4 mb-2.5">
                  {glitchProducts.slice(0,2).map((p) => (
                    <ProductCard key={p.id} product={p} isFavorite={isFav(p.id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(p)} />
                  ))}
                </div>
                {glitchProducts[2] && (
                  <div className="px-4">
                    <ProductCard product={glitchProducts[2]} size="large" isFavorite={isFav(glitchProducts[2].id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(glitchProducts[2])} />
                  </div>
                )}
              </>
            )}
          </section>

          <section className="mb-5">
            <div className="flex items-center justify-between px-4 mb-3">
              <div>
                <h2 className="font-black text-white" style={{ fontSize:16,letterSpacing:"-0.02em" }}>🔥 Danas Ističe</h2>
                <p style={{ color:"rgba(255,255,255,0.28)",fontSize:10,marginTop:2 }}>Požuri dok ima zaliha</p>
              </div>
              <button className="flex items-center gap-0.5" style={{ color:"#00ff88",fontSize:11,fontWeight:700 }}>
                Sve <ChevronRight size={12} />
              </button>
            </div>
            {regularProducts.length === 0 ? (
              <p className="px-4" style={{ color:"rgba(255,255,255,0.2)",fontSize:13 }}>Nema aktivnih akcija.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 px-4">
                {regularProducts.map((p) => (
                  <ProductCard key={p.id} product={p} isFavorite={isFav(p.id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(p)} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
      <div className="pb-8" />
    </div>
  );
}
