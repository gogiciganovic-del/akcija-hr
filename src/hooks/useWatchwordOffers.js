import { useEffect, useMemo, useState } from "react";
import { loadWatchwordGroups } from "../lib/watchwordsFetch";

/**
 * Dohvat ponuda za popis watchwords (paralelno, s cacheom u watchwordsFetch).
 */
export function useWatchwordOffers(words) {
  const list = useMemo(
    () => (Array.isArray(words) ? words.filter(Boolean) : []),
    [words]
  );
  const wordsKey = list.join("\0");

  const [loading, setLoading] = useState(list.length > 0);
  const [groups, setGroups] = useState([]);
  const [hitCount, setHitCount] = useState(0);
  const [allFailed, setAllFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!list.length) {
      setLoading(false);
      setGroups([]);
      setHitCount(0);
      setAllFailed(false);
      return undefined;
    }

    setLoading(true);
    setAllFailed(false);

    loadWatchwordGroups(list)
      .then((res) => {
        if (cancelled) return;
        setGroups(res.groups);
        setHitCount(res.hitCount);
        setAllFailed(res.allFailed);
      })
      .catch(() => {
        if (cancelled) return;
        setGroups(list.map((word) => ({ word, offers: [], error: "fetch failed" })));
        setHitCount(0);
        setAllFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // wordsKey pokriva promjene popisa; list je sync s keyem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordsKey]);

  return { loading, groups, hitCount, allFailed };
}
