import { useState, useCallback } from "react";
import { Trash2, Share2 } from "lucide-react";
import { ProductCard } from "../components/ProductCard";
import { CjenkoFace } from "../components/CjenkoFace";
import { CjenkoShrug } from "../components/CjenkoShrug";

const fmtEur = (v) =>
  (Number.isFinite(v) ? v : 0).toLocaleString("hr-HR", {
    style: "currency",
    currency: "EUR",
  });

/** Ispod ovoga ušteda nije hero — samo UI. */
const MIN_SAVINGS_HIGHLIGHT = 0.1;

function totalSavings(items) {
  return items.reduce((sum, p) => {
    const original = Number(p.originalPrice) || 0;
    const sale = Number(p.salePrice) || 0;
    return sum + Math.max(0, original - sale);
  }, 0);
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
  const saved = totalSavings(items);
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
        <p className="font-bold mb-2" style={{ color: "rgba(255,255,255,0.5)", fontSize: 11 }}>
          TVOJA UŠTEDA
        </p>
        {showHero ? (
          <>
            <p style={{ color: "rgba(0,255,136,0.75)", fontSize: 13, marginBottom: 4 }}>
              Uštedio si!
            </p>
            <p
              className="font-black tabular-nums"
              style={{ color: "#00ff88", fontSize: 34, letterSpacing: "-0.03em", lineHeight: 1.1 }}
            >
              {fmtEur(saved)}
            </p>
            <p
              className="tabular-nums"
              style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, marginTop: 6 }}
            >
              Na tvojim favoritima
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
}) {
  const items = [...favorites.values()];
  const hasItems = items.length > 0;
  const [shareFeedback, setShareFeedback] = useState(null);

  const handleShareSavings = useCallback(async () => {
    const saved = totalSavings(items);
    if (!(saved >= MIN_SAVINGS_HIGHLIGHT)) return;

    const text =
      `Uštedio sam ${fmtEur(saved)} na favoritima uz Cjenko Akcije! 💚\n` +
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
      </div>

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
          {items.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isFavorite
              onToggleFavorite={onToggleFavorite}
              onClick={() => onProductSelect(p)}
            />
          ))}
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
