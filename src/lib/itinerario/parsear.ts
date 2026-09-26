// Parseo común del body de las rutas de comparación (15-itinerario.md).
export function opcionesComparacion(body: Record<string, unknown>) {
  const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
  return {
    lat: Number(body.lat),
    lon: Number(body.lon),
    radioKm: num(body.radioKm),
    maxTiendas: num(body.maxTiendas),
    soloAbiertas: body.soloAbiertas === true,
  };
}
