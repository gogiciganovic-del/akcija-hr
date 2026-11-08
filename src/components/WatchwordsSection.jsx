import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { ProductCard } from "./ProductCard";
import {
  WATCHWORDS_MAX,
  addWatchword,
  readWatchwords,
  removeWatchword,
  writeWatchwords,
} from "../lib/watchwords";
import { useWatchwordOffers } from "../hooks/useWatchwordOffers";
import {
  trackKeywordDodana,
  trackKeywordPonudaKlik,
  trackKeywordUklonjena,
  trackKeywordZatrazenPrikaz,
} from "../lib/usageEvents";

const EXAMPLES = ["kava", "nutella", "pelene"];

/**
 * „Za tebe” — lokalne ključne riječi + active_deals po riječi (ne koristi home products).
 * Prikazuje se samo kad postoji barem jedna riječ (parent kontrolira empty entry).
 */
export function WatchwordsSection({
  isFav,
  onToggleFav,
  onProductSelect,
  onSearchKeyword,
  words: wordsProp = null,
  onWordsChange = null,
  showAddForm = true,
}) {
  const [localWords, setLocalWords] = useState(() => readWatchwords());
  const words = wordsProp ?? localWords;
  const setWords = useCallback(
    (next) => {
      writeWatchwords(next);
      if (onWordsChange) onWordsChange(next);
      else setLocalWords(next);
    },
    [onWordsChange]
  );

  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const shownRef = useRef(false);

  const { loading, groups, hitCount, allFailed } = useWatchwordOffers(words);

  useEffect(() => {
    if (!words.length || shownRef.current) return;
    if (loading) return;
    shownRef.current = true;
    trackKeywordZatrazenPrikaz(hitCount);
  }, [words.length, loading, hitCount]);

  const handleAdd = useCallback(
    (raw) => {
      const r = addWatchword(words, raw);
      if (!r.ok) {
        if (r.reason === "duplicate") setHint("Ta riječ je već na popisu.");
        else if (r.reason === "cap") setHint(`Najviše ${WATCHWORDS_MAX} riječi.`);
        else setHint("Upiši 3–40 znakova.");
        return;
      }
      setWords(r.words);
      setDraft("");
      setHint("");
      trackKeywordDodana();
    },
    [words, setWords]
  );

  const handleRemove = useCallback(
    (w) => {
      const r = removeWatchword(words, w);
      if (!r.ok) return;
      setWords(r.words);
      trackKeywordUklonjena();
    },
    [words, setWords]
  );

  if (!words.length) return null;

  return (
    <section className="mb-5" data-testid="watchwords-section">
      <div className="flex items-center justify-between px-4 mb-3">
        <div>
          <h2
            className="font-black text-white"
            style={{ fontSize: 16, letterSpacing: "-0.02em" }}
          >
            Za tebe
          </h2>
          <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, marginTop: 2 }}>
            Ponude koje odgovaraju tvojim riječima
            {!loading && hitCount ? ` · ${hitCount}` : ""}
          </p>
        </div>
      </div>

      <div className="px-4 mb-3 flex flex-wrap gap-2">
        {words.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => onSearchKeyword?.(w)}
            className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.85)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {w}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Ukloni ${w}`}
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(w);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  handleRemove(w);
                }
              }}
              className="inline-flex"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
      </div>

      {showAddForm && words.length < WATCHWORDS_MAX && (
        <WatchwordAddForm
          draft={draft}
          setDraft={setDraft}
          hint={hint}
          onAdd={handleAdd}
        />
      )}

      {!loading && allFailed ? (
        <p className="px-4" style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
          Ne mogu učitati ponude.
        </p>
      ) : null}

      {groups.map(({ word, offers, error }) => (
        <div key={word} className="mb-4">
          <div className="flex items-center justify-between px-4 mb-2">
            <p className="font-bold text-white" style={{ fontSize: 13 }}>
              {word}
            </p>
            <button
              type="button"
              onClick={() => onSearchKeyword?.(word)}
              style={{ color: "#00ff88", fontSize: 11, fontWeight: 700 }}
            >
              Pretraži
            </button>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-2.5 px-4">
              <div
                className="rounded-2xl"
                style={{
                  height: 160,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              />
              <div
                className="rounded-2xl"
                style={{
                  height: 160,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              />
            </div>
          ) : error && allFailed ? null : offers.length === 0 ? (
            <p className="px-4" style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>
              Trenutno nema aktivnih ponuda za „{word}”.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 px-4">
              {offers.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  isFavorite={isFav?.(p.id)}
                  onToggleFavorite={onToggleFav}
                  onClick={() => {
                    trackKeywordPonudaKlik();
                    onProductSelect?.(p);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {loading && groups.length === 0
        ? words.map((word) => (
            <div key={`sk-${word}`} className="mb-4">
              <div className="flex items-center justify-between px-4 mb-2">
                <p className="font-bold text-white" style={{ fontSize: 13 }}>
                  {word}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 px-4">
                <div
                  className="rounded-2xl"
                  style={{
                    height: 160,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                />
                <div
                  className="rounded-2xl"
                  style={{
                    height: 160,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                />
              </div>
            </div>
          ))
        : null}
    </section>
  );
}

export function WatchwordAddForm({ draft, setDraft, hint, onAdd, compact = false }) {
  return (
    <div className={compact ? "px-4 mb-3" : "px-4 mb-4"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onAdd(draft);
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="npr. kava, nutella, pelene"
          maxLength={40}
          className="flex-1 rounded-xl px-3 py-2 outline-none"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#fff",
            fontSize: 13,
          }}
          aria-label="Dodaj riječ za praćenje"
        />
        <button
          type="submit"
          className="rounded-xl px-3 py-2 font-bold"
          style={{
            background: "rgba(0,255,136,0.12)",
            border: "1px solid rgba(0,255,136,0.35)",
            color: "#00ff88",
            fontSize: 12,
          }}
        >
          Dodaj
        </button>
      </form>
      <div className="flex flex-wrap gap-2 mt-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onAdd(ex)}
            className="rounded-lg px-2 py-1"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
            }}
          >
            {ex}
          </button>
        ))}
      </div>
      {hint ? (
        <p style={{ color: "rgba(255,180,80,0.85)", fontSize: 11, marginTop: 6 }}>{hint}</p>
      ) : null}
    </div>
  );
}

/** Tihi ulaz kad još nema riječi — bez FOMO copyja. */
export function WatchwordsQuietEntry({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState("");
  const [words, setWords] = useState(() => readWatchwords());

  if (words.length > 0) return null;

  if (!open) {
    return (
      <div className="px-4 mb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            color: "rgba(255,255,255,0.35)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + Prati riječ
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <p className="px-4 mb-2" style={{ color: "rgba(255,255,255,0.4)", fontSize: 12 }}>
        Prati riječ — vidjet ćeš aktivne ponude na početnoj.
      </p>
      <WatchwordAddForm
        draft={draft}
        setDraft={setDraft}
        hint={hint}
        compact
        onAdd={(raw) => {
          const r = addWatchword(words, raw);
          if (!r.ok) {
            if (r.reason === "duplicate") setHint("Ta riječ je već na popisu.");
            else if (r.reason === "cap") setHint(`Najviše ${WATCHWORDS_MAX} riječi.`);
            else setHint("Upiši 3–40 znakova.");
            return;
          }
          writeWatchwords(r.words);
          setWords(r.words);
          setDraft("");
          setHint("");
          trackKeywordDodana();
          onAdded?.(r.words);
        }}
      />
    </div>
  );
}
