import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { requireAdmin, type Usuario } from "@/lib/auth/auth";
import { exigirPermiso } from "@/lib/equipo/equipo";
import { obtenerConfig } from "@/lib/config/config";
import { diaLocal, sinRomper } from "@/lib/gamificacion/gamificacion";
import { subirArchivo } from "@/lib/archivos/archivos";
import { notificar } from "@/lib/notificaciones/notificar";
import { gastarPuntos } from "@/lib/puntos/saldo-tx";
import { precioEspacio } from "@/lib/puntos/precios";
import { crearOrdenPago, instruccionesDe, type OrdenPago } from "@/lib/pagos/ordenes";
import type { EstadoCampania, PagoCampania, Prisma } from "@/generated-prisma/client";
import { procesarImagenAviso } from "./piezas";
import { actualizarDiasCampanias, fechaDb } from "./dias";

export { actualizarDiasCampanias, fechaDb } from "./dias";
import { DIAS_MAXIMO, ESPACIOS, TEXTO_MAXIMO, aceptaImagen, destinoValido, diasNoUsados, type EspacioAviso } from "./reglas";

// Campañas del motor de avisos propio (21-publicidad.md).

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAXIMO = 100;
const ESTADOS: EstadoCampania[] = ["pendiente_pago", "en_moderacion", "activa", "pausada", "rechazada", "finalizada"];

export interface Campania {
  id: string;
  tienda: { id: string; nombre: string };
  espacio: EspacioAviso;
  titulo: string;
  estado: EstadoCampania;
  desde: string; // YYYY-MM-DD
  dias: number;
  diasConsumidos: number;
  pago: PagoCampania;
  puntosPagados: number | null;
  orden: { id: string; codigo: string; montoArs: number; estado: string } | null;
  radioKm: number | null;
  motivoRechazo: string | null;
  enviadaEn: string | null;
  creadaEn: string;
  pieza: { tipo: "imagen" | "texto"; imagenUrl: string | null; ancho: number | null; alto: number | null; texto: string | null; destino: string | null } | null;
  metricas: { impresiones: number; clics: number };
}

export interface CrearCampaniaInput {
  espacio: EspacioAviso;
  titulo: string;
  desde: string;
  dias: number;
  pago: PagoCampania;
  texto?: string | null;
  destino?: string | null;
  radioKm?: number | null;
  imagen?: { buffer: Buffer; contentType: string } | null;
}

const INCLUDE = {
  tienda: { select: { id: true, nombre: true } },
  piezas: { orderBy: { creadaEn: "asc" as const } },
  ordenPago: true,
} satisfies Prisma.CampaniaAvisoInclude;

type FilaCampania = Prisma.CampaniaAvisoGetPayload<{ include: typeof INCLUDE }>;

function aDia(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

async function metricasDe(ids: string[]): Promise<Map<string, { impresiones: number; clics: number }>> {
  const mapa = new Map(ids.map((id) => [id, { impresiones: 0, clics: 0 }]));
  if (ids.length === 0) return mapa;
  const filas = await prisma.eventoAviso.groupBy({ by: ["campaniaId", "tipo"], where: { campaniaId: { in: ids } }, _count: { _all: true } });
  for (const f of filas) {
    const m = mapa.get(f.campaniaId)!;
    if (f.tipo === "impresion") m.impresiones = f._count._all;
    else m.clics = f._count._all;
  }
  return mapa;
}

function aCampania(c: FilaCampania, metricas: { impresiones: number; clics: number }): Campania {
  const pieza = c.piezas[0];
  const segmento = (c.segmento as { radioKm?: number } | null) ?? null;
  return {
    id: c.id,
    tienda: c.tienda,
    espacio: c.espacio,
    titulo: c.titulo,
    estado: c.estado,
    desde: aDia(c.desde),
    dias: c.dias,
    diasConsumidos: c.diasConsumidos,
    pago: c.pago,
    puntosPagados: c.puntosPagados === null ? null : Number(c.puntosPagados),
    orden: c.ordenPago
      ? { id: c.ordenPago.id, codigo: c.ordenPago.id.replace(/-/g, "").slice(0, 8).toUpperCase(), montoArs: Number(c.ordenPago.montoArs), estado: c.ordenPago.estado }
      : null,
    radioKm: typeof segmento?.radioKm === "number" ? segmento.radioKm : null,
    motivoRechazo: c.motivoRechazo,
    enviadaEn: c.enviadaEn?.toISOString() ?? null,
    creadaEn: c.creadaEn.toISOString(),
    pieza: pieza
      ? { tipo: pieza.tipo, imagenUrl: pieza.imagenUrl, ancho: pieza.ancho, alto: pieza.alto, texto: pieza.texto, destino: pieza.destino }
      : null,
    metricas,
  };
}

async function cargar(id: string): Promise<Campania> {
  const fila = await prisma.campaniaAviso.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  return aCampania(fila, (await metricasDe([id])).get(id)!);
}

function validarDia(dia: unknown, hoy: string): string {
  if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(fechaDb(dia).getTime()) || aDia(fechaDb(dia)) !== dia) {
    throw new AppError("FECHA_INVALIDA", "La fecha de inicio no es válida.");
  }
  if (dia < hoy) throw new AppError("FECHA_INVALIDA", "La campaña no puede empezar antes de hoy.");
  return dia;
}

