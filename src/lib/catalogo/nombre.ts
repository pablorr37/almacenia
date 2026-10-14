// Nombre compuesto de una entrada del catálogo (06-catalogo.md). Puro: lo usan el
// server (al crear la entrada) y la UI (vista previa del alta).

export const UNIDADES_CONTENIDO = ["g", "kg", "ml", "l", "u"] as const;
export type UnidadContenido = (typeof UNIDADES_CONTENIDO)[number];

// "Arroz Gallo Oro largo fino 1 kg".
export function componerNombreCatalogo(partes: {
  categoria: string;
  marca?: string | null;
  variante?: string | null;
  contenido?: number | null;
  unidadContenido?: string | null;
}): string {
  const contenido =
    partes.contenido && partes.unidadContenido
      ? `${partes.contenido.toLocaleString("es-AR", { maximumFractionDigits: 3 })} ${partes.unidadContenido}`
      : null;
  return [partes.categoria, partes.marca, partes.variante, contenido]
    .map((p) => (p ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}
