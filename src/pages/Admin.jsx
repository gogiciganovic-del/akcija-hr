import { useState, useEffect, useCallback } from "react";
import { Lock, LogOut, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { isAdminLoggedIn, adminLogin, adminLogout } from "../lib/adminAuth";

const fmt = (v) =>
  Number(v).toLocaleString("hr-HR", { style: "currency", currency: "EUR" });

export function Admin() {
  const [authed, setAuthed] = useState(isAdminLoggedIn());
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState("");
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState(null);

  const loadDeals = useCallback(async () => {
    setLoading(true);
    setFetchErr(null);
    const { data, error } = await supabase
      .from("active_deals")
      .select("*")
      .order("discount_pct", { ascending: false })
      .limit(100);
    if (error) setFetchErr(error.message);
    else setDeals(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadDeals();
  }, [authed, loadDeals]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (adminLogin(password)) {
      setAuthed(true);
      setLoginErr("");
      setPassword("");
    } else {
      setLoginErr("Pogrešna lozinka");
    }
  };

  const handleLogout = () => {
    adminLogout();
    setAuthed(false);
    setDeals([]);
  };

  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-6"
        style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
      >
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-3xl p-8"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6 mx-auto"
            style={{ background: "rgba(0,255,136,0.1)", border: "1px solid rgba(0,255,136,0.2)" }}
          >
            <Lock size={20} style={{ color: "#00ff88" }} />
          </div>
          <h1
            className="font-black text-white text-center mb-1"
            style={{ fontSize: 22, letterSpacing: "-0.03em" }}
          >
            Admin
          </h1>
          <p
            className="text-center mb-6"
            style={{ color: "rgba(255,255,255,0.35)", fontSize: 13 }}
          >
            akcije.hr · Upravljanje ponudama
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Lozinka"
            className="w-full rounded-2xl px-4 py-3.5 text-white text-[15px] outline-none mb-3"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          />
          {loginErr && (
            <p className="text-center mb-3" style={{ color: "#ff6b6b", fontSize: 12 }}>
              {loginErr}
            </p>
          )}
          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl font-black text-sm"
            style={{ background: "#00ff88", color: "#020617" }}
          >
            Prijavi se
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-y-auto"
      style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
    >
      <div className="flex items-center justify-between px-5 pt-10 pb-4 max-w-lg mx-auto">
        <div>
          <h1 className="font-black text-white" style={{ fontSize: 22, letterSpacing: "-0.03em" }}>
            Admin panel
          </h1>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>
            {deals.length} aktivnih akcija
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadDeals}
            disabled={loading}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <RefreshCw
              size={14}
              style={{ color: "#00ff88" }}
              className={loading ? "animate-spin" : ""}
            />
          </button>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <LogOut size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>
      </div>

      <div className="px-5 pb-10 max-w-lg mx-auto">
        {fetchErr && (
          <p
            className="rounded-2xl px-4 py-3 mb-4 text-sm"
            style={{
              background: "rgba(255,107,107,0.1)",
              border: "1px solid rgba(255,107,107,0.2)",
              color: "#ff6b6b",
            }}
          >
            {fetchErr}
          </p>
        )}

        {loading && deals.length === 0 ? (
          <p className="text-center py-16" style={{ color: "rgba(255,255,255,0.3)", fontSize: 14 }}>
            Učitavanje...
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {deals.map((d) => (
              <div
                key={d.deal_id}
                className="rounded-2xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <p className="font-bold text-white text-[13px] mb-1 truncate">{d.name}</p>
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginBottom: 6 }}>
                  {d.store_name} · {d.category} · -{d.discount_pct}%
                </p>
                <div className="flex items-center gap-3">
                  <span
                    style={{
                      color: "rgba(255,255,255,0.25)",
                      fontSize: 11,
                      textDecoration: "line-through",
                    }}
                  >
                    {fmt(d.original_price)}
                  </span>
                  <span className="font-black text-white" style={{ fontSize: 14 }}>
                    {fmt(d.price)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
