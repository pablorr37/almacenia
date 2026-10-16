// CUIT/CUIL (20-precios-facturacion.md): 11 dígitos con dígito verificador módulo 11.
const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

export function normalizarCuit(texto: string): string | null {
  const digitos = String(texto ?? "").replace(/[-\s.]/g, "");
  if (!/^\d{11}$/.test(digitos)) return null;
  const suma = PESOS.reduce((s, peso, i) => s + peso * Number(digitos[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto;
  if (verificador === 10 || verificador !== Number(digitos[10])) return null;
  return digitos;
}
