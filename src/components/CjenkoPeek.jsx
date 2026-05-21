import { useState, useCallback } from "react";
import { CjenkoFace } from "./CjenkoFace";

export function CjenkoPeek() {
  const [popped, setPopped] = useState(false);

  const handleClick = useCallback(() => {
    if (popped) return;
    setPopped(true);
    window.setTimeout(() => setPopped(false), 420);
  }, [popped]);

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Cjenko"
      className="absolute z-40 border-0 p-0 cursor-pointer"
      style={{
        right: 0,
        top: "38%",
        width: 34,
        height: 26,
        overflow: "hidden",
        background: "transparent",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: popped ? -4 : -18,
          top: 0,
          transition: "right 0.35s cubic-bezier(0.34, 1.4, 0.64, 1)",
        }}
      >
        <CjenkoFace size={52} />
      </div>
    </button>
  );
}
