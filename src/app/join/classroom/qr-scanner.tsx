"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CameraOff, QrCode } from "lucide-react";

type Detector = { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type DetectorWindow = Window & { BarcodeDetector?: new (options?: { formats: string[] }) => Detector };

export default function ClassroomQrScanner({ schoolSlug }: { schoolSlug: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);

  async function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setActive(false);
  }

  async function startCamera() {
    setMessage("");
    const DetectorCtor = (window as DetectorWindow).BarcodeDetector;
    if (!DetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setUnsupported(true);
      setMessage("Este navegador no permite escanear QR desde la cámara. Ingresá el código manualmente.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      const detector = new DetectorCtor({ formats: ["qr_code"] });
      const scan = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const results = await detector.detect(videoRef.current);
          const value = results[0]?.rawValue?.trim();
          if (value) {
            await stopCamera();
            try {
              const url = new URL(value);
              if (url.pathname.endsWith("/join/classroom")) {
                const token = url.searchParams.get("token");
                const code = url.searchParams.get("code");
                const school = url.searchParams.get("school") || schoolSlug;
                if (token) {
                  router.push(`/join/classroom?school=${encodeURIComponent(school)}&token=${encodeURIComponent(token)}`);
                  return;
                }
                if (code) {
                  router.push(`/join/classroom?school=${encodeURIComponent(school)}&code=${encodeURIComponent(code)}`);
                  return;
                }
              }
            } catch { /* QR may contain a plain classroom code. */ }
            if (/^[a-z0-9]{6,16}$/i.test(value)) {
              router.push(`/join/classroom?school=${encodeURIComponent(schoolSlug)}&code=${encodeURIComponent(value)}`);
              return;
            }
            setMessage("El QR no contiene un código o enlace de aula válido.");
            return;
          }
        } catch {
          setMessage("No se pudo leer el QR. Acomodá el código dentro del recuadro e intentá nuevamente.");
        }
        if (streamRef.current) requestAnimationFrame(() => void scan());
      };
      requestAnimationFrame(() => void scan());
    } catch {
      setMessage("No se pudo acceder a la cámara. Revisá los permisos del navegador o ingresá el código manualmente.");
      await stopCamera();
    }
  }

  return <section className="mt-5 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 text-sm font-bold text-violet-950"><QrCode size={17}/> Escanear código QR</h2><p className="mt-1 text-xs text-violet-900/75">Usá la cámara trasera del celular para leer la invitación del docente.</p></div>
      {!active ? <button type="button" onClick={() => void startCamera()} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-violet-950 hover:bg-violet-100"><Camera size={16}/> Abrir cámara</button> : <button type="button" onClick={() => void stopCamera()} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><CameraOff size={16}/> Detener</button>}
    </div>
    {active ? <video ref={videoRef} muted playsInline className="mt-3 aspect-video w-full rounded-xl bg-slate-950 object-cover"/> : null}
    {message ? <p role="status" className={`mt-3 text-xs ${unsupported ? "text-amber-800" : "text-slate-700"}`}>{message}</p> : null}
  </section>;
}
