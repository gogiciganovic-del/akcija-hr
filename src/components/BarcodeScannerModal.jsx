import { useCallback, useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";

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

/**
 * Full-screen kamera skener.
 * @param {boolean} open
 * @param {() => void} onClose
 * @param {(barcode: string) => void} onDetected
 */
export function BarcodeScannerModal({ open, onClose, onDetected }) {
  const [scannerError, setScannerError] = useState(null);
  const [scannerStatus, setScannerStatus] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const detectorRef = useRef(null);
  const scannedLockRef = useRef(false);
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    detectorRef.current = null;
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    scannedLockRef.current = false;
    stopCamera();
    setScannerError(null);
    setScannerStatus("");
    onClose?.();
  }, [onClose, stopCamera]);

  useEffect(() => {
    if (!open) return;

    scannedLockRef.current = false;
    setScannerError(null);
    setScannerStatus("Pokrećem kameru...");

    if (typeof window === "undefined" || typeof window.BarcodeDetector !== "function") {
      setScannerError("Skeniranje nije podržano na ovom uređaju");
      setScannerStatus("");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerError("Skeniranje nije podržano na ovom uređaju");
      setScannerStatus("");
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const detector = new window.BarcodeDetector({
          formats: ["ean_13", "ean_8", "upc_a"],
        });
        detectorRef.current = detector;

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

        video.srcObject = stream;
        await video.play();
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
                  scannedLockRef.current = true;
                  setScannerStatus("Pronađen barkod...");
                  stopCamera();
                  setScannerError(null);
                  setScannerStatus("");
                  onDetectedRef.current?.(raw);
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
      } catch (err) {
        if (cancelled) return;
        const denied =
          err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError";
        setScannerError(
          denied
            ? "Dopusti pristup kameri da skeniraš barkod"
            : "Skeniranje nije podržano na ovom uređaju"
        );
        setScannerStatus("");
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [open, stopCamera]);

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
        className="flex-1 relative mx-4 mb-4 rounded-2xl overflow-hidden"
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
              Koristi tekstualnu pretragu ili otvori aplikaciju u Chromeu na Androidu.
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

      <p className="text-center pb-8 px-4" style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>
        {scannerError ? " " : scannerStatus || " "}
      </p>
    </div>
  );
}
