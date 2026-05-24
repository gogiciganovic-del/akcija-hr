import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronRight } from "lucide-react";
import { CjenkoLogo } from "../components/CjenkoLogo";
import { CjenkoFace } from "../components/CjenkoFace";
import { ProductCard } from "../components/ProductCard";
import { useProducts } from "../hooks/useProducts";
import { useStoreStats } from "../hooks/useStoreStats";
import { useUserLocation } from "../hooks/useUserLocation";
import { CATEGORIES, STORES, STORES_ROW_1, STORES_ROW_2 } from "../lib/constants";

function StoreGrid({ stores, selectedStore, onSelect }) {
  return (
    <div className="grid grid-cols-6 gap-1">
      {stores.map((store) => {
        const active = selectedStore === store.id;
        return (
          <button
            key={store.id}
            type="button"
            onClick={() => onSelect(store.id)}
            className="flex flex-col items-center gap-1 min-w-0 transition-all duration-200"
          >
            <div
              className="flex items-center justify-center rounded-xl overflow-hidden w-full transition-all duration-200"
              style={{
                aspectRatio: "1",
                maxHeight: 40,
                background: "#fff",
                border: active ? `2px solid ${store.color}` : "1px solid rgba(255,255,255,0.12)",
                boxShadow: active ? `0 0 10px ${store.color}44` : "none",
              }}
            >
              <img
                src={store.logo}
                alt={store.label}
                className="object-contain"
                style={{ width: "78%", height: "78%" }}
                loading="lazy"
              />
            </div>
            <span
              className="font-semibold rounded-full px-1 py-0.5 w-full text-center truncate"
              style={{
                fontSize: 8,
                lineHeight: 1.2,
                color: active ? "#fff" : "rgba(255,255,255,0.45)",
                background: active ? store.color : "rgba(255,255,255,0.06)",
              }}
            >
              {store.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function StoreFilterRow({ selectedStore, onSelect }) {
  return (
    <div className="mx-4 mb-3 rounded-2xl px-2.5 py-2.5"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 8, fontWeight: 700, letterSpacing: "0.16em", marginBottom: 8, paddingLeft: 2 }}>
        TRGOVINE
      </p>
      <StoreGrid stores={STORES_ROW_1} selectedStore={selectedStore} onSelect={onSelect} />
      <div className="mt-1.5">
        <StoreGrid stores={STORES_ROW_2} selectedStore={selectedStore} onSelect={onSelect} />
      </div>
    </div>
  );
}

function StoreInfoBar({ store, stats, loading }) {
  const items = [
    {
      key: "akcije",
      label: "Akcija",
      value: loading ? "…" : stats?.total?.toString() ?? "0",
      color: "#00ff88",
      clickable: false,
    },
    {
      key: "hot",
      label: "Vruće ponude",
      value: loading ? "…" : stats?.hotCount?.toString() ?? "0",
      color: "#ffd700",
      clickable: false,
    },
    {
      key: "avg",
      label: "Prosj. ušteda",
      value: loading ? "…" : stats?.avgDiscount ? `-${stats.avgDiscount}%` : "—",
      color: "#ff6b6b",
      clickable: false,
    },
  ];

  return (
    <div
      className="mx-4 mb-4 rounded-2xl px-3 py-3"
      style={{
        background: `linear-gradient(135deg, ${store.color}18, rgba(255,255,255,0.02))`,
        border: `1px solid ${store.color}44`,
      }}
    >
      <p className="font-bold text-white mb-2.5" style={{ fontSize: 12 }}>
        {store.label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {items.map(({ key, label, value, color, clickable, active }) => {
          const inner = (
            <>
              <p className="font-black" style={{ fontSize: 15, letterSpacing: "-0.02em", color }}>{value}</p>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 9, marginTop: 2, lineHeight: 1.35 }}>{label}</p>
            </>
          );

          if (clickable) {
            return (
              <button
                key={key}
                type="button"
                onClick={onAkcijeClick}
                className="rounded-xl p-2.5 text-center transition-all duration-200"
                style={{
                  background: active ? "rgba(0,255,136,0.12)" : "rgba(255,255,255,0.04)",
                  border: active ? "1px solid rgba(0,255,136,0.45)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {inner}
              </button>
            );
          }

          return (
            <div
              key={key}
              className="rounded-xl p-2.5 text-center"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {inner}
            </div>
          );
        })}
      </div>
      <p style={{ color: "rgba(0,255,136,0.55)", fontSize: 9, marginTop: 8, textAlign: "center" }}>
        Prikazane su samo akcije iz {store.label}
      </p>
    </div>
  );
}

function isExpiringToday(validUntil) {
  if (!validUntil) return false;
  const end = new Date(validUntil);
  const today = new Date();
  return (
    end.getFullYear() === today.getFullYear() &&
    end.getMonth() === today.getMonth() &&
    end.getDate() === today.getDate()
  );
}

export function HomePage({ onProductSelect, onSearchFocus, isFav, onToggleFav, homeResetSignal = 0 }) {
  const scrollRef = useRef(null);
  const [activeCat, setActiveCat] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [hotExpanded, setHotExpanded] = useState(false);

  useEffect(() => {
    if (!homeResetSignal) return;
    setActiveCat(null);
    setSelectedStore(null);
    setHotExpanded(false);
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [homeResetSignal]);

  const storeMeta = STORES.find((s) => s.id === selectedStore);
  const { stats: storeStats, loading: statsLoading } = useStoreStats(selectedStore);
  const { locationLabel } = useUserLocation();

  const { products: storeProducts, loading } = useProducts({
    sortBy: "discount",
    chain: selectedStore ?? undefined,
  });

  const visibleCategories = CATEGORIES.filter(
    (c) => c.id === null || storeProducts.some((p) => p.category === c.id)
  );

  useEffect(() => {
    if (activeCat && !storeProducts.some((p) => p.category === activeCat)) {
      setActiveCat(null);
    }
  }, [activeCat, storeProducts]);

  const handleStoreSelect = useCallback((storeId) => {
    setSelectedStore((prev) => (prev === storeId ? null : storeId));
    setActiveCat(null);
    setHotExpanded(false);
  }, []);

  const handleHotExpand = useCallback(() => {
    setHotExpanded((prev) => !prev);
  }, []);

  const products = activeCat
    ? storeProducts.filter((p) => p.category === activeCat)
    : storeProducts;

  const hotProducts = products.filter((p) => p.isGlitch);
  const expiringTodayProducts = products.filter((p) => isExpiringToday(p.validUntil));
  const expiringTodayIds = new Set(expiringTodayProducts.map((p) => p.id));
  const regularProducts = products.filter((p) => !p.isGlitch && !expiringTodayIds.has(p.id));
  const filterLabel = selectedStore ? storeMeta?.label : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full">
      <header
        className="flex-shrink-0 z-30"
        style={{
          position: "sticky",
          top: 0,
          background: "#020617",
          boxShadow: "0 4px 24px rgba(2,6,23,0.85)",
        }}
      >
        <div className="px-5 pt-12 pb-2">
          <CjenkoLogo height={34} />
          <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, marginTop: 2 }}>
            {filterLabel ? `Filtar: ${filterLabel}` : `${locationLabel} · Sve trgovine`}
          </p>
        </div>

        <div
          onClick={onSearchFocus}
          className="mx-4 mb-3 flex items-center gap-3 rounded-2xl px-4 py-3 cursor-pointer"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <CjenkoFace size={22} />
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>Traži akcije, proizvode, trgovine…</span>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: "none" }}>
      <StoreFilterRow selectedStore={selectedStore} onSelect={handleStoreSelect} />

      {storeMeta && (
        <StoreInfoBar
          store={storeMeta}
          stats={storeStats}
          loading={statsLoading}
        />
      )}

      <div className="flex gap-2 px-4 pb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {visibleCategories.map((c) => (
          <button key={c.label} onClick={() => setActiveCat(c.id)}
            className="whitespace-nowrap px-3.5 py-1.5 rounded-full text-[11px] font-semibold flex-shrink-0 transition-all duration-200"
            style={{
              background: activeCat === c.id ? "#00ff88" : "rgba(255,255,255,0.05)",
              color: activeCat === c.id ? "#020617" : "rgba(255,255,255,0.45)",
              border: activeCat === c.id ? "1px solid #00ff88" : "1px solid rgba(255,255,255,0.06)",
            }}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>Učitavanje akcija...</p>
        </div>
      ) : (
        <>
          <section className="mb-5">
            <div className="flex items-center justify-between px-4 mb-3">
              <div>
                <h2 className="font-black text-white" style={{ fontSize: 16, letterSpacing: "-0.02em" }}>⚡ Vruće ponude</h2>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, marginTop: 2 }}>
                  {hotProducts.length} aktivnih{filterLabel ? ` · ${filterLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={handleHotExpand}
                className="flex items-center gap-0.5 transition-opacity duration-200"
                style={{
                  color: hotExpanded ? "#ffd700" : "#00ff88",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {hotExpanded ? "Manje" : "Sve"} <ChevronRight size={12} style={{ transform: hotExpanded ? "rotate(90deg)" : "none" }} />
              </button>
            </div>
            {hotProducts.length === 0 ? (
              <p className="px-4" style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                {filterLabel ? `Nema vrućih ponuda u ${filterLabel}.` : "Nema vrućih ponuda trenutno."}
              </p>
            ) : hotExpanded ? (
              <div className="grid grid-cols-2 gap-2.5 px-4">
                {hotProducts.map((p) => (
                  <ProductCard key={p.id} product={p} isFavorite={isFav(p.id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(p)} />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2.5 px-4 mb-2.5">
                  {hotProducts.slice(0, 2).map((p) => (
                    <ProductCard key={p.id} product={p} isFavorite={isFav(p.id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(p)} />
                  ))}
                </div>
                {hotProducts[2] && (
                  <div className="px-4">
                    <ProductCard product={hotProducts[2]} size="large" isFavorite={isFav(hotProducts[2].id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(hotProducts[2])} />
                  </div>
                )}
              </>
            )}
          </section>

          {!hotExpanded && expiringTodayProducts.length > 0 && (
            <section className="mb-5">
              <div className="flex items-center justify-between px-4 mb-3">
                <div>
                  <h2 className="font-black text-white" style={{ fontSize: 16, letterSpacing: "-0.02em" }}>
                    ⏰ Danas ističe
                  </h2>
                  <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, marginTop: 2 }}>
                    {expiringTodayProducts.length} ponuda{filterLabel ? ` · ${filterLabel}` : ""}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 px-4">
                {expiringTodayProducts.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    isFavorite={isFav(p.id)}
                    onToggleFavorite={onToggleFav}
                    onClick={() => onProductSelect(p)}
                  />
                ))}
              </div>
            </section>
          )}

          {!hotExpanded && (
          <section className="mb-5">
            <div className="flex items-center justify-between px-4 mb-3">
              <div>
                <h2 className="font-black text-white" style={{ fontSize: 16, letterSpacing: "-0.02em" }}>🏷️ Sve akcije</h2>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, marginTop: 2 }}>
                  {regularProducts.length} aktivnih{filterLabel ? ` · ${filterLabel}` : ""}
                </p>
              </div>
            </div>
            {regularProducts.length === 0 ? (
              <p className="px-4" style={{ color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
                {filterLabel ? `Nema aktivnih akcija u ${filterLabel}.` : "Nema aktivnih akcija."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 px-4">
                {regularProducts.map((p) => (
                  <ProductCard key={p.id} product={p} isFavorite={isFav(p.id)} onToggleFavorite={onToggleFav} onClick={() => onProductSelect(p)} />
                ))}
              </div>
            )}
          </section>
          )}
        </>
      )}
      <div className="pb-4" />
      </div>
    </div>
  );
}
