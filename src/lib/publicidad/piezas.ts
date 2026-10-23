import sharp, { type Metadata } from "sharp";
import { AppError } from "@/lib/errors";
import { aceptaImagen, proporcionValida, type EspacioAviso } from "./reglas";

// Piezas con imagen (21-publicidad.md): JPEG/PNG/WebP/GIF hasta 1 MB, proporción del
// espacio, salida WebP (animado si venía animado) con ancho máximo 640 px.

const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAXIMO_BYTES = 1024 * 1024;
const ANCHO_MAXIMO = 640;

export async function procesarImagenAviso(
  espacio: EspacioAviso,
  buffer: Buffer,
  contentType: string
): Promise<{ buffer: Buffer; ancho: number; alto: number; contentType: "image/webp" }> {
  if (!TIPOS.includes(contentType)) {
    throw new AppError("TIPO_ARCHIVO_INVALIDO", "Solo se aceptan imágenes JPEG, PNG, WebP o GIF.");
  }
  if (buffer.byteLength > MAXIMO_BYTES) {
    throw new AppError("ARCHIVO_DEMASIADO_GRANDE", "La imagen del aviso no puede superar 1 MB.");
  }
  if (!aceptaImagen(espacio)) throw new AppError("PIEZA_INVALIDA", "Este espacio no lleva imagen.");

  let meta: Metadata;
  try {
    meta = await sharp(buffer, { animated: true }).metadata();
  } catch {
    throw new AppError("TIPO_ARCHIVO_INVALIDO", "No se pudo leer la imagen.");
  }
  const ancho = meta.width ?? 0;
  // En animadas, height es la tira completa: el alto de un cuadro es pageHeight.
  const alto = meta.pageHeight ?? meta.height ?? 0;
  if (!proporcionValida(espacio, ancho, alto)) {
    throw new AppError("PROPORCION_INVALIDA", "La imagen no tiene la proporción de este espacio.");
  }

  const salidaAncho = Math.min(ancho, ANCHO_MAXIMO);
  const salida = await sharp(buffer, { animated: true })
    .resize({ width: salidaAncho, withoutEnlargement: true })
    .webp({ quality: 80, loop: 0 })
    .toBuffer({ resolveWithObject: true });
  const altoSalida = salida.info.pageHeight ?? salida.info.height;
  return { buffer: salida.data, ancho: salida.info.width, alto: altoSalida, contentType: "image/webp" };
}
