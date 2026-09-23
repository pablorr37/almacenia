export function validarUbicacion(lat: number, lon: number): void {
  // Verificar que lat y lon sean números y no NaN
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw new Error('Parámetros no numéricos');
  }

  // Verificar rango de latitud
  if (lat < -90 || lat > 90) {
    throw new Error('Latitud fuera de rango');
  }

  // Verificar rango de longitud
  if (lon < -180 || lon > 180) {
    throw new Error('Longitud fuera de rango');
  }
}