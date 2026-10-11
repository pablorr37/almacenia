// Compresión de fotos en el navegador antes de subirlas (08-archivos.md,
// "Compresión en el cliente"): una foto de cámara de 12 MP (~5 MB) queda en ~300 KB,
// lo que evita el límite de 5 MB y baja el uso de memoria del teléfono.

export const LADO_MAXIMO = 1600;
const CALIDAD_JPEG = 0.82;

// Pura: dimensiones finales manteniendo la proporción, sin agrandar.
export function dimensionesDestino(ancho: number, alto: number, ladoMaximo = LADO_MAXIMO): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoMaximo) return { ancho, alto };
  const escala = ladoMaximo / mayor;
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) };
}

// Solo navegador. Si no se puede decodificar (p. ej. HEIC) o no conviene, devuelve
// el archivo original y la validación del servidor decide.
export async function comprimirImagen(archivo: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || !archivo.type.startsWith("image/")) return archivo;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    return archivo;
  }
  try {
    const { ancho, alto } = dimensionesDestino(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return archivo;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPEG));
    // Si por algún motivo pesa más que el original (ya venía chico y comprimido), se usa el original.
    if (!blob || (blob.size >= archivo.size && archivo.type !== "image/png")) return archivo;
    const nombre = archivo.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nombre, { type: "image/jpeg" });
  } finally {
    bitmap.close();
  }
}

// Mensaje para el usuario según el tipo de falla al subir.
export function mensajeErrorSubida(err: unknown, mensajeServidor: string | null): string {
  if (mensajeServidor) return mensajeServidor;
  if (err instanceof TypeError) {
    return "No se pudo enviar la foto. Si el teléfono avisó falta de memoria, sacá la foto con la cámara y después elegila desde la galería.";
  }
  return "No pudimos subir la imagen. Probá de nuevo.";
}
