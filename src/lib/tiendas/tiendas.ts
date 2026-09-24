import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { Prisma } from "@/generated-prisma/client";
import type { Usuario } from "@/lib/auth/auth";
import { requireAdmin } from "@/lib/auth/auth";
import type { Categoria, Plan, EstadoVerificacion } from "@/generated-prisma/client";

const RADIO_KM_DEFAULT = 5;
const RADIO_KM_MAXIMO = 50;

const MEDIOS_DE_PAGO_VALIDOS = ["efectivo", "transferencia", "mercado_pago", "debito", "qr"] as const;
export type MedioPago = (typeof MEDIOS_DE_PAGO_VALIDOS)[number];

export interface HorarioTienda {
  diaSemana: number; // 0=domingo .. 6=sábado
  abre: string | null; // "HH:mm"
  cierra: string | null;
}

export interface Tienda {
  id: string;
  vendedorId: string;
  nombre: string;
  descripcion: string | null;
  direccion: string;
  lat: number;
  lon: number;
  activa: boolean;
  desactivadaEn: string | null;
  imagenUrl: string | null;
  rubro: Categoria | null;
  verificada: boolean;
  plan: Plan;
  mediosDePago: MedioPago[];
  horarios: HorarioTienda[];
}

export interface SolicitudVerificacion {
  id: string;
  tiendaId: string;
  estado: EstadoVerificacion;
  creadaEn: string;
  revisadaEn: string | null;
  revisadaPor: string | null;
  notaAdmin: string | null;
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
  desactivada_en: Date | null;
  imagen_url: string | null;
  rubro: Categoria | null;
  verificada: boolean;
  plan: Plan;
  // node-postgres no trae un parser por default para arrays de enums custom
  // (medio_pago[]) — llega como el literal crudo de Postgres, ej. "{efectivo,qr}".
  medios_de_pago: string;
}

// Convierte el literal de array de Postgres ("{}", "{efectivo,qr}") a string[].
// Alcanza con un split simple porque los valores del enum no tienen comas ni
// comillas.
function parsearMediosDePago(valor: string): MedioPago[] {
  const contenido = valor.slice(1, -1);
  return contenido === "" ? [] : (contenido.split(",") as MedioPago[]);
}

function aTienda(fila: FilaTienda, horarios: HorarioTienda[] = []): Tienda {
  return {
    id: fila.id,
    vendedorId: fila.vendedor_id,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    direccion: fila.direccion,
    lat: fila.lat,
    lon: fila.lon,
    activa: fila.activa,
    desactivadaEn: fila.desactivada_en ? fila.desactivada_en.toISOString() : null,
    imagenUrl: fila.imagen_url,
    rubro: fila.rubro,
    verificada: fila.verificada,
    plan: fila.plan,
    mediosDePago: parsearMediosDePago(fila.medios_de_pago),
    horarios,
  };
}

