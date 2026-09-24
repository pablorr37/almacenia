"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

// Extraída aparte de useCodigoBarras para poder testearla sin DOM/jsdom (el hook en
// sí depende de HTMLVideoElement vía useRef, no ejercitable en el entorno Node de
// Vitest de este proyecto) — ver useCodigoBarras.test.ts.
export function manejarResultadoEscaneo(
  resultado: { getText(): string } | undefined,
  onDetectado: (texto: string) => void
): void {
  if (resultado) {
    onDetectado(resultado.getText());
  }
}

// Hook cliente: envuelve @zxing/browser (getUserMedia) para leer códigos de barras/QR
// con la cámara. No es lógica de negocio de 06-catalogo.md — solo produce el texto
// decodificado; quien lo usa decide qué hacer con él (ej. buscarEnCatalogo).
export function useCodigoBarras(onDetectado: (texto: string) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [activo, setActivo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detener = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setActivo(false);
  }, []);

  const iniciar = useCallback(async () => {
    if (!videoRef.current) return;
    setError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (resultado) => manejarResultadoEscaneo(resultado, onDetectado)
      );
      setActivo(true);
    } catch {
      setError("No pudimos acceder a la cámara. Revisá los permisos del navegador.");
      setActivo(false);
    }
  }, [onDetectado]);

  useEffect(() => () => detener(), [detener]);

  return { videoRef, activo, error, iniciar, detener };
}
