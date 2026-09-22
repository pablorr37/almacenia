export function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function ordenarTiendasPorDistancia(
  tiendas: Array<{ lat: number; lon: number }>,
  lat: number,
  lon: number
): Array<{ lat: number; lon: number }> {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw new Error('Parámetros inválidos');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Latitud fuera de rango');
  }
  if (lon < -180 || lon > 180) {
    throw new Error('Longitud fuera de rango');
  }

  return tiendas.sort((a, b) => {
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number' || isNaN(a.lat) || isNaN(a.lon)) {
      throw new Error('Propiedades faltantes en tiendas');
    }
    if (typeof b.lat !== 'number' || typeof b.lon !== 'number' || isNaN(b.lat) || isNaN(b.lon)) {
      throw new Error('Propiedades faltantes en tiendas');
    }
    const distA = calcularDistanciaKm(lat, lon, a.lat, a.lon);
    const distB = calcularDistanciaKm(lat, lon, b.lat, b.lon);
    return distA - distB;
  });
}