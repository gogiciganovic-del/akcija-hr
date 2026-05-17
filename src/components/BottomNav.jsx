import { Home, Search, Heart, MapPin } from "lucide-react";

const TABS = [
  { id: "home", label: "Početna", Icon: Home },
  { id: "search", label: "Pretraga", Icon: Search },
  { id: "fav", label: "Favoriti", Icon: Heart },
  { id: "near", label: "Blizina", Icon: MapPin },
];

export function BottomNav({ activeTab, onTabChange, favCount = 0 }) {
  return (
    <nav
      className="flex-shrink-0 flex items-center justify-around px-2 py-2 border-t"
      style={{
        background: "rgba(2,6,23,0.95)",
        borderColor: "rgba(255,255,255,0.06)",
        paddingBottom: "max(8px, env(safe-area-inset-bottom))",
      }}
    >
      {TABS.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl transition-all duration-200 relative"
            style={{ color: active ? "#00ff88" : "rgba(255,255,255,0.35)" }}
          >
            <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{ fontSize: 9, fontWeight: active ? 700 : 500 }}>{label}</span>
            {id === "fav" && favCount > 0 && (
              <span
                className="absolute -top-0.5 right-2 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center font-black"
                style={{ fontSize: 9, background: "#00ff88", color: "#020617" }}
              >
                {favCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
