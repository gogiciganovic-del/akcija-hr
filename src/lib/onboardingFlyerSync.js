import { FLYER_FOLLOW_CHAINS } from "./pushFlyerFollow.js";

/**
 * Razlika između već zapraćenih i novog eligible skupa (odabrani ∩ FLYER_FOLLOW).
 * @param {Iterable<string>} previousFollowed
 * @param {Iterable<string>} nextEligible
 * @returns {{ toFollow: string[], toUnfollow: string[], nextFollowed: string[] }}
 */
export function planFlyerFollowDelta(previousFollowed, nextEligible) {
  const prev = new Set(
    [...(previousFollowed || [])].map((c) => String(c || "").trim()).filter(Boolean)
  );
  const next = new Set(
    [...(nextEligible || [])].map((c) => String(c || "").trim()).filter(Boolean)
  );
  const toFollow = [...next].filter((c) => !prev.has(c));
  const toUnfollow = [...prev].filter((c) => !next.has(c));
  const nextFollowed = FLYER_FOLLOW_CHAINS.filter((c) => next.has(c));
  return { toFollow, toUnfollow, nextFollowed };
}

/**
 * Primijeni follow/unfollow prema delti. Pri grešci rollback (best-effort) i baci.
 * @param {{
 *   previousFollowed: Iterable<string>,
 *   nextEligible: Iterable<string>,
 *   followChain: (chain: string, opts?: object) => Promise<{ ok?: boolean }>,
 *   unfollowChain: (chain: string) => Promise<{ ok?: boolean }>,
 *   trackedBarcodes?: string[],
 *   onFollowed?: (chain: string) => void,
 *   onUnfollowed?: (chain: string) => void,
 * }} opts
 */
export async function applyFlyerFollowDelta(opts) {
  const previous = FLYER_FOLLOW_CHAINS.filter((c) =>
    new Set(
      [...(opts.previousFollowed || [])]
        .map((x) => String(x || "").trim())
        .filter(Boolean)
    ).has(c)
  );
  const { toFollow, toUnfollow, nextFollowed } = planFlyerFollowDelta(
    previous,
    opts.nextEligible
  );
  const followFn = opts.followChain;
  const unfollowFn = opts.unfollowChain;
  const barcodes = Array.isArray(opts.trackedBarcodes) ? opts.trackedBarcodes : [];
  const doneUnfollow = [];
  const doneFollow = [];

  try {
    for (const chain of toUnfollow) {
      const res = await unfollowFn(chain);
      if (!res?.ok) throw new Error(`unfollow_failed:${chain}`);
      doneUnfollow.push(chain);
      opts.onUnfollowed?.(chain);
    }
    for (const chain of toFollow) {
      const res = await followFn(chain, { trackedBarcodes: barcodes });
      if (!res?.ok) throw new Error(`follow_failed:${chain}`);
      doneFollow.push(chain);
      opts.onFollowed?.(chain);
    }
    return { followed: nextFollowed, toFollow, toUnfollow };
  } catch (err) {
    for (const chain of doneFollow.slice().reverse()) {
      try {
        await unfollowFn(chain);
      } catch {
        // best-effort
      }
    }
    for (const chain of doneUnfollow.slice().reverse()) {
      try {
        await followFn(chain, { trackedBarcodes: barcodes });
      } catch {
        // best-effort
      }
    }
    throw err;
  }
}
