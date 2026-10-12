// Pura y apta para el navegador: interpreta el contenido del QR o el número tipeado
// del código de cliente (01-auth.md).
export const PREFIJO_QR = "almacenia:cliente:";

export function leerCodigoQr(texto: string): string | null {
  const t = texto.trim();
  const limpio = t.startsWith(PREFIJO_QR) ? t.slice(PREFIJO_QR.length) : t;
  const digitos = limpio.replace(/\s+/g, "");
  return /^\d{6}$/.test(digitos) ? digitos : null;
}
