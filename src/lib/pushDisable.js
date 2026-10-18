/**
 * Redoslijed isključivanja pusha (bez Supabase / browser API) — testabilno u Nodeu.
 * unsubscribe → RPC → čišćenje localStorage. Ako RPC padne, localStorage se ipak čisti.
 *
 * @param {{
 *   getSubscription: () => Promise<{ endpoint?: string, unsubscribe?: function }|null>,
 *   unsubscribe: (sub: object) => Promise<void>,
 *   deleteRemote: (endpoint: string) => Promise<void>,
 *   clearLocal: () => void,
 * }} deps
 * @returns {Promise<{ remoteOk: boolean, endpoint: string }>}
 */
export async function disablePushSequence({
  getSubscription,
  unsubscribe,
  deleteRemote,
  clearLocal,
}) {
  let sub = null;
  try {
    sub = await getSubscription();
  } catch {
    sub = null;
  }

  if (sub) {
    try {
      await unsubscribe(sub);
    } catch {
      // nastavi — lokalno stanje i RPC i dalje
    }
  }

  const endpoint = String(sub?.endpoint || "").trim();
  let remoteOk = true;
  if (endpoint) {
    try {
      await deleteRemote(endpoint);
    } catch {
      remoteOk = false;
    }
  }

  try {
    clearLocal();
  } catch {
    // ignore
  }

  return { remoteOk, endpoint };
}
