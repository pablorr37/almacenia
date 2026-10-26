import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { exigirTextoPermitido } from "@/lib/moderacion/moderacion";
import { Prisma } from "@/generated-prisma/client";
import type { Usuario } from "@/lib/auth/auth";
import { requireAdmin } from "@/lib/auth/auth";
import type { Plan, EstadoVerificacion } from "@/generated-prisma/client";
import { SAN_JUAN } from "@/lib/alcance/alcance";
import { MAX_TIENDAS } from "@/lib/planes/limites";
import { normalizarCuit } from "./cuit";
import { actualizarDiasCampanias } from "@/lib/publicidad/dias";
import { diaLocal } from "@/lib/gamificacion/gamificacion";
import { CONDICIONES_IVA, type CondicionIva } from "@/lib/precios/precios";

const RADIO_KM_DEFAULT = 5;
const RADIO_KM_MAXIMO = 50;

export const MEDIOS_DE_PAGO_VALIDOS = ["efectivo", "transferencia", "mercado_pago", "debito", "qr"] as const;
export type MedioPago = (typeof MEDIOS_DE_PAGO_VALIDOS)[number];

import type { HorarioTienda } from "./horarios";
export type { HorarioTienda };

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
  rubro: { id: string; nombre: string } | null; // 17-rubros-categorias.md
  verificada: boolean;
  plan: Plan;
  mediosDePago: MedioPago[];
  horarios: HorarioTienda[];
  abierto24hs: boolean;
  porcentajePuntosEquipo: number | null; // 12-gamificacion.md; null = default del sistema
  chatNotifFueraHorario: boolean; // 24-chat.md
  // Datos fiscales (20-precios-facturacion.md).
  condicionIva: CondicionIva;
  razonSocial: string | null;
  cuit: string | null;
  ingresosBrutos: string | null;
  domicilioFiscal: string | null;
  puntoVenta: number | null;
  inicioActividades: string | null; // YYYY-MM-DD
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
  rubro: { id: string; nombre: string } | null; // json_build_object, ver COLUMNA_RUBRO
  verificada: boolean;
  plan: Plan;
  // node-postgres no trae un parser por default para arrays de enums custom
  // (medio_pago[]) — llega como el literal crudo de Postgres, ej. "{efectivo,qr}".
  medios_de_pago: string;
  abierto_24hs: boolean;
  porcentaje_puntos_equipo: number | null;
  chat_notif_fuera_horario: boolean;
  condicion_iva: CondicionIva;
  razon_social: string | null;
  cuit: string | null;
  ingresos_brutos: string | null;
  domicilio_fiscal: string | null;
  punto_venta: number | null;
  inicio_actividades: string | null;
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
    abierto24hs: fila.abierto_24hs,
    porcentajePuntosEquipo: fila.porcentaje_puntos_equipo,
    chatNotifFueraHorario: fila.chat_notif_fuera_horario,
    condicionIva: fila.condicion_iva,
    razonSocial: fila.razon_social,
    cuit: fila.cuit,
    ingresosBrutos: fila.ingresos_brutos,
    domicilioFiscal: fila.domicilio_fiscal,
    puntoVenta: fila.punto_venta,
    inicioActividades: fila.inicio_actividades,
  };
}

// Rubro de la tienda como { id, nombre } (17-rubros-categorias.md). Subquery sobre la
// fila actual, también válida en RETURNING.
const COLUMNA_RUBRO = Prisma.sql`(SELECT json_build_object('id', r.id, 'nombre', r.nombre) FROM rubros r WHERE r.id = rubro_id) AS rubro`;

// Columnas de una Tienda, comunes a SELECT y RETURNING: ST_Y/ST_X extraen lat/lon del
// punto geográfico, ya que Prisma no puede tipar la columna `ubicacion` (geography).
const COLUMNAS_TIENDA = Prisma.sql`
  id, vendedor_id, nombre, descripcion, direccion, activa, desactivada_en,
  imagen_url, ${COLUMNA_RUBRO}, verificada, plan, medios_de_pago, abierto_24hs,
  porcentaje_puntos_equipo, chat_notif_fuera_horario,
  condicion_iva, razon_social, cuit, ingresos_brutos, domicilio_fiscal, punto_venta,
  to_char(inicio_actividades, 'YYYY-MM-DD') AS inicio_actividades,
  ST_Y(ubicacion::geometry) AS lat,
  ST_X(ubicacion::geometry) AS lon
`;

