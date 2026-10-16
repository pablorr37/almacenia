"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";
import { FORMATOS_NATIVOS, ajustesEnfoque, constraintsCamara, elegirMotor, mensajeErrorCamara } from "./escaner";

// Hook cliente del escáner: abre la cámara trasera, aplica enfoque continuo (o al
// tocar) y lee con el BarcodeDetector nativo si existe, o con zxing si no. Cuando lee
// un código llama a `onDetectado` una sola vez. Al desactivarse (o desmontarse) apaga
// la cámara siempre. No es lógica de negocio: solo produce el texto leído.

type DetectorNativo = { detect(fuente: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type ConstructorDetector = {
  new (opciones: { formats: string[] }): DetectorNativo;
  getSupportedFormats?: () => Promise<string[]>;
};

const INTERVALO_MS = 150;

const HINTS_ZXING = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.QR_CODE,
    ],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

export function useEscaner(
  videoRef: RefObject<HTMLVideoElement | null>,
  { activo, onDetectado }: { activo: boolean; onDetectado: (texto: string) => void }
) {
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);
  const [linternaDisponible, setLinternaDisponible] = useState(false);
  const [linternaEncendida, setLinternaEncendida] = useState(false);
  const pistaRef = useRef<MediaStreamTrack | null>(null);
  const enfoqueAlTocarRef = useRef(false);
  const onDetectadoRef = useRef(onDetectado);
  useEffect(() => {
    onDetectadoRef.current = onDetectado;
  }, [onDetectado]);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    let stream: MediaStream | null = null;
    let controlesZxing: IScannerControls | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    let leido = false;
    const video = videoRef.current;

    const detectar = (texto: string) => {
      if (leido || cancelado || !texto) return;
      leido = true;
      onDetectadoRef.current(texto);
    };

    (async () => {
      setError(null);
      setListo(false);
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
          throw Object.assign(new Error("inseguro"), { name: "TypeError" });
        }
        stream = await navigator.mediaDevices.getUserMedia(constraintsCamara());
        if (cancelado) return;
        const pista = stream.getVideoTracks()[0];
        pistaRef.current = pista ?? null;

        const capacidades = pista?.getCapabilities?.() as { focusMode?: string[]; torch?: boolean } | undefined;
        const enfoque = ajustesEnfoque(capacidades);
        enfoqueAlTocarRef.current = enfoque.enfoqueAlTocar;
        setLinternaDisponible(enfoque.linterna);
        if (pista && enfoque.advanced.length > 0) {
          await pista.applyConstraints({ advanced: enfoque.advanced } as MediaTrackConstraints).catch(() => {});
        }

        if (!video) return;
        video.srcObject = stream;
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => {});
        if (cancelado) return;
        setListo(true);

        const Detector = (window as unknown as { BarcodeDetector?: ConstructorDetector }).BarcodeDetector;
        const formatos = Detector?.getSupportedFormats ? await Detector.getSupportedFormats().catch(() => []) : [];
        const motor = elegirMotor({ hayDetectorNativo: !!Detector, formatosNativos: formatos });

        if (motor === "nativo" && Detector) {
          const detector = new Detector({ formats: FORMATOS_NATIVOS.filter((f) => formatos.includes(f)) });
          const ciclo = async () => {
            if (cancelado || leido) return;
            if (video.readyState >= 2) {
              const codigos = await detector.detect(video).catch(() => []);
              if (codigos[0]?.rawValue) return detectar(codigos[0].rawValue);
            }
            temporizador = setTimeout(ciclo, INTERVALO_MS);
          };
          ciclo();
        } else {
          const lector = new BrowserMultiFormatReader(HINTS_ZXING, { delayBetweenScanAttempts: INTERVALO_MS });
          controlesZxing = await lector.decodeFromStream(stream, video, (resultado) => {
            if (resultado) detectar(resultado.getText());
          });
        }
      } catch (e) {
        if (!cancelado) setError(mensajeErrorCamara(e, typeof window !== "undefined" && window.isSecureContext));
      }
    })();

    return () => {
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
      controlesZxing?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      pistaRef.current = null;
      if (video) video.srcObject = null;
      setListo(false);
      setLinternaEncendida(false);
    };
  }, [activo, videoRef]);

  const alternarLinterna = useCallback(async () => {
    const pista = pistaRef.current;
    if (!pista) return;
    const encender = !linternaEncendida;
    await pista.applyConstraints({ advanced: [{ torch: encender }] } as unknown as MediaTrackConstraints).catch(() => {});
    setLinternaEncendida(encender);
  }, [linternaEncendida]);

  // Tocar la imagen: reenfoca en ese punto si la cámara lo permite (x, y entre 0 y 1).
  const enfocar = useCallback(async (x: number, y: number) => {
    const pista = pistaRef.current;
    if (!pista) return;
    const avanzado: Record<string, unknown> = { pointsOfInterest: [{ x, y }] };
    if (enfoqueAlTocarRef.current) avanzado.focusMode = "single-shot";
    await pista.applyConstraints({ advanced: [avanzado] } as unknown as MediaTrackConstraints).catch(() => {});
  }, []);

  return { error, listo, linternaDisponible, linternaEncendida, alternarLinterna, enfocar };
}
