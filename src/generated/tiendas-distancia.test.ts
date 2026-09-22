import { calcularDistanciaKm, ordenarTiendasPorDistancia } from './tiendas-distancia';

describe('calcularDistanciaKm', () => {
  it('calcula 0 km para el mismo punto', () => {
    const result = calcularDistanciaKm(0, 0, 0, 0);
    expect(result).toBe(0);
  });

  it('calcula distancia máxima aproximadamente 12742 km', () => {
    const result = calcularDistanciaKm(-90, -180, 90, 180);
    const expected = 12742;
    expect(result).toBeCloseTo(expected);
  });

  it('lanza error si hay parámetros no numéricos', () => {
    expect.assertions(1);
    try {
      calcularDistanciaKm('0' as any, 0, 0, 0);
    } catch (error) {
      expect(error.message).toBe('Parámetros inválidos');
    }
  });

  it('lanza error si hay latitud fuera de rango', () => {
    expect.assertions(1);
    try {
      calcularDistanciaKm(91, 0, 0, 0);
    } catch (error) {
      expect(error.message).toBe('Latitud fuera de rango');
    }
  });

  it('lanza error si hay longitud fuera de rango', () => {
    expect.assertions(1);
    try {
      calcularDistanciaKm(0, 181, 0, 0);
    } catch (error) {
      expect(error.message).toBe('Longitud fuera de rango');
    }
  });
});

describe('ordenarTiendasPorDistancia', () => {
  it('ordena correctamente una lista simple', () => {
    const tiendas = [
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 }
    ];
    const referencia = { lat: 0, lon: 0 };
    const resultado = ordenarTiendasPorDistancia(tiendas, referencia.lat, referencia.lon);
    expect(resultado).toEqual([
      { lat: 0, lon: 0 },
      { lat: 1, lon: 1 }
    ]);
  });

  it('ordena correctamente cuando hay distancias iguales', () => {
    const tiendas = [
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 }
    ];
    const referencia = { lat: 0, lon: 0 };
    const resultado = ordenarTiendasPorDistancia(tiendas, referencia.lat, referencia.lon);
    // Since both distances are equal, the original order should be preserved
    expect(resultado).toEqual([
      { lat: 0, lon: 0 },
      { lat: 0, lon: 1 }
    ]);
  });

  it('lanza error si hay propiedades faltantes en algún objeto de tienda', () => {
    expect.assertions(1);
    try {
      ordenarTiendasPorDistancia([{ lat: 0 }], 0, 0);
    } catch (error) {
      expect(error.message).toBe('Propiedades faltantes en tiendas');
    }
  });

  it('lanza error si el punto de referencia tiene latitud fuera de rango', () => {
    expect.assertions(1);
    try {
      ordenarTiendasPorDistancia([{ lat: 0, lon: 0 }], 91, 0);
    } catch (error) {
      expect(error.message).toBe('Latitud fuera de rango');
    }
  });

  it('lanza error si el punto de referencia tiene longitud fuera de rango', () => {
    expect.assertions(1);
    try {
      ordenarTiendasPorDistancia([{ lat: 0, lon: 0 }], 0, 181);
    } catch (error) {
      expect(error.message).toBe('Longitud fuera de rango');
    }
  });

  it('ordena correctamente una lista con múltiples tiendas', () => {
    const tiendas = [
      { lat: 40.416743151, lon: -3.703730200 }, // Madrid
      { lat: 51.507350900, lon: -0.127758300 }, // Londres
      { lat: 0, lon: 0 } // Barcelona (simplified)
    ];
    const referencia = { lat: 48.856614000, lon: 2.352245000 }; // París
    const resultado = ordenarTiendasPorDistancia(tiendas, referencia.lat, referencia.lon);
    // Check that the order is correct based on distance to Paris
    expect(resultado).toEqual([
      { lat: 0, lon: 0 }, // Barcelona (farthest) should be last
      { lat: 40.416743151, lon: -3.703730200 }, // Madrid
      { lat: 51.507350900, lon: -0.127758300 } // Londres
    ]);
  });
});