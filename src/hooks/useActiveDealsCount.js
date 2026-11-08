import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Točan broj aktivnih ponuda (active_deals count).
 * Opcionalno filtrirano po lancu (store_name ilike), kao useProducts chain.
 * Pri grešci ostaje null — UI koristi fallback.
 */
export function useActiveDealsCount(chain) {
  const [count, setCount] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        let q = supabase
          .from("active_deals")
          .select("*", { count: "exact", head: true });
        if (chain) q = q.ilike("store_name", `${chain}%`);
        const { count: n, error } = await q;
        if (error) throw error;
        if (!cancelled && typeof n === "number" && Number.isFinite(n)) {
          setCount(n);
        }
      } catch {
        // zadrži prethodni / null — HomePage pada na duljinu učitanog skupa
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [chain]);

  return count;
}
