import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

/** Gumb istog stila kao na Pretrazi — koristi se na Home i Search. */
export function ScanBarcodeButton({ onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl px-3 ${className}`}
      style={{
        minWidth: 72,
        background: "rgba(0,255,136,0.08)",
        border: "1px solid rgba(0,255,136,0.25)",
        color: "#00ff88",
      }}
      aria-label="Skeniraj barkod"
    >
      <ScanBarcode size={20} strokeWidth={2} />
      <span style={{ fontSize: 10, fontWeight: 700 }}>Skeniraj</span>
    </button>
  );
}

function normalizeBarcodeInput(value) {
  return String(value || "").replace(/\D/g, "");
}

function isPlausibleBarcode(digits) {
  const n = digits.length;
  return n === 8 || n === 12 || n === 13;
}

function vibrateOk() {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(40);
    }
  } catch {
    // ignore
  }
}

function createZxingReader() {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

/**
 * Full-screen kamera skener: native BarcodeDetector → ZXing fallback → ručni EAN.
 */
export function BarcodeScannerModal({ open, onClose, onDetected }) {
  const [scannerError, setScannerError] = useState(null);
  const [scannerStatus, setScannerStatus] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [manualHint, setManualHint] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const zxingControlsRef = useRef(null);
  const scannedLockRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    detectorRef.current = null;
    try {
      zxingControlsRef.current?.stop();
    } catch {
      // ignore
    }
    zxingControlsRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetUi = useCallback(() => {
    scannedLockRef.current = false;
    stopCamera();
    setScannerError(null);
    setScannerStatus("");
    setManualCode("");
    setManualHint("");
  }, [stopCamera]);

  const emitDetected = useCallback(
    (raw) => {
      if (scannedLockRef.current) return;
      scannedLockRef.current = true;
      vibrateOk();
      setScannerStatus("Pronađen barkod...");
      stopCamera();
      setScannerError(null);
      setScannerStatus("");
      // Makni scanner flag bez history.back() — inače bi poništio tab push (npr. → Pretraga).
      if (window.history.state?.scanner) {
        const prev =
          window.history.state && typeof window.history.state === "object"
            ? { ...window.history.state }
            : {};
        delete prev.scanner;
        window.history.replaceState(prev, "", window.location.href);
      }
      onDetectedRef.current?.(raw);
    },
    [stopCamera]
  );

  const handleClose = useCallback(() => {
    if (window.history.state?.scanner) {
      window.history.back();
      return;
    }
    resetUi();
    onClose?.();
  }, [onClose, resetUi]);

  // Android/TWA back: zatvori skener umjesto izlaza iz appa.
  useEffect(() => {
    if (!open) return;

    if (!window.history.state?.scanner) {
      const prev =
        window.history.state && typeof window.history.state === "object"
          ? { ...window.history.state }
          : {};
      window.history.pushState({ ...prev, scanner: true }, "", window.location.href);
    }

    const onPop = () => {
      resetUi();
      onClose?.();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, onClose, resetUi]);

  const submitManual = useCallback(() => {
    const digits = normalizeBarcodeInput(manualCode);
    if (!isPlausibleBarcode(digits)) {
      setManualHint("Unesi EAN-8, UPC (12) ili EAN-13");
      return;
    }
    setManualHint("");
    emitDetected(digits);
  }, [manualCode, emitDetected]);

  useEffect(() => {
    if (!open) return;

    scannedLockRef.current = false;
    setScannerError(null);
    setScannerStatus("Pokrećem kameru...");
    setManualCode("");
    setManualHint("");

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Kamera nije dostupna na ovom uređaju");
      setScannerStatus("");
      return;
    }

    let cancelled = false;
    const hasNative =
      typeof window !== "undefined" && typeof window.BarcodeDetector === "function";

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (hasNative) {
          const detector = new window.BarcodeDetector({
            formats: ["ean_13", "ean_8", "upc_a"],
          });
          detectorRef.current = detector;
          video.srcObject = stream;
          await video.play();
          if (cancelled) return;
          setScannerStatus("Usmjeri kameru na barkod");

          const tick = async () => {
            if (cancelled || scannedLockRef.current) return;
            const v = videoRef.current;
            const det = detectorRef.current;
            if (v && det && v.readyState >= 2) {
              try {
                const codes = await det.detect(v);
                if (codes?.length && !scannedLockRef.current) {
                  const raw = codes[0].rawValue;
                  if (raw) {
                    emitDetected(raw);
                    return;
                  }
                }
              } catch {
                // ignore frame errors
              }
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        // ZXing fallback (besplatna open-source biblioteka)
        setScannerStatus("Usmjeri kameru na barkod");
        const reader = createZxingReader();
        const controls = await reader.decodeFromStream(stream, video, (result, err) => {
          if (cancelled || scannedLockRef.current) return;
          if (result?.getText) {
            const text = result.getText();
            if (text) emitDetected(text);
            return;
          }
          // NotFoundException itd. — ignoriraj
          if (err && err.name && err.name !== "NotFoundException") {
            // tiho
          }
        });
        if (cancelled) {
          try {
            controls?.stop();
          } catch {
            // ignore
          }
          return;
        }
        zxingControlsRef.current = controls;
      } catch (err) {
        if (cancelled) return;
        const denied =
          err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        setScannerError(
          denied
            ? "Dopusti pristup kameri da skeniraš barkod"
            : "Kamera nije dostupna — unesi barkod ručno"
        );
        setScannerStatus("");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera, emitDetected]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col" style={{ background: "#020617" }}>
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <p className="font-bold text-white" style={{ fontSize: 16 }}>
          Skeniraj barkod
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.08)" }}
          aria-label="Zatvori skener"
        >
          <X size={18} style={{ color: "rgba(255,255,255,0.7)" }} />
        </button>
      </div>

      <div
        className="flex-1 relative mx-4 mb-3 rounded-2xl overflow-hidden min-h-[200px]"
        style={{ background: "#000" }}
      >
        {!scannerError && (
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {scannerError ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <p className="font-black mb-2" style={{ fontSize: 18, color: "rgba(255,255,255,0.7)" }}>
              {scannerError}
            </p>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
              Unesi barkod ručno ispod.
            </p>
          </div>
        ) : (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
            style={{
              width: "72%",
              maxWidth: 280,
              aspectRatio: "3 / 1.2",
              border: "2px solid rgba(0,255,136,0.65)",
              borderRadius: 12,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
            }}
          />
        )}
      </div>

      {!scannerError && (
        <p className="text-center px-4 mb-2" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
          {scannerStatus || " "}
        </p>
      )}

      <div className="px-4 pb-8">
        <p className="mb-2" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          Ili unesi barkod ručno
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={manualCode}
            onChange={(e) => {
              setManualCode(normalizeBarcodeInput(e.target.value).slice(0, 13));
              setManualHint("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitManual();
              }
            }}
            placeholder="npr. 3850104012345"
            className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-white text-[15px] outline-none tabular-nums"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)",
              fontFamily: "'DM Sans',sans-serif",
            }}
          />
          <button
            type="button"
            onClick={submitManual}
            className="flex-shrink-0 px-4 rounded-xl font-bold"
            style={{
              background: "rgba(0,255,136,0.12)",
              border: "1px solid rgba(0,255,136,0.3)",
              color: "#00ff88",
              fontSize: 13,
            }}
          >
            Traži
          </button>
        </div>
        {manualHint ? (
          <p className="mt-2" style={{ fontSize: 12, color: "rgba(255,107,107,0.9)" }}>
            {manualHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