const SELECT_TIENDA = Prisma.sql`SELECT ${COLUMNAS_TIENDA} FROM tiendas`;

export function validarUbicacion(lat: number, lon: number): void {
  if (typeof lat !== "number" || Number.isNaN(lat) || lat < -90 || lat > 90) {
    throw new AppError("UBICACION_INVALIDA", "La latitud debe ser un número entre -90 y 90.");
  }
  if (typeof lon !== "number" || Number.isNaN(lon) || lon < -180 || lon > 180) {
    throw new AppError("UBICACION_INVALIDA", "La longitud debe ser un número entre -180 y 180.");
  }
}

function validarAbierto24hs(valor: unknown): void {
  if (valor !== undefined && typeof valor !== "boolean") {
    throw new AppError("ABIERTO_24HS_INVALIDO", "abierto24hs debe ser true o false.");
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

const MAX_FRANJAS_POR_DIA = 3;

// Valida la forma de `horarios` (02-tiendas.md): los 7 días presentes; por día, una
// sola entrada cerrada (ambos null) o de 1 a 3 franjas "HH:mm" con abre < cierra y
// sin superponerse (comparación de string funciona porque el formato es fijo y
// cero-rellenado).
export function horarioValido(horarios: HorarioTienda[]): boolean {
  const porDia = new Map<number, HorarioTienda[]>();
  for (const h of horarios) {
    if (!Number.isInteger(h.diaSemana) || h.diaSemana < 0 || h.diaSemana > 6) return false;
    const cerrado = h.abre === null && h.cierra === null;
    if (!cerrado) {
      if (h.abre === null || h.cierra === null) return false;
      if (!HORA_REGEX.test(h.abre) || !HORA_REGEX.test(h.cierra)) return false;
      if (h.abre >= h.cierra) return false;
    }
    porDia.set(h.diaSemana, [...(porDia.get(h.diaSemana) ?? []), h]);
  }
  if (porDia.size !== 7) return false;

  for (const franjas of porDia.values()) {
    const cerradas = franjas.filter((f) => f.abre === null);
    if (cerradas.length > 0) {
      if (franjas.length !== 1) return false; // un día cerrado es una sola entrada
      continue;
    }
    if (franjas.length > MAX_FRANJAS_POR_DIA) return false;
    const ordenadas = [...franjas].sort((a, b) => a.abre!.localeCompare(b.abre!));
    for (let i = 1; i < ordenadas.length; i++) {
      if (ordenadas[i].abre! < ordenadas[i - 1].cierra!) return false;
    }
  }
  return true;
}

async function obtenerHorarios(tiendaId: string): Promise<HorarioTienda[]> {
  const filas = await prisma.horarioTienda.findMany({
    where: { tiendaId },
    orderBy: [{ diaSemana: "asc" }, { abre: "asc" }],
  });
  return filas.map((f) => ({ diaSemana: f.diaSemana, abre: f.abre, cierra: f.cierra }));
}

async function obtenerHorariosPorTiendas(tiendaIds: string[]): Promise<Map<string, HorarioTienda[]>> {
  if (tiendaIds.length === 0) return new Map();
  const filas = await prisma.horarioTienda.findMany({
    where: { tiendaId: { in: tiendaIds } },
    orderBy: [{ diaSemana: "asc" }, { abre: "asc" }],
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
  abierto24hs?: boolean;
  rubroId?: string;
}

async function validarRubroId(rubroId: unknown): Promise<void> {
  if (rubroId === undefined || rubroId === null) return;
  const existe = typeof rubroId === "string" && (await prisma.rubro.findUnique({ where: { id: rubroId } }));
  if (!existe) throw new AppError("RUBRO_NO_ENCONTRADO", "El rubro elegido no existe.");
}

export async function crearTienda(usuario: Usuario, input: CrearTiendaInput): Promise<Tienda> {
  validarUbicacion(input.lat, input.lon);
  if (typeof input.nombre === "string") exigirTextoPermitido(input.nombre, "El nombre de la tienda");
  validarMediosDePago(input.mediosDePago);
  validarAbierto24hs(input.abierto24hs);
  if (input.horarios !== undefined && !horarioValido(input.horarios)) {
    throw new AppError(
      "HORARIO_INVALIDO",
      "Revisá los horarios: tienen que estar los 7 días, hasta 3 franjas por día, sin superponerse y con la apertura antes del cierre."
    );
  }
  await validarRubroId(input.rubroId);

  // Varias tiendas por dueño (19-equipo-tienda.md), hasta el tope de su plan; la tienda
  // toma el plan del dueño (20-precios-facturacion.md).
  const dueno = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { plan: true } });
  const propias = await prisma.tienda.count({ where: { vendedorId: usuario.id } });
  if (propias >= MAX_TIENDAS[dueno.plan]) {
    throw new AppError(
      "LIMITE_TIENDAS_PLAN",
      `Tu plan permite hasta ${MAX_TIENDAS[dueno.plan]} ${MAX_TIENDAS[dueno.plan] === 1 ? "tienda" : "tiendas"}. Mejorá tu plan para sumar sucursales.`
    );
  }
  const mediosDePago = input.mediosDePago ?? [];

  const [fila] = await prisma.$transaction(async (tx) => {
    // @default(uuid()) de Prisma se resuelve del lado del cliente, no como default
    // de la columna en Postgres — al insertar con SQL crudo hay que generarlo acá.
    const id = crypto.randomUUID();
    const filas = await tx.$queryRaw<FilaTienda[]>`
      INSERT INTO tiendas (id, vendedor_id, nombre, descripcion, direccion, ubicacion, medios_de_pago, abierto_24hs, rubro_id, plan)
      VALUES (
        ${id},
        ${usuario.id},
        ${input.nombre},
        ${input.descripcion ?? null},
        ${input.direccion},
        ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography,
        ${mediosDePago}::medio_pago[],
        ${input.abierto24hs ?? false},
        ${input.rubroId ?? null},
        ${dueno.plan}::plan
      )
      RETURNING
        ${COLUMNAS_TIENDA}
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
  // 18-alcance.md: límite del radio según el alcance del usuario (el radio pedido
  // se recorta a este valor), o `null` para buscar en toda la provincia (plata).
  alcanceKm?: number | null;
}

export async function buscarTiendasCercanas(
  input: BuscarTiendasCercanasInput,
  ahora = new Date()
): Promise<Array<Tienda & { distanciaKm: number; destacada: boolean }>> {
  const radioPedido = input.radioKm ?? (typeof input.alcanceKm === "number" ? input.alcanceKm : RADIO_KM_DEFAULT);
  if (typeof radioPedido !== "number" || Number.isNaN(radioPedido) || radioPedido <= 0 || radioPedido > RADIO_KM_MAXIMO) {
    throw new AppError("RADIO_INVALIDO", `El radio debe ser mayor a 0 y hasta ${RADIO_KM_MAXIMO} km.`);
  }
  validarUbicacion(input.lat, input.lon);

  const radioKm = typeof input.alcanceKm === "number" ? Math.min(radioPedido, input.alcanceKm) : radioPedido;
  const origen = Prisma.sql`ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography`;
  // Plata: toda la provincia de San Juan (rectángulo), sin límite de radio.
  const filtroZona =
    input.alcanceKm === null
      ? Prisma.sql`ubicacion::geometry && ST_MakeEnvelope(${SAN_JUAN.lonMin}, ${SAN_JUAN.latMin}, ${SAN_JUAN.lonMax}, ${SAN_JUAN.latMax}, 4326)`
      : Prisma.sql`ST_DWithin(ubicacion, ${origen}, ${radioKm * 1000})`;

  // 21-publicidad.md: tienda destacada = campaña pin_mapa en curso hoy.
  await actualizarDiasCampanias(ahora);
  const hoy = diaLocal(ahora);
  const filas = await prisma.$queryRaw<Array<FilaTienda & { distancia_km: number; destacada: boolean }>>`
    SELECT
      ${COLUMNAS_TIENDA},
      ST_Distance(ubicacion, ${origen}) / 1000 AS distancia_km,
      EXISTS (
        SELECT 1 FROM campanias_aviso c
        WHERE c.tienda_id = tiendas.id AND c.espacio = 'pin_mapa' AND c.estado = 'activa'
          AND c.desde <= ${hoy}::date AND c.ultimo_dia_consumido = ${hoy}::date
      ) AS destacada
    FROM tiendas
    WHERE activa = true
      -- 01-auth.md: las tiendas de cuentas pausadas/baneadas no se muestran.
      AND vendedor_id IN (SELECT id FROM usuarios WHERE estado_cuenta = 'activa')
      AND ${filtroZona}
    ORDER BY destacada DESC, (plan IN ('premium', 'plata')) DESC, distancia_km ASC
  `;

  const horariosPorTienda = await obtenerHorariosPorTiendas(filas.map((f) => f.id));

  return filas.map((fila) => ({
    ...aTienda(fila, horariosPorTienda.get(fila.id) ?? []),
    distanciaKm: fila.distancia_km,
    destacada: fila.destacada,
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

// Para la vista pública de una tienda: null si el dueño tiene la cuenta pausada o
// baneada (01-auth.md), igual que si no existiera.
export async function obtenerTiendaPublica(id: string): Promise<Tienda | null> {
  const dueno = await prisma.tienda.findUnique({
    where: { id },
    select: { vendedor: { select: { estadoCuenta: true } } },
  });
  if (!dueno || dueno.vendedor.estadoCuenta !== "activa") return null;
  return obtenerTienda(id);
}

export interface ActualizarTiendaInput {
  nombre?: string;
  descripcion?: string;
  direccion?: string;
  lat?: number;
  lon?: number;
  activa?: boolean;
  imagenUrl?: string;
  rubroId?: string;
  mediosDePago?: MedioPago[];
  horarios?: HorarioTienda[];
  abierto24hs?: boolean;
  porcentajePuntosEquipo?: number | null;
  chatNotifFueraHorario?: boolean; // 24-chat.md
  condicionIva?: CondicionIva;
  razonSocial?: string | null;
  cuit?: string | null;
  ingresosBrutos?: string | null;
  domicilioFiscal?: string | null;
  puntoVenta?: number | null;
  inicioActividades?: string | null;
}

// Emitir comprobantes pide razón social, CUIT, domicilio fiscal y punto de venta.
export function datosFiscalesCompletos(
  t: Pick<Tienda, "razonSocial" | "cuit" | "domicilioFiscal" | "puntoVenta">
): boolean {
  return !!(t.razonSocial && t.cuit && t.domicilioFiscal && t.puntoVenta);
}

type DatosFiscales = Pick<
  Tienda,
  "condicionIva" | "razonSocial" | "cuit" | "ingresosBrutos" | "domicilioFiscal" | "puntoVenta" | "inicioActividades"
>;

const textoOpcional = (v: string | null | undefined, actual: string | null) =>
  v === undefined ? actual : v === null ? null : v.trim() || null;

// Valida y combina los datos fiscales nuevos con los actuales (20-precios-facturacion.md).
function datosFiscales(input: ActualizarTiendaInput, actual: DatosFiscales): DatosFiscales {
  if (input.condicionIva !== undefined && !(CONDICIONES_IVA as readonly string[]).includes(input.condicionIva)) {
    throw new AppError("CONDICION_IVA_INVALIDA", "La condición frente al IVA tiene que ser monotributo, responsable inscripto o exento.");
  }
  let cuit = actual.cuit;
  if (input.cuit !== undefined) {
    cuit = input.cuit === null || input.cuit.trim() === "" ? null : normalizarCuit(input.cuit);
    if (input.cuit !== null && input.cuit.trim() !== "" && !cuit) {
      throw new AppError("CUIT_INVALIDO", "El CUIT no es válido: revisá los 11 números.");
    }
  }
  if (
    input.puntoVenta !== undefined &&
    input.puntoVenta !== null &&
    (!Number.isInteger(input.puntoVenta) || input.puntoVenta < 1 || input.puntoVenta > 99999)
  ) {
    throw new AppError("PUNTO_VENTA_INVALIDO", "El punto de venta tiene que ser un número entre 1 y 99999.");
  }
  if (
    input.inicioActividades !== undefined &&
    input.inicioActividades !== null &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(input.inicioActividades) || Number.isNaN(Date.parse(input.inicioActividades)))
  ) {
    throw new AppError("FECHA_INVALIDA", "La fecha de inicio de actividades tiene que tener el formato AAAA-MM-DD.");
  }
  return {
    condicionIva: input.condicionIva ?? actual.condicionIva,
    razonSocial: textoOpcional(input.razonSocial, actual.razonSocial),
    cuit,
    ingresosBrutos: textoOpcional(input.ingresosBrutos, actual.ingresosBrutos),
    domicilioFiscal: textoOpcional(input.domicilioFiscal, actual.domicilioFiscal),
    puntoVenta: input.puntoVenta !== undefined ? input.puntoVenta : actual.puntoVenta,
    inicioActividades: input.inicioActividades !== undefined ? input.inicioActividades : actual.inicioActividades,
  };
}

function validarPorcentajePuntosEquipo(valor: unknown): void {
  if (valor === undefined || valor === null) return;
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < 0 || valor > 100) {
    throw new AppError("PORCENTAJE_INVALIDO", "El porcentaje de puntos del equipo tiene que ser un entero entre 0 y 100.");
  }
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
  if (typeof input.nombre === "string") exigirTextoPermitido(input.nombre, "El nombre de la tienda");
  validarPorcentajePuntosEquipo(input.porcentajePuntosEquipo);
  if (input.chatNotifFueraHorario !== undefined && typeof input.chatNotifFueraHorario !== "boolean") {
    throw new AppError("VALOR_INVALIDO", "chatNotifFueraHorario tiene que ser true o false.");
  }
  const fiscal = datosFiscales(input, actual);

  const lat = input.lat ?? actual.lat;
  const lon = input.lon ?? actual.lon;
  if (input.lat !== undefined || input.lon !== undefined) {
    validarUbicacion(lat, lon);
  }
  validarMediosDePago(input.mediosDePago);
  validarAbierto24hs(input.abierto24hs);
  if (input.horarios !== undefined && !horarioValido(input.horarios)) {
    throw new AppError(
      "HORARIO_INVALIDO",
      "Revisá los horarios: tienen que estar los 7 días, hasta 3 franjas por día, sin superponerse y con la apertura antes del cierre."
    );
  }
  await validarRubroId(input.rubroId);

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
        rubro_id = ${input.rubroId ?? actual.rubro?.id ?? null},
        medios_de_pago = ${mediosDePago}::medio_pago[],
        abierto_24hs = ${input.abierto24hs ?? actual.abierto24hs},
        porcentaje_puntos_equipo = ${
          input.porcentajePuntosEquipo !== undefined ? input.porcentajePuntosEquipo : actual.porcentajePuntosEquipo
        }::smallint,
        chat_notif_fuera_horario = ${input.chatNotifFueraHorario ?? actual.chatNotifFueraHorario},
        condicion_iva = ${fiscal.condicionIva}::condicion_iva,
        razon_social = ${fiscal.razonSocial},
        cuit = ${fiscal.cuit},
        ingresos_brutos = ${fiscal.ingresosBrutos},
        domicilio_fiscal = ${fiscal.domicilioFiscal},
        punto_venta = ${fiscal.puntoVenta}::integer,
        inicio_actividades = ${fiscal.inicioActividades}::date,
        actualizada_en = now()
      WHERE id = ${tiendaId}
      RETURNING
        ${COLUMNAS_TIENDA}
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