export async function precioCampania(espacio: EspacioAviso, dias: number, pago: PagoCampania): Promise<number> {
  const precio = await precioEspacio(espacio);
  const unidades = espacio === "push" ? 1 : dias;
  return Math.round((pago === "puntos" ? precio.puntos : precio.ars) * unidades * 100) / 100;
}

export async function crearCampania(
  usuario: Usuario,
  tiendaId: string,
  input: CrearCampaniaInput,
  ahora = new Date()
): Promise<{ campania: Campania; orden?: { orden: OrdenPago; instrucciones: string; urlPago: string | null } }> {
  await exigirPermiso(usuario, tiendaId, "publicidad");
  const hoy = diaLocal(ahora);
  const espacio = input.espacio;
  if (!ESPACIOS.includes(espacio)) throw new AppError("ESPACIO_INVALIDO", "Ese espacio publicitario no existe.");
  const titulo = typeof input.titulo === "string" ? input.titulo.trim() : "";
  if (!titulo || titulo.length > 80) throw new AppError("TITULO_INVALIDO", "Poné un nombre para la campaña (hasta 80 caracteres).");
  const desde = validarDia(input.desde, hoy);
  const dias = espacio === "push" ? 1 : input.dias;
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMO) {
    throw new AppError("DIAS_INVALIDOS", `La campaña tiene que durar entre 1 y ${DIAS_MAXIMO} días.`);
  }
  if (input.pago !== "puntos" && input.pago !== "pesos") throw new AppError("PAGO_INVALIDO", "Elegí pagar con puntos o en pesos.");
  const texto = typeof input.texto === "string" && input.texto.trim() ? input.texto.trim() : null;
  if (texto && texto.length > TEXTO_MAXIMO) throw new AppError("TEXTO_INVALIDO", `El texto puede tener hasta ${TEXTO_MAXIMO} caracteres.`);
  const destino = typeof input.destino === "string" && input.destino.trim() ? input.destino.trim() : null;
  if (!destinoValido(destino)) throw new AppError("DESTINO_INVALIDO", "El destino tiene que ser una dirección https:// o una página de Almacenia.");
  const radioKm = input.radioKm === null || input.radioKm === undefined || (input.radioKm as unknown) === "" ? null : Number(input.radioKm);
  if (radioKm !== null && (!Number.isFinite(radioKm) || radioKm <= 0 || radioKm > 200)) {
    throw new AppError("SEGMENTO_INVALIDO", "El radio tiene que estar entre 0 y 200 km.");
  }

  const llevaPieza = espacio !== "pin_mapa";
  const conImagen = llevaPieza && aceptaImagen(espacio) && input.imagen && input.imagen.buffer.byteLength > 0;
  if (llevaPieza && !conImagen && !texto) {
    throw new AppError("PIEZA_REQUERIDA", espacio === "push" ? "Escribí el texto del push." : "Subí una imagen o escribí un texto.");
  }

  const costo = await precioCampania(espacio, dias, input.pago);
  const id = crypto.randomUUID();
  let pieza: Prisma.PiezaAvisoCreateWithoutCampaniaInput | null = null;
  if (llevaPieza) {
    if (conImagen) {
      const img = await procesarImagenAviso(espacio, input.imagen!.buffer, input.imagen!.contentType);
      const { url } = await subirArchivo({ tipo: "aviso", entidadId: tiendaId, contentType: img.contentType, buffer: img.buffer });
      pieza = { tipo: "imagen", imagenUrl: url, ancho: img.ancho, alto: img.alto, texto, destino };
    } else {
      pieza = { tipo: "texto", texto, destino };
    }
  }

  const orden = await prisma.$transaction(async (tx) => {
    await tx.campaniaAviso.create({
      data: {
        id,
        tiendaId,
        creadaPorId: usuario.id,
        espacio,
        titulo,
        estado: input.pago === "puntos" ? "en_moderacion" : "pendiente_pago",
        desde: fechaDb(desde),
        dias,
        pago: input.pago,
        puntosPagados: input.pago === "puntos" ? costo : null,
        segmento: radioKm !== null ? { radioKm } : undefined,
        piezas: pieza ? { create: [pieza] } : undefined,
      },
    });
    if (input.pago === "puntos") {
      await gastarPuntos(tx, usuario.id, "canje_publicidad", costo, { tiendaId, metadata: { campaniaId: id, espacio, dias } });
      return null;
    }
    const o = await crearOrdenPago(usuario.id, { concepto: "publicidad", referenciaId: id, montoArs: costo, detalle: { espacio, dias } }, tx);
    await tx.campaniaAviso.update({ where: { id }, data: { ordenPagoId: o.id } });
    return o;
  });

  const campania = await cargar(id);
  return orden ? { campania, orden: { orden, ...(await instruccionesDe(orden)) } } : { campania };
}

