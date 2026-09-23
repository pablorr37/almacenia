export function calcularTotalItems(
  items: Array<{ 
    cantidad: number; 
    precioUnitario: number; 
  }>
): number {
  if (items.length === 0) {
    throw new Error('No hay items');
  }

  for (const item of items) {
    if (typeof item.cantidad !== 'number' || typeof item.precioUnitario !== 'number') {
      throw new Error('Parámetros no numéricos');
    }
    if (item.cantidad <= 0) {
      throw new Error('Cantidad no válida');
    }
  }

  return items.reduce((acc, item) => acc + item.cantidad * item.precioUnitario, 0);
}