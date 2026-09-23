import { calcularTotalItems } from 'ventas-calcular-total';

describe('calcularTotalItems', () => {
  it('calcula el total con cantidades y precios válidos', () => {
    const items = [
      { cantidad: 2, precioUnitario: 5 },
      { cantidad: 3, precioUnitario: 4 }
    ];
    const total = items.reduce((acc, item) => acc + item.cantidad * item.precioUnitario, 0);
    expect(calculadorTotalItems(items)).toBe(total);
  });

  it('lanza error si algún item tiene cantidad 0', () => {
    const items = [
      { cantidad: 0, precioUnitario: 10 },
      { cantidad: 1, precioUnitario: 5 }
    ];
    expect(() => {
      calcularTotalItems(items);
    }).toThrow('Cantidad no válida');
  });

  it('lanza error si algún item tiene cantidad negativa', () => {
    const items = [
      { cantidad: -1, precioUnitario: 10 },
      { cantidad: 1, precioUnitario: 5 }
    ];
    expect(() => {
      calcularTotalItems(items);
    }).toThrow('Cantidad no válida');
  });

  it('lanza error si el array de items está vacío', () => {
    expect(() => {
      calcularTotalItems([]);
    }).toThrow('No hay items');
  });

  it('lanza error si algún item tiene parámetros no numéricos', () => {
    const items = [
      { cantidad: '2' as any, precioUnitario: 5 },
      { cantidad: 3, precioUnitario: 4 }
    ];
    expect(() => {
      calcularTotalItems(items);
    }).toThrow('Parámetros no numéricos');
  });

  it('lanza error si algún item tiene propiedades faltantes', () => {
    const items = [
      { precioUnitario: 5 }
    ];
    expect(() => {
      calcularTotalItems(items);
    }).toThrow('Propiedades faltantes en items');
  });

  it('lanza error si algún item tiene precio no numérico', () => {
    const items = [
      { cantidad: 2, precioUnitario: '5' as any },
      { cantidad: 3, precioUnitario: 4 }
    ];
    expect(() => {
      calcularTotalItems(items);
    }).toThrow('Parámetros no numéricos');
  });

  it('calcula el total correctamente con todos los items iguales', () => {
    const items = [
      { cantidad: 1, precioUnitario: 10 },
      { cantidad: 2, precioUnitario: 10 },
      { cantidad: 3, precioUnitario: 10 }
    ];
    const total = 10 * (1 + 2 + 3) = 60;
    expect(calculadorTotalItems(items)).toBe(60);
  });
});