export async function listarCampaniasTienda(usuario: Usuario, tiendaId: string): Promise<Campania[]> {
  await exigirPermiso(usuario, tiendaId, "publicidad");
  const filas = await prisma.campaniaAviso.findMany({ where: { tiendaId }, include: INCLUDE, orderBy: { creadaEn: "desc" } });
  const metricas = await metricasDe(filas.map((f) => f.id));
  return filas.map((f) => aCampania(f, metricas.get(f.id)!));
}

async function campaniaConPermiso(usuario: Usuario, id: string) {
  const c = await prisma.campaniaAviso.findUnique({ where: { id } });
  if (!c) throw new AppError("CAMPANIA_NO_ENCONTRADA", "La campaña no existe.");
  await exigirPermiso(usuario, c.tiendaId, "publicidad");
  return c;
}

async function transicionar(id: string, desde: EstadoCampania[], data: Prisma.CampaniaAvisoUncheckedUpdateManyInput): Promise<void> {
  const { count } = await prisma.campaniaAviso.updateMany({ where: { id, estado: { in: desde } }, data });
  if (count === 0) throw new AppError("TRANSICION_INVALIDA", "La campaña no está en un estado que permita esto.");
}

export async function pausarCampania(usuario: Usuario, id: string): Promise<Campania> {
  const c = await campaniaConPermiso(usuario, id);
  if (c.espacio === "push") throw new AppError("TRANSICION_INVALIDA", "Un push no se puede pausar.");
  await transicionar(id, ["activa"], { estado: "pausada" });
  return cargar(id);
}

export async function reanudarCampania(usuario: Usuario, id: string, ahora = new Date()): Promise<Campania> {
  await campaniaConPermiso(usuario, id);
  await transicionar(id, ["pausada"], { estado: "activa" });
  await actualizarDiasCampanias(ahora);
  return cargar(id);
}

// Reintegro de puntos a quien pagó (23-puntos-pagos.md, tipo reintegro_publicidad).
async function reintegrar(c: { id: string; tiendaId: string; creadaPorId: string | null }, puntos: number, motivo: string): Promise<void> {
  const redondeado = Math.round(puntos * 10) / 10;
  if (!c.creadaPorId || redondeado <= 0) return;
  await prisma.eventoPuntos.create({
    data: { usuarioId: c.creadaPorId, tipo: "reintegro_publicidad", puntos: redondeado, tiendaId: c.tiendaId, metadata: { campaniaId: c.id, motivo } },
  });
}

export async function finalizarCampania(usuario: Usuario, id: string, ahora = new Date()): Promise<Campania> {
  const c = await campaniaConPermiso(usuario, id);
  await transicionar(id, ["pendiente_pago", "en_moderacion", "activa", "pausada"], { estado: "finalizada", finalizadaEn: ahora });
  if (c.estado === "pendiente_pago" && c.ordenPagoId) {
    await prisma.ordenPago.updateMany({ where: { id: c.ordenPagoId, estado: "pendiente" }, data: { estado: "cancelada" } });
  }
  if (c.pago === "puntos" && c.puntosPagados !== null) {
    const pagados = Number(c.puntosPagados);
    if (c.estado === "en_moderacion") {
      await reintegrar(c, pagados, "finalizada_sin_publicar");
    } else if (c.estado === "activa" || c.estado === "pausada") {
      const pct = await obtenerConfig("canje.reintegro_pct");
      await reintegrar(c, (diasNoUsados(c) * pagados * pct) / (c.dias * 100), "dias_no_usados");
    }
  }
  return cargar(id);
}

