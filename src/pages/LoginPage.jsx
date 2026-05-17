import { useState } from "react";
import { Zap, Mail, Lock, Loader2 } from "lucide-react";

export function LoginPage({ onSignIn, onSignUp }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);

    try {
      if (mode === "login") {
        await onSignIn(email.trim(), password);
      } else {
        const data = await onSignUp(email.trim(), password);
        if (data?.user && !data?.session) {
          setInfo("Račun kreiran! Provjeri e-poštu i potvrdi registraciju, zatim se prijavi.");
          setMode("login");
        } else {
          setInfo("Registracija uspješna!");
        }
      }
    } catch (err) {
      const msg = err.message || "Došlo je do greške.";
      if (msg.includes("Invalid login")) setError("Pogrešan e-mail ili lozinka.");
      else if (msg.includes("already registered")) setError("E-mail je već registriran. Prijavi se.");
      else if (msg.includes("Password")) setError("Lozinka mora imati najmanje 6 znakova.");
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6 py-10"
      style={{ background: "#020617", fontFamily: "'DM Sans','Inter',sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#00ff88,#00cc6a)" }}
          >
            <Zap size={18} fill="#020617" stroke="none" />
          </div>
          <h1 className="font-black text-white" style={{ fontSize: 24, letterSpacing: "-0.03em" }}>
            akcije<span style={{ color: "#00ff88" }}>.hr</span>
          </h1>
        </div>

        <div
          className="flex rounded-2xl p-1 mb-6"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          {["login", "register"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(""); setInfo(""); }}
              className="flex-1 py-2.5 rounded-xl text-[13px] font-bold transition-all duration-200"
              style={{
                background: mode === m ? "rgba(0,255,136,0.15)" : "transparent",
                color: mode === m ? "#00ff88" : "rgba(255,255,255,0.4)",
              }}
            >
              {m === "login" ? "Prijava" : "Registracija"}
            </button>
          ))}
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl p-6"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <p className="text-center mb-5" style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
            {mode === "login"
              ? "Prijavi se i sinkroniziraj favorite u oblaku"
              : "Kreiraj račun za spremanje favorita"}
          </p>

          <div className="relative mb-3">
            <Mail
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.3)" }}
            />
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail"
              className="w-full rounded-2xl pl-11 pr-4 py-3.5 text-white text-[15px] outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>

          <div className="relative mb-4">
            <Lock
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.3)" }}
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Lozinka (min. 6 znakova)"
              className="w-full rounded-2xl pl-11 pr-4 py-3.5 text-white text-[15px] outline-none"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>

          {error && (
            <p
              className="text-center mb-3 px-2"
              style={{ color: "#ff6b6b", fontSize: 12, lineHeight: 1.5 }}
            >
              {error}
            </p>
          )}
          {info && (
            <p
              className="text-center mb-3 px-2"
              style={{ color: "#00ff88", fontSize: 12, lineHeight: 1.5 }}
            >
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ background: "#00ff88", color: "#020617" }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {mode === "login" ? "Prijavi se" : "Registriraj se"}
          </button>
        </form>

        <p className="text-center mt-6" style={{ color: "rgba(255,255,255,0.25)", fontSize: 11 }}>
          Favoriti se sigurno spremaju na tvoj račun
        </p>
      </div>
    </div>
  );
}
