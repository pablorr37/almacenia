// "Escanear producto" en el punto de venta (05-ventas.md): encuentra el producto de la
// tienda que corresponde a un código leído. Pura: la usa la UI con la lista de venta.

export function normalizarCodigo(texto: string): string {
  return String(texto ?? "").replace(/\D/g, "");
}

// Un UPC-A (12 dígitos) es el EAN-13 con un 0 adelante: se comparan en forma EAN-13.
function claveEan(digitos: string): string {
  return digitos.length === 12 ? `0${digitos}` : digitos;
}

export function productoPorCodigo<T extends { id: string; codigoBarras: string | null }>(productos: T[], texto: string): T | null {
  const crudo = String(texto ?? "").trim();
  if (!crudo) return null;
  const porId = productos.find((p) => p.id === crudo);
  if (porId) return porId;
  const digitos = normalizarCodigo(crudo);
  if (!digitos) return null;
  const clave = claveEan(digitos);
  return productos.find((p) => p.codigoBarras && claveEan(normalizarCodigo(p.codigoBarras)) === clave) ?? null;
}