// Columnas comunes a todas las queries de lectura: ST_Y/ST_X extraen lat/lon del
// punto geográfico, ya que Prisma no puede tipar la columna `ubicacion` (geography).
const SELECT_TIENDA = Prisma.sql`
  SELECT
    id, vendedor_id, nombre, descripcion, direccion, activa, desactivada_en,
    imagen_url, rubro, verificada, plan, medios_de_pago,
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

function validarMediosDePago(mediosDePago: MedioPago[] | undefined): void {
  if (!mediosDePago) return;
  for (const medio of mediosDePago) {
    if (!(MEDIOS_DE_PAGO_VALIDOS as readonly string[]).includes(medio)) {
      throw new AppError("MEDIO_PAGO_INVALIDO", `"${medio}" no es un medio de pago válido.`);
    }
  }
}

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

// Valida la forma de `horarios`: exactamente 7 entradas, diaSemana 0-6 sin
// repetidos, y por cada una ambos null (cerrado) o ambos "HH:mm" válidos con
// abre < cierra (comparación de string funciona porque el formato es fijo y
// cero-rellenado).
export function horarioValido(horarios: HorarioTienda[]): boolean {
  if (horarios.length !== 7) return false;

  const dias = new Set<number>();
  for (const h of horarios) {
    if (!Number.isInteger(h.diaSemana) || h.diaSemana < 0 || h.diaSemana > 6) return false;
    if (dias.has(h.diaSemana)) return false;
    dias.add(h.diaSemana);

    const cerrado = h.abre === null && h.cierra === null;
    if (cerrado) continue;
    if (h.abre === null || h.cierra === null) return false;
    if (!HORA_REGEX.test(h.abre) || !HORA_REGEX.test(h.cierra)) return false;
    if (h.abre >= h.cierra) return false;
  }

  return dias.size === 7;
}

async function obtenerHorarios(tiendaId: string): Promise<HorarioTienda[]> {
  const filas = await prisma.horarioTienda.findMany({
    where: { tiendaId },
    orderBy: { diaSemana: "asc" },
  });
  return filas.map((f) => ({ diaSemana: f.diaSemana, abre: f.abre, cierra: f.cierra }));
}

async function obtenerHorariosPorTiendas(tiendaIds: string[]): Promise<Map<string, HorarioTienda[]>> {
  if (tiendaIds.length === 0) return new Map();
  const filas = await prisma.horarioTienda.findMany({
    where: { tiendaId: { in: tiendaIds } },
    orderBy: { diaSemana: "asc" },
  });
  const mapa = new Map<string, HorarioTienda[]>();
  for (const f of filas) {
    const lista = mapa.get(f.tiendaId) ?? [];
    lista.push({ diaSemana: f.diaSemana, abre: f.abre, cierra: f.cierra });
    mapa.set(f.tiendaId, lista);
  }
  return mapa;
}

export interface CrearTiendaInput {
  nombre: string;
  descripcion?: string;
  direccion: string;
  lat: number;
  lon: number;
  mediosDePago?: MedioPago[];
  horarios?: HorarioTienda[];
}

export async function crearTienda(usuario: Usuario, input: CrearTiendaInput): Promise<Tienda> {
  validarUbicacion(input.lat, input.lon);
  validarMediosDePago(input.mediosDePago);
  if (input.horarios !== undefined && !horarioValido(input.horarios)) {
    throw new AppError("HORARIO_INVALIDO", "Los horarios deben traer las 7 entradas de la semana.");
  }

  const existente = await prisma.tienda.findUnique({ where: { vendedorId: usuario.id } });
  if (existente) {
    throw new AppError("USUARIO_YA_TIENE_TIENDA", "El usuario ya tiene una tienda creada.");
  }

  const mediosDePago = input.mediosDePago ?? [];

  const [fila] = await prisma.$transaction(async (tx) => {
    // @default(uuid()) de Prisma se resuelve del lado del cliente, no como default
    // de la columna en Postgres — al insertar con SQL crudo hay que generarlo acá.
    const id = crypto.randomUUID();
    const filas = await tx.$queryRaw<FilaTienda[]>`
      INSERT INTO tiendas (id, vendedor_id, nombre, descripcion, direccion, ubicacion, medios_de_pago)
      VALUES (
        ${id},
        ${usuario.id},
        ${input.nombre},
        ${input.descripcion ?? null},
        ${input.direccion},
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
        ${mediosDePago}::medio_pago[]
      )
      RETURNING
        id, vendedor_id, nombre, descripcion, direccion, activa, desactivada_en,
        imagen_url, rubro, verificada, plan, medios_de_pago,
        ST_Y(ubicacion::geometry) AS lat,
        ST_X(ubicacion::geometry) AS lon
    `;

    await tx.usuario.update({ where: { id: usuario.id }, data: { esVendedor: true } });

    if (input.horarios) {
      await tx.horarioTienda.createMany({
        data: input.horarios.map((h) => ({
          tiendaId: id,
          diaSemana: h.diaSemana,
          abre: h.abre,
          cierra: h.cierra,
        })),
      });
    }

    return filas;
  });

  return aTienda(fila, input.horarios ?? []);
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
      id, vendedor_id, nombre, descripcion, direccion, activa, desactivada_en,
      imagen_url, rubro, verificada, plan, medios_de_pago,
      ST_Y(ubicacion::geometry) AS lat,
      ST_X(ubicacion::geometry) AS lon,
      ST_Distance(ubicacion, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography) / 1000 AS distancia_km
    FROM tiendas
    WHERE activa = true
      AND ST_DWithin(ubicacion, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography, ${radioMetros})
    ORDER BY (plan = 'premium') DESC, distancia_km ASC
  `;

  const horariosPorTienda = await obtenerHorariosPorTiendas(filas.map((f) => f.id));

  return filas.map((fila) => ({
    ...aTienda(fila, horariosPorTienda.get(fila.id) ?? []),
    distanciaKm: fila.distancia_km,
  }));
}

export async function obtenerTienda(id: string): Promise<Tienda | null> {
  const filas = await prisma.$queryRaw<FilaTienda[]>`
    ${SELECT_TIENDA} WHERE id = ${id}
  `;
  if (!filas[0]) return null;
  const horarios = await obtenerHorarios(id);
  return aTienda(filas[0], horarios);
}

export async function obtenerTiendaPorVendedor(vendedorId: string): Promise<Tienda | null> {
  const filas = await prisma.$queryRaw<FilaTienda[]>`
    ${SELECT_TIENDA} WHERE vendedor_id = ${vendedorId}
  `;
  if (!filas[0]) return null;
  const horarios = await obtenerHorarios(filas[0].id);
  return aTienda(filas[0], horarios);
}

