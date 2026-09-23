import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { Prisma } from "@/generated-prisma/client";
import type { Usuario } from "@/lib/auth/auth";

const RADIO_KM_DEFAULT = 5;
const RADIO_KM_MAXIMO = 50;

export interface Tienda {
  id: string;
  vendedorId: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
}

interface FilaTienda {
  id: string;
  vendedor_id: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
}

function aTienda(fila: FilaTienda): Tienda {
  return {
    id: fila.id,
    vendedorId: fila.vendedor_id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    direccion: fila.direccion,
    lat: fila.lat,
    lon: fila.lon,
    activa: fila.activa,
  };
}

// Columnas comunes a todas las queries de lectura: ST_Y/ST_X extraen lat/lon del
// punto geográfico, ya que Prisma no puede tipar la columna `ubicacion` (geography).
const SELECT_TIENDA = Prisma.sql`
  SELECT
    id, vendedor_id, nombre, descripcion, direccion, activa,
    ST_Y(ubicacion::geometry) AS lat,
    ST_X(ubicacion::geometry) AS lon
  FROM tiendas
`;

function validarUbicacion(lat: number, lon: number): void {
  if (typeof lat !== "number" || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new AppError("UBICACION_INVALIDA", "La latitud debe ser un número entre -90 y 90.");
  }
  if (typeof lon !== "number" || Number.isNaN(lon) || lon < -180 || lon > 180) {
    throw new AppError("UBICACION_INVALIDA", "La longitud debe ser un número entre -180 y 180.");
  }
}

export interface CrearTiendaInput {
  nombre: string;
  descripcion?: string;
  direccion: string;
  lat: number;
  lon: number;
}

export async function crearTienda(usuario: Usuario, input: CrearTiendaInput): Promise<Tienda> {
  validarUbicacion(input.lat, input.lon);

  const existente = await prisma.tienda.findUnique({ where: { vendedorId: usuario.id } });
  if (existente) {
    throw new AppError("USUARIO_YA_TIENE_TIENDA", "El usuario ya tiene una tienda creada.");
  }

  const [fila] = await prisma.$transaction(async (tx) => {
    // @default(uuid()) de Prisma se resuelve del lado del cliente, no como default
    // de la columna en Postgres — al insertar con SQL crudo hay que generarlo acá.
    const id = crypto.randomUUID();
    const filas = await tx.$queryRaw<FilaTienda[]>`
      INSERT INTO tiendas (id, vendedor_id, nombre, descripcion, direccion, ubicacion)
      VALUES (
        ${id},
        ${usuario.id},
        ${input.nombre},
        ${input.descripcion ?? null},
        ${input.direccion},
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography
      )
      RETURNING
        id, vendedor_id, nombre, descripcion, direccion, activa,
        ST_Y(ubicacion::geometry) AS lat,
        ST_X(ubicacion::geometry) AS lon
    `;

    await tx.usuario.update({ where: { id: usuario.id }, data: { esVendedor: true } });

    return filas;
  });

  return aTienda(fila);
}

export interface BuscarTiendasCercanasInput {
  lat: number;
  lon: number;
  radioKm?: number;
}

export async function buscarTiendasCercanas(
  input: BuscarTiendasCercanasInput
): Promise<Array<Tienda & { distanciaKm: number }>> {
  const radioKm = input.radioKm ?? RADIO_KM_DEFAULT;
  if (typeof radioKm !== "number" || Number.isNaN(radioKm) || radioKm <= 0 || radioKm > RADIO_KM_MAXIMO) {
    throw new AppError("RADIO_INVALIDO", `El radio debe ser mayor a 0 y hasta ${RADIO_KM_MAXIMO} km.`);
  }
  validarUbicacion(input.lat, input.lon);

  const radioMetros = radioKm * 1000;

  const filas = await prisma.$queryRaw<Array<FilaTienda & { distancia_km: number }>>`
    SELECT
      id, vendedor_id, nombre, descripcion, direccion, activa,
      ST_Y(ubicacion::geometry) AS lat,
      ST_X(ubicacion::geometry) AS lon,
      ST_Distance(ubicacion, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography) / 1000 AS distancia_km
    FROM tiendas
    WHERE activa = true
      AND ST_DWithin(ubicacion, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography, ${radioMetros})
    ORDER BY distancia_km ASC
  `;

  return filas.map((fila) => ({ ...aTienda(fila), distanciaKm: fila.distancia_km }));
}

export async function obtenerTienda(id: string): Promise<Tienda | null> {
  const filas = await prisma.$queryRaw<FilaTienda[]>`
    ${SELECT_TIENDA} WHERE id = ${id}
  `;
  return filas[0] ? aTienda(filas[0]) : null;
}

export async function obtenerTiendaPorVendedor(vendedorId: string): Promise<Tienda | null> {
  const filas = await prisma.$queryRaw<FilaTienda[]>`
    ${SELECT_TIENDA} WHERE vendedor_id = ${vendedorId}
  `;
  return filas[0] ? aTienda(filas[0]) : null;
}

export interface ActualizarTiendaInput {
  nombre?: string;
  descripcion?: string;
  direccion?: string;
  lat?: number;
  lon?: number;
  activa?: boolean;
}

export async function actualizarTienda(
  vendedor: Usuario,
  tiendaId: string,
  input: ActualizarTiendaInput
): Promise<Tienda> {
  const actual = await obtenerTienda(tiendaId);
  if (!actual) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (actual.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }

  const lat = input.lat ?? actual.lat;
  const lon = input.lon ?? actual.lon;
  if (input.lat !== undefined || input.lon !== undefined) {
    validarUbicacion(lat, lon);
  }

  const filas = await prisma.$queryRaw<FilaTienda[]>`
    UPDATE tiendas SET
      nombre = ${input.nombre ?? actual.nombre},
      descripcion = ${input.descripcion ?? actual.descripcion},
      direccion = ${input.direccion ?? actual.direccion},
      ubicacion = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
      activa = ${input.activa ?? actual.activa},
      actualizada_en = now()
    WHERE id = ${tiendaId}
    RETURNING
      id, vendedor_id, nombre, descripcion, direccion, activa,
      ST_Y(ubicacion::geometry) AS lat,
      ST_X(ubicacion::geometry) AS lon
  `;

  return aTienda(filas[0]);
}