export async function moderarCampania(
  admin: Usuario,
  id: string,
  input: { aprobar: boolean; motivo?: string },
  ahora = new Date()
): Promise<Campania> {
  requireAdmin(admin);
  const c = await prisma.campaniaAviso.findUnique({ where: { id }, include: { tienda: { select: { nombre: true } } } });
  if (!c) throw new AppError("CAMPANIA_NO_ENCONTRADA", "La campaña no existe.");
  const motivo = typeof input.motivo === "string" ? input.motivo.trim() : "";
  if (!input.aprobar && !motivo) throw new AppError("MOTIVO_REQUERIDO", "Indicá el motivo del rechazo.");
  if (input.aprobar) {
    await transicionar(id, ["en_moderacion"], { estado: "activa", aprobadaEn: ahora });
    await actualizarDiasCampanias(ahora);
  } else {
    await transicionar(id, ["en_moderacion"], { estado: "rechazada", motivoRechazo: motivo, finalizadaEn: ahora });
    if (c.pago === "puntos" && c.puntosPagados !== null) await reintegrar(c, Number(c.puntosPagados), "rechazada");
  }
  if (c.creadaPorId) {
    await sinRomper(() =>
      notificar([c.creadaPorId!], {
        tipo: input.aprobar ? "campania_aprobada" : "campania_rechazada",
        titulo: input.aprobar ? `Aprobamos tu campaña «${c.titulo}»` : `Rechazamos tu campaña «${c.titulo}»`,
        cuerpo: input.aprobar
          ? `${c.tienda.nombre}: la campaña ya está publicada.`
          : `Motivo: ${motivo}.${c.pago === "puntos" ? " Te devolvimos los puntos." : ""}`,
        url: `/mi-tienda/publicidad?tienda=${c.tiendaId}`,
        tiendaId: c.tiendaId,
      })
    );
  }
  return cargar(id);
}

export async function listarCampaniasAdmin(
  admin: Usuario,
  filtros: { estado?: EstadoCampania; page?: number; pageSize?: number }
): Promise<{ data: Campania[]; page: number; pageSize: number; total: number }> {
  requireAdmin(admin);
  if (filtros.estado && !ESTADOS.includes(filtros.estado)) throw new AppError("ESTADO_INVALIDO", "Estado de campaña inválido.");
  const page = filtros.page && filtros.page > 0 ? filtros.page : 1;
  const pageSize = filtros.pageSize && filtros.pageSize > 0 ? Math.min(filtros.pageSize, PAGE_SIZE_MAXIMO) : PAGE_SIZE_DEFAULT;
  const where = filtros.estado ? { estado: filtros.estado } : {};
  const [filas, total] = await Promise.all([
    prisma.campaniaAviso.findMany({ where, include: INCLUDE, orderBy: { creadaEn: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.campaniaAviso.count({ where }),
  ]);
  const metricas = await metricasDe(filas.map((f) => f.id));
  return { data: filas.map((f) => aCampania(f, metricas.get(f.id)!)), page, pageSize, total };
}

// Condición SQL de "en curso hoy" para un espacio (después de actualizarDiasCampanias).
export function enCursoWhere(espacio: EspacioAviso, ahora: Date): Prisma.CampaniaAvisoWhereInput {
  const hoy = fechaDb(diaLocal(ahora));
  return { espacio, estado: "activa", desde: { lte: hoy }, ultimoDiaConsumido: hoy };
}

export async function tiendasDestacadas(tiendaIds: string[], ahora = new Date()): Promise<Set<string>> {
  if (tiendaIds.length === 0) return new Set();
  await actualizarDiasCampanias(ahora);
  const filas = await prisma.campaniaAviso.findMany({
    where: { ...enCursoWhere("pin_mapa", ahora), tiendaId: { in: tiendaIds } },
    select: { tiendaId: true },
  });
  return new Set(filas.map((f) => f.tiendaId));
}
