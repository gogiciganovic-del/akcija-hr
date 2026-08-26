import { useState, useCallback } from "react";
import { Bell, BellOff, BellRing, Trash2, Share2 } from "lucide-react";
import { ProductCard } from "../components/ProductCard";
import { CjenkoFace } from "../components/CjenkoFace";
import { CjenkoShrug } from "../components/CjenkoShrug";
import { isExpiringTodayProduct } from "../lib/dealDates";

const fmtEur = (v) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("hr-HR", {
    style: "currency",
    currency: "EUR",
  });

/** Ispod ovoga ušteda nije hero — samo UI. */
const MIN_SAVINGS_HIGHLIGHT = 0.1;

function favoriteTotals(items) {
  return items.reduce(
    (acc, p) => {
      const original = Number(p.originalPrice) || 0;
      const sale = Number(p.salePrice) || 0;
      acc.original += original;
      acc.sale += sale;
      acc.saved += Math.max(0, original - sale);
      return acc;
    },
    { original: 0, sale: 0, saved: 0 }
  );
}

function PushNotifyBanner({ status, busy, error, onEnable }) {
  if (status === "unsupported") {
    return (
      <div
        className="mx-4 mb-4 rounded-2xl px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.45 }}>
          Ovaj preglednik ne podržava push obavijesti.
        </p>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div
        className="mx-4 mb-4 rounded-2xl px-4 py-3 flex gap-3 items-start"
        style={{
          background: "rgba(255,107,107,0.06)",
          border: "1px solid rgba(255,107,107,0.2)",
        }}
      >
        <BellOff size={18} style={{ color: "#ff6b6b", flexShrink: 0, marginTop: 2 }} />
        <div>
          <p className="font-bold" style={{ color: "#ff6b6b", fontSize: 13 }}>
            Obavijesti su blokirane
          </p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
            Uključi ih u postavkama preglednika za ovu stranicu — nećemo ponovno pitati.
          </p>
        </div>
      </div>
    );
  }

  if (status === "subscribed") {
    return (
      <div
        className="mx-4 mb-4 rounded-2xl px-4 py-3 flex gap-3 items-center"
        style={{
          background: "rgba(0,255,136,0.06)",
          border: "1px solid rgba(0,255,136,0.2)",
        }}
      >
        <BellRing size={18} style={{ color: "#00ff88", flexShrink: 0 }} />
        <p style={{ color: "rgba(0,255,136,0.9)", fontSize: 13, lineHeight: 1.4 }}>
          Obavijesti o padu cijene uključene — pratimo tvoje favorite.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-4 mb-4 rounded-2xl px-4 py-3"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="flex gap-3 items-start">
        <Bell size={18} style={{ color: "#EF9F27", flexShrink: 0, marginTop: 2 }} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-white" style={{ fontSize: 13 }}>
            Obavijesti o padu cijene
          </p>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
            Javit ćemo ti kad favoritima padne cijena.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onEnable}
        disabled={busy}
        className="w-full mt-3 py-2.5 rounded-xl font-bold"
        style={{
          background: busy ? "rgba(239,159,39,0.08)" : "rgba(239,159,39,0.14)",
          border: "1px solid rgba(239,159,39,0.35)",
          color: "#EF9F27",
          fontSize: 13,
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Uključujem…" : "Uključi obavijesti o padu cijene"}
      </button>
      {error ? (
        <p className="mt-2" style={{ color: "rgba(255,107,107,0.9)", fontSize: 11, lineHeight: 1.4 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EmptySavingsCard() {
  return (
    <div
      className="mx-4 mb-6 rounded-2xl p-5 flex flex-col items-center text-center"
      style={{ background: "#EF9F27", border: "1px solid rgba(99,56,6,0.15)" }}
    >
      <CjenkoShrug size={72} />
      <p
        className="font-bold mt-3"
        style={{ color: "#633806", fontSize: 14, lineHeight: 1.5, maxWidth: 260 }}
      >
        Dodaj proizvode u favorite i vidi koliko štediš!
      </p>
    </div>
  );
}

function SavingsCard({ items, onShare, shareFeedback }) {
  const { original, sale, saved } = favoriteTotals(items);
  const showHero = saved >= MIN_SAVINGS_HIGHLIGHT;
  const countLabel =
    items.length === 1 ? "1 spremljena akcija" : `${items.length} spremljenih akcija`;

  return (
    <div className="mx-4 mb-4">
      <div
        className="rounded-2xl p-4 mb-3 flex items-center gap-3"
        style={{ background: "#EF9F27", border: "1px solid rgba(99,56,6,0.15)" }}
      >
        <CjenkoFace size={48} showTag />
        <div>
          <p className="font-black" style={{ color: "#633806", fontSize: 14, lineHeight: 1.35 }}>
            Tvoji favoriti
          </p>
          <p style={{ color: "rgba(99,56,6,0.75)", fontSize: 12, marginTop: 2 }}>
            {countLabel}
          </p>
        </div>
      </div>

      <div
        className="rounded-2xl p-4"
        style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <p className="font-bold mb-3" style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
          TVOJA UŠTEDA
        </p>
        {showHero ? (
          <>
            <div className="mb-3 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Bez popusta</span>
                <span
                  className="tabular-nums"
                  style={{
                    color: "rgba(255,255,255,0.35)",
                    fontSize: 15,
                    textDecoration: "line-through",
                  }}
                >
                  {fmtEur(original)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>Platiš</span>
                <span className="font-bold text-white tabular-nums" style={{ fontSize: 16 }}>
                  {fmtEur(sale)}
                </span>
              </div>
            </div>
            <p style={{ color: "rgba(0,255,136,0.75)", fontSize: 13, marginBottom: 4 }}>
              Uštedio si!
            </p>
            <p
              className="font-black tabular-nums"
              style={{ color: "#00ff88", fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              {fmtEur(saved)}
            </p>
            <div className="mt-3">
              <button
                type="button"
                onClick={onShare}
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
            <div className="mb-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Bez popusta</span>
                <span
                  className="tabular-nums"
                  style={{
                    color: "rgba(255,255,255,0.35)",
                    fontSize: 14,
                    textDecoration: "line-through",
                  }}
                >
                  {fmtEur(original)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>Platiš</span>
                <span className="font-bold text-white tabular-nums" style={{ fontSize: 15 }}>
                  {fmtEur(sale)}
                </span>
              </div>
            </div>
            <p className="font-black text-white tabular-nums" style={{ fontSize: 22 }}>
              {fmtEur(saved)}
            </p>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginTop: 4 }}>
              Nema veće uštede na trenutnim favoritima
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function FavoritesPage({
  favorites,
  onToggleFavorite,
  onClearAll,
  onProductSelect,
  onGoHome,
  pushStatus = "prompt",
  pushBusy = false,
  pushError = null,
  onEnablePush,
}) {
  const items = [...favorites.values()];
  const hasItems = items.length > 0;
  const [shareFeedback, setShareFeedback] = useState(null);
  const expiringToday = items.filter((p) => isExpiringTodayProduct(p));
  const expiringCount = expiringToday.length;
  const expiringHint =
    expiringCount === 0
      ? null
      : expiringCount === 1
        ? "1 favorit ističe danas"
        : `${expiringCount} favorita ističu danas`;

  const handleShareSavings = useCallback(async () => {
    const { original, sale, saved } = favoriteTotals(items);
    if (!(saved >= MIN_SAVINGS_HIGHLIGHT)) return;

    const text =
      `Uštedio sam ${fmtEur(saved)} na favoritima uz Cjenko Akcije! 💚\n` +
      `Bez popusta ${fmtEur(original)} → platiš ${fmtEur(sale)}\n` +
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
      if (e?.name === "AbortError") return;
      setShareFeedback("Kopiranje nije uspjelo");
      window.setTimeout(() => setShareFeedback(null), 2000);
    }
  }, [items]);

  return (
    <div className="flex-1 min-h-0 h-full overflow-y-auto" style={{ scrollbarWidth: "none" }}>
      <div className="px-4 pt-8 pb-3">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-white" style={{ fontSize: 26, letterSpacing: "-0.03em" }}>
            Favoriti
          </h1>
          {hasItems && (
            <button
              type="button"
              onClick={onClearAll}
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
          {hasItems
            ? items.length === 1
              ? "1 spremljena akcija"
              : `${items.length} spremljenih akcija`
            : "Nema spremljenih akcija"}
        </p>
        {expiringHint && (
          <p
            className="mt-2 px-3 py-1.5 rounded-xl"
            style={{
              fontSize: 11,
              color: "rgba(239,159,39,0.9)",
              background: "rgba(239,159,39,0.08)",
              border: "1px solid rgba(239,159,39,0.18)",
              lineHeight: 1.35,
            }}
          >
            {expiringHint}
          </p>
        )}
      </div>

      <PushNotifyBanner
        status={pushStatus}
        busy={pushBusy}
        error={pushError}
        onEnable={onEnablePush}
      />

      {hasItems ? (
        <SavingsCard
          items={items}
          onShare={handleShareSavings}
          shareFeedback={shareFeedback}
        />
      ) : (
        <EmptySavingsCard />
      )}

      {hasItems ? (
        <div className="grid grid-cols-2 gap-2.5 px-4 pb-8">
          {items.map((p) => {
            const expiring = isExpiringTodayProduct(p);
            return (
              <div key={p.id} className="relative">
                {expiring && (
                  <span
                    className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded font-semibold"
                    style={{
                      fontSize: 8,
                      letterSpacing: "0.04em",
                      color: "rgba(239,159,39,0.95)",
                      background: "rgba(2,6,23,0.72)",
                      border: "1px solid rgba(239,159,39,0.25)",
                    }}
                  >
                    Danas
                  </span>
                )}
                <ProductCard
                  product={p}
                  isFavorite
                  onToggleFavorite={onToggleFavorite}
                  onClick={() => onProductSelect(p)}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="px-6 pb-8 text-center">
          <p
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.22)",
              lineHeight: 1.7,
              marginBottom: 20,
            }}
          >
            Dodirni srce na proizvodu da ga spremiš ovdje
          </p>
          <button
            type="button"
            onClick={onGoHome}
            className="px-5 py-2.5 rounded-2xl font-bold text-sm"
            style={{
              background: "rgba(0,255,136,0.1)",
              border: "1px solid rgba(0,255,136,0.2)",
              color: "#00ff88",
            }}
          >
            Pregledaj akcije
          </button>
        </div>
      )}
    </div>
  );
}
