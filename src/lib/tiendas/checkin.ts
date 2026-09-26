// Check-in GPS en una tienda (specs/sdd/02-tiendas.md), base de los puntos
// checkin_gps y visita_compra (12-gamificacion.md).
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { otorgarPorCheckIn } from "@/lib/gamificacion/gamificacion";
import { validarUbicacion } from "./tiendas";

export const RADIO_CHECKIN_METROS = 100;

export interface CheckInTienda {
  id: string;
  compradorId: string;
  tiendaId: string;
  distanciaM: number;
  creadoEn: string;
}

export async function hacerCheckIn(
  comprador: Usuario,
  tiendaId: string,
  ubicacion: { lat: number; lon: number }
): Promise<{ checkIn: CheckInTienda; puntosOtorgados: number }> {
  validarUbicacion(ubicacion.lat, ubicacion.lon);

  const filas = await prisma.$queryRaw<Array<{ vendedor_id: string; distancia_m: number }>>`
    SELECT vendedor_id,
      ST_Distance(ubicacion, ST_SetSRID(ST_MakePoint(${ubicacion.lon}, ${ubicacion.lat}), 4326)::geography) AS distancia_m
    FROM tiendas WHERE id = ${tiendaId}
  `;
  const tienda = filas[0];
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedor_id === comprador.id) {
    throw new AppError("CHECKIN_TIENDA_PROPIA", "No podés hacer check-in en tu propia tienda.");
  }
  const distanciaM = Math.round(Number(tienda.distancia_m) * 10) / 10;
  if (distanciaM > RADIO_CHECKIN_METROS) {
    throw new AppError(
      "CHECKIN_FUERA_DE_RANGO",
      `Tenés que estar a menos de ${RADIO_CHECKIN_METROS} m de la tienda (estás a ${Math.round(distanciaM)} m).`
    );
  }

  // Solo se guarda la distancia, no las coordenadas crudas del comprador (privacidad).
  const checkIn = await prisma.checkInTienda.create({
    data: { compradorId: comprador.id, tiendaId, distanciaM },
  });
  const puntosOtorgados = await otorgarPorCheckIn(comprador.id, tiendaId, checkIn.creadoEn);

  return {
    checkIn: {
      id: checkIn.id,
      compradorId: checkIn.compradorId,
      tiendaId: checkIn.tiendaId,
      distanciaM: Number(checkIn.distanciaM),
      creadoEn: checkIn.creadoEn.toISOString(),
    },
    puntosOtorgados,
  };
}
