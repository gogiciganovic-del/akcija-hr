/**
 * Odvoji UI status od Umami događaja kad enable() padne.
 * Sučelje: denied samo kad je dozvola denied (prvotni uvjet).
 * Događaji: push_odbijen i za default (korisnik zatvorio prompt), inače push_greska.
 *
 * @param {string} [code] e?.code || Notification.permission
 * @param {string} [permission] Notification.permission
 * @returns {{ setDenied: boolean, event: "push_odbijen" | "push_greska" }}
 */
export function classifyPushEnableFailure(code, permission) {
  const setDenied = code === "denied" || permission === "denied";
  const odbijen =
    code === "denied" ||
    code === "default" ||
    permission === "denied";
  return {
    setDenied,
    event: odbijen ? "push_odbijen" : "push_greska",
  };
}