export interface ActualizarTiendaInput {
  nombre?: string;
  descripcion?: string;
  direccion?: string;
  lat?: number;
  lon?: number;
  activa?: boolean;
  imagenUrl?: string;
  rubro?: Categoria;
  mediosDePago?: MedioPago[];
  horarios?: HorarioTienda[];
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
  validarMediosDePago(input.mediosDePago);
  if (input.horarios !== undefined && !horarioValido(input.horarios)) {
    throw new AppError("HORARIO_INVALIDO", "Los horarios deben traer las 7 entradas de la semana.");
  }

  const mediosDePago = input.mediosDePago ?? actual.mediosDePago;
  const nuevaActiva = input.activa ?? actual.activa;
  // Se registra la fecha de baja para el reporte de churn de 11-admin.md; se limpia
  // si la tienda se reactiva (ver 02-tiendas.md).
  const desactivadaEn = nuevaActiva
    ? null
    : actual.activa
      ? new Date()
      : actual.desactivadaEn
        ? new Date(actual.desactivadaEn)
        : null;

  const [fila] = await prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<FilaTienda[]>`
      UPDATE tiendas SET
        nombre = ${input.nombre ?? actual.nombre},
        descripcion = ${input.descripcion ?? actual.descripcion},
        direccion = ${input.direccion ?? actual.direccion},
        ubicacion = ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography,
        activa = ${nuevaActiva},
        desactivada_en = ${desactivadaEn},
        imagen_url = ${input.imagenUrl ?? actual.imagenUrl},
        rubro = ${input.rubro ?? actual.rubro}::categoria,
        medios_de_pago = ${mediosDePago}::medio_pago[],
        actualizada_en = now()
      WHERE id = ${tiendaId}
      RETURNING
        id, vendedor_id, nombre, descripcion, direccion, activa, desactivada_en,
        imagen_url, rubro, verificada, plan, medios_de_pago,
        ST_Y(ubicacion::geometry) AS lat,
        ST_X(ubicacion::geometry) AS lon
    `;

    if (input.horarios) {
      await tx.horarioTienda.deleteMany({ where: { tiendaId } });
      await tx.horarioTienda.createMany({
        data: input.horarios.map((h) => ({
          tiendaId,
          diaSemana: h.diaSemana,
          abre: h.abre,
          cierra: h.cierra,
        })),
      });
    }

    return filas;
  });

  const horarios = input.horarios ?? (await obtenerHorarios(tiendaId));
  return aTienda(fila, horarios);
}

function aSolicitudVerificacion(s: {
  id: string;
  tiendaId: string;
  estado: EstadoVerificacion;
  creadaEn: Date;
  revisadaEn: Date | null;
  revisadaPor: string | null;
  notaAdmin: string | null;
}): SolicitudVerificacion {
  return {
    id: s.id,
    tiendaId: s.tiendaId,
    estado: s.estado,
    creadaEn: s.creadaEn.toISOString(),
    revisadaEn: s.revisadaEn ? s.revisadaEn.toISOString() : null,
    revisadaPor: s.revisadaPor,
    notaAdmin: s.notaAdmin,
  };
}

export async function solicitarVerificacion(
  vendedor: Usuario,
  tiendaId: string
): Promise<SolicitudVerificacion> {
  const tienda = await prisma.tienda.findUnique({ where: { id: tiendaId } });
  if (!tienda) {
    throw new AppError("TIENDA_NO_ENCONTRADA", "La tienda no existe.");
  }
  if (tienda.vendedorId !== vendedor.id) {
    throw new AppError("NO_ES_DUENO_DE_TIENDA", "No sos el dueño de esta tienda.");
  }
  if (tienda.verificada) {
    throw new AppError("TIENDA_YA_VERIFICADA", "La tienda ya está verificada.");
  }

  const pendiente = await prisma.solicitudVerificacion.findFirst({
    where: { tiendaId, estado: "pendiente" },
  });
  if (pendiente) {
    throw new AppError("SOLICITUD_YA_PENDIENTE", "Ya hay una solicitud de verificación pendiente.");
  }

  const solicitud = await prisma.solicitudVerificacion.create({ data: { tiendaId } });
  return aSolicitudVerificacion(solicitud);
}

export async function revisarSolicitudVerificacion(
  admin: Usuario,
  solicitudId: string,
  decision: "aprobada" | "rechazada",
  notaAdmin?: string
): Promise<SolicitudVerificacion> {
  requireAdmin(admin);

  const solicitud = await prisma.solicitudVerificacion.findUnique({ where: { id: solicitudId } });
  if (!solicitud) {
    throw new AppError("SOLICITUD_NO_ENCONTRADA", "La solicitud no existe.");
  }

  const [actualizada] = await prisma.$transaction([
    prisma.solicitudVerificacion.update({
      where: { id: solicitudId },
      data: {
        estado: decision,
        revisadaEn: new Date(),
        revisadaPor: admin.id,
        notaAdmin: notaAdmin ?? null,
      },
    }),
    ...(decision === "aprobada"
      ? [prisma.tienda.update({ where: { id: solicitud.tiendaId }, data: { verificada: true } })]
      : []),
  ]);

  return aSolicitudVerificacion(actualizada);
}
