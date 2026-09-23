import { validarUbicacion } from './tiendas-validar-ubicacion';

describe('validarUbicacion', () => {
  it('should not throw for valid location', () => {
    expect(() => validarUbicacion(0, 0)).not.toThrow();
  });

  it('should not throw for location at extremes', () => {
    expect(() => validarUbicacion(90, 180)).not.toThrow();
  });

  it('should throw for non-numeric latitude', () => {
    expect(() => validarUbicacion('0' as any, 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for non-numeric longitude', () => {
    expect(() => validarUbicacion(0, '0' as any)).toThrow('Parámetros no numéricos');
  });

  it('should throw for NaN latitude', () => {
    expect(() => validarUbicacion(NaN, 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for NaN longitude', () => {
    expect(() => validarUbicacion(0, NaN as any)).toThrow('Parámetros no numéricos');
  });

  it('should throw for latitude out of range (too high)', () => {
    expect(() => validarUbicacion(91, 0)).toThrow('Latitud fuera de rango');
  });

  it('should throw for latitude out of range (too low)', () => {
    expect(() => validarUbicacion(-91, 0)).toThrow('Latitud fuera de rango');
  });

  it('should throw for longitude out of range (too high)', () => {
    expect(() => validarUbicacion(0, 181)).toThrow('Longitud fuera de rango');
  });

  it('should throw for longitude out of range (too low)', () => {
    expect(() => validarUbicacion(0, -181)).toThrow('Longitud fuera de rango');
  });

  it('should throw for non-numeric latitude (string)', () => {
    expect(() => validarUbicacion('abc', 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for non-numeric longitude (string)', () => {
    expect(() => validarUbicacion(0, 'xyz' as any)).toThrow('Parámetros no numéricos');
  });

  it('should throw for invalid number type (boolean)', () => {
    expect(() => validarUbicacion(true, 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for invalid number type (object)', () => {
    expect(() => validarUbicacion({}, 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for invalid number type (array)', () => {
    expect(() => validarUbicacion([], 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for invalid number type (null)', () => {
    expect(() => validarUbicacion(null, 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for invalid number type (undefined)', () => {
    expect(() => validarUbicacion(undefined, 0)).toThrow('Parámetros no numéricos');
  });

  it('should throw for too high latitude (90.1)', () => {
    expect(() => validarUbicacion(90.1, 0)).toThrow('Latitud fuera de rango');
  });

  it('should throw for too low latitude (-90.1)', () => {
    expect(() => validarUbicacion(-90.1, 0)).toThrow('Latitud fuera de rango');
  });

  it('should throw for too high longitude (180.1)', () => {
    expect(() => validarUbicacion(0, 180.1)).toThrow('Longitud fuera de rango');
  });

  it('should throw for too low longitude (-180.1)', () => {
    expect(() => validarUbicacion(0, -180.1)).toThrow('Longitud fuera de rango');
  });

  it('should throw for numeric but too high latitude (91)', () => {
    expect(() => validarUbicacion(91, 0)).toThrow('Latitud fuera de rango');
  });

  it('should throw for numeric but too low latitude (-91)', () => {
    expect(() => validarUbicacion(-91, 0)).toThrow('Latitud fuera de rango');
  });

  it('should throw for numeric but too high longitude (181)', () => {
    expect(() => validarUbicacion(0, 181)).toThrow('Longitud fuera de rango');
  });

  it('should throw for numeric but too low longitude (-181)', () => {
    expect(() => validarUbicacion(0, -181)).toThrow('Longitud fuera de rango');
  });
});