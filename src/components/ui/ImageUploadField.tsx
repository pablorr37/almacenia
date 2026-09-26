"use client";

import { useState, type ChangeEvent } from "react";
import { apiUpload, ApiError } from "@/lib/api-client";

type TipoArchivo = "tienda" | "producto" | "catalogo" | "avatar";

interface ImageUploadFieldProps {
  tipo: TipoArchivo;
  entidadId: string;
  valorActual: string | null;
  onSubido: (url: string) => void;
  label?: string;
  // Texto del botón cuando no hay foto (default "Subir foto").
  textoSubir?: string;
}

// Sube directo a /api/archivos/upload (08-archivos.md) al elegir el archivo, sin
// paso intermedio de "guardar" — onSubido entrega la url para que el formulario
// que lo usa la persista en imagenUrl/avatarUrl del recurso que corresponda.
export function ImageUploadField({ tipo, entidadId, valorActual, onSubido, label, textoSubir = "Subir foto" }: ImageUploadFieldProps) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function manejarCambio(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    try {
      const entidadQuery = tipo === "avatar" ? "" : `&entidadId=${entidadId}`;
      const resultado = await apiUpload<{ url: string }>(
        `/api/archivos/upload?tipo=${tipo}${entidadQuery}`,
        archivo
      );
      onSubido(resultado.url);
    } catch (err) {
      // Los errores de negocio (FOTOS_SOLO_PREMIUM, CATALOGO_YA_TIENE_FOTO — ver
      // 10-planes.md / 06-catalogo.md) ya traen el mensaje armado desde el backend;
      // el resto usa un mensaje genérico.
      setError(
        err instanceof ApiError && (err.code === "FOTOS_SOLO_PREMIUM" || err.code === "CATALOGO_YA_TIENE_FOTO")
          ? err.message
          : "No pudimos subir la imagen. Probá de nuevo."
      );
    } finally {
      setSubiendo(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-[13px] font-semibold text-text">{label}</span>}
      <div className="flex items-center gap-3">
        {valorActual && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={valorActual} alt="" className="h-14 w-14 rounded-control object-cover" />
        )}
        <label className="press cursor-pointer rounded-control border border-border bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-text">
          {subiendo ? "Subiendo..." : valorActual ? "Cambiar foto" : textoSubir}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={subiendo}
            onChange={manejarCambio}
          />
        </label>
      </div>
      {error && <span className="text-[13px] text-estado-rechazado-text">{error}</span>}
    </div>
  );
}
