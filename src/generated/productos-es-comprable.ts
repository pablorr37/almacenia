export function esComprable(producto: Producto): boolean {
  if (typeof producto !== 'object' || producto === null) {
    return false;
  }

  const { disponible, stock } = producto;

  if (typeof disponible !== 'boolean' || typeof stock !== 'number') {
    return false;
  }

  if (disponible && stock > 0) {
    return true;
  }

  return false;
}