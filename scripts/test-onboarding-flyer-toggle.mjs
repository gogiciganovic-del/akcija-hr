/**
 * Jedinični test: planFlyerFollowDelta + applyFlyerFollowDelta
 * (scenariji a–d za onboarding flyer prekidač).
 * Pokreni: node scripts/test-onboarding-flyer-toggle.mjs
 */
import assert from "node:assert/strict";
import {
  applyFlyerFollowDelta,
  planFlyerFollowDelta,
} from "../src/lib/onboardingFlyerSync.js";

function mockApis({ failFollowFor = null, failUnfollowFor = null } = {}) {
  const calls = [];
  const followed = new Set();
  return {
    calls,
    followed,
    followChain: async (chain) => {
      calls.push({ op: "followChain", chain });
      if (failFollowFor && chain === failFollowFor) {
        throw new Error(`boom-follow-${chain}`);
      }
      followed.add(chain);
      return { ok: true, chains: [...followed] };
    },
    unfollowChain: async (chain) => {
      calls.push({ op: "unfollowChain", chain });
      if (failUnfollowFor && chain === failUnfollowFor) {
        return { ok: false, reason: "fail" };
      }
      followed.delete(chain);
      return { ok: true, chains: [...followed] };
    },
  };
}

function printCalls(label, calls) {
  const line = calls.map((c) => `${c.op}(${c.chain})`).join(", ") || "(none)";
  console.log(`${label}: ${line}`);
}

// --- plan ---
{
  const d = planFlyerFollowDelta(["Kaufland"], ["Kaufland", "Plodine"]);
  assert.deepEqual(d.toFollow, ["Plodine"]);
  assert.deepEqual(d.toUnfollow, []);
  assert.deepEqual(d.nextFollowed, ["Kaufland", "Plodine"]);
}
{
  const d = planFlyerFollowDelta(["Kaufland", "Plodine"], []);
  assert.deepEqual(d.toFollow, []);
  assert.deepEqual(d.toUnfollow, ["Kaufland", "Plodine"]);
  assert.deepEqual(d.nextFollowed, []);
}
{
  const d = planFlyerFollowDelta(["Kaufland"], ["Plodine"]);
  assert.deepEqual(d.toFollow, ["Plodine"]);
  assert.deepEqual(d.toUnfollow, ["Kaufland"]);
  assert.deepEqual(d.nextFollowed, ["Plodine"]);
}

// (a) uključi Kaufland pa isključi → unfollowChain(Kaufland)
{
  const api = mockApis();
  let followed = [];
  const on = await applyFlyerFollowDelta({
    previousFollowed: followed,
    nextEligible: ["Kaufland"],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  followed = on.followed;
  assert.deepEqual(followed, ["Kaufland"]);
  api.calls.length = 0;
  const off = await applyFlyerFollowDelta({
    previousFollowed: followed,
    nextEligible: [],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  printCalls("(a) off after Kaufland", api.calls);
  assert.equal(api.calls.length, 1);
  assert.deepEqual(api.calls[0], { op: "unfollowChain", chain: "Kaufland" });
  assert.deepEqual(off.followed, []);
}

// (b) uključeno Kaufland, dodaj Plodine → followChain(Plodine)
{
  const api = mockApis();
  await applyFlyerFollowDelta({
    previousFollowed: [],
    nextEligible: ["Kaufland"],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  api.calls.length = 0;
  const r = await applyFlyerFollowDelta({
    previousFollowed: ["Kaufland"],
    nextEligible: ["Kaufland", "Plodine"],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  printCalls("(b) add Plodine", api.calls);
  assert.deepEqual(api.calls, [{ op: "followChain", chain: "Plodine" }]);
  assert.deepEqual(r.followed, ["Kaufland", "Plodine"]);
}

// (c) uključeno Kaufland, makni Kaufland → unfollow + prazan skup
{
  const api = mockApis();
  await applyFlyerFollowDelta({
    previousFollowed: [],
    nextEligible: ["Kaufland"],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  api.calls.length = 0;
  const r = await applyFlyerFollowDelta({
    previousFollowed: ["Kaufland"],
    nextEligible: [],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  printCalls("(c) remove Kaufland", api.calls);
  assert.deepEqual(api.calls, [{ op: "unfollowChain", chain: "Kaufland" }]);
  assert.deepEqual(r.followed, []);
}

// (d) followChain baci grešku → rollback, skup ostaje prethodni
{
  const api = mockApis({ failFollowFor: "Plodine" });
  await applyFlyerFollowDelta({
    previousFollowed: [],
    nextEligible: ["Kaufland"],
    followChain: api.followChain,
    unfollowChain: api.unfollowChain,
  });
  api.calls.length = 0;
  let threw = false;
  try {
    await applyFlyerFollowDelta({
      previousFollowed: ["Kaufland"],
      nextEligible: ["Kaufland", "Plodine"],
      followChain: api.followChain,
      unfollowChain: api.unfollowChain,
    });
  } catch {
    threw = true;
  }
  printCalls("(d) follow Plodine fails", api.calls);
  assert.equal(threw, true);
  assert.equal(
    api.calls.some((c) => c.op === "followChain" && c.chain === "Plodine"),
    true
  );
  // Kaufland i dalje u mock skupu (nije odjavljen)
  assert.equal(api.followed.has("Kaufland"), true);
  assert.equal(api.followed.has("Plodine"), false);
}

// (d2) unfollow vrati ok:false → greška, bez tihog „isključeno”
{
  const api = mockApis({ failUnfollowFor: "Kaufland" });
  let threw = false;
  try {
    await applyFlyerFollowDelta({
      previousFollowed: ["Kaufland"],
      nextEligible: [],
      followChain: api.followChain,
      unfollowChain: api.unfollowChain,
    });
  } catch {
    threw = true;
  }
  printCalls("(d2) unfollow fails", api.calls);
  assert.equal(threw, true);
}

console.log("OK test-onboarding-flyer-toggle");
