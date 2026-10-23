import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { obtenerConfig } from "@/lib/config/config";
import { Prisma } from "@/generated-prisma/client";
import { actualizarDiasCampanias, enCursoWhere } from "./campanias";
import { ESPACIOS_BANNER, elegirPonderado, type EspacioAviso } from "./reglas";
import { firmarToken, verificarToken } from "./token";

// Rotador y medición del motor propio (21-publicidad.md).

export interface AvisoEntregado {
  campaniaId: string;
  espacio: EspacioAviso;
  tipo: "imagen" | "texto";
  imagenUrl: string | null;
  ancho: number | null;
  alto: number | null;
  texto: string | null;
  tienda: { id: string; nombre: string };
  proveedor: "propio";
  token: string;
}

// Punto de extensión para Google y otros proveedores (en espera, punto 7 del
// 2026-10-23): pesos por espacio. Hoy solo existe el motor propio.
export const PROVEEDORES_POR_ESPACIO: Record<string, Array<{ proveedor: "propio"; peso: number }>> = Object.fromEntries(
  ESPACIOS_BANNER.map((e) => [e, [{ proveedor: "propio" as const, peso: 1 }]])
);

const BOTS = /bot|crawler|spider|preview|headless|lighthouse/i;

function esBot(userAgent: string | null): boolean {
  return !userAgent || BOTS.test(userAgent);
}

function inicioDiaLocal(ahora: Date): Date {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(ahora);
  return new Date(`${dia}T00:00:00-03:00`);
}

export async function elegirAviso(
  input: { espacio: EspacioAviso; usuarioId: string | null; lat?: number; lon?: number },
  ahora = new Date()
): Promise<AvisoEntregado | null> {
  if (!ESPACIOS_BANNER.includes(input.espacio)) throw new AppError("ESPACIO_INVALIDO", "Ese espacio publicitario no existe.");

  let tiendasPropias: string[] = [];
  if (input.usuarioId) {
    const u = await prisma.usuario.findUnique({
      where: { id: input.usuarioId },
      select: { plan: true, tiendas: { select: { id: true } }, membresias: { select: { tiendaId: true } } },
    });
    // Premium y plata no ven avisos.
    if (u && u.plan !== "free") return null;
    if (u) tiendasPropias = [...u.tiendas.map((t) => t.id), ...u.membresias.map((m) => m.tiendaId)];
  }

  await actualizarDiasCampanias(ahora);
  let candidatas = await prisma.campaniaAviso.findMany({
    where: {
      ...enCursoWhere(input.espacio, ahora),
      tiendaId: { notIn: tiendasPropias },
      tienda: { activa: true, vendedor: { estadoCuenta: "activa" } },
      piezas: { some: {} },
    },
    include: { piezas: true, tienda: { select: { id: true, nombre: true } } },
  });

  // Segmento por radio: solo si hay ubicación.
  const conRadio = candidatas.filter((c) => typeof (c.segmento as { radioKm?: number } | null)?.radioKm === "number");
  if (conRadio.length > 0 && typeof input.lat === "number" && typeof input.lon === "number") {
    const dentro = new Set<string>();
    for (const c of conRadio) {
      const radio = (c.segmento as { radioKm: number }).radioKm;
      const filas = await prisma.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM tiendas WHERE id = ${c.tiendaId}
          AND ST_DWithin(ubicacion, ST_SetSRID(ST_MakePoint(${input.lon}, ${input.lat}), 4326)::geography, ${radio * 1000})
      `;
      if (filas.length > 0) dentro.add(c.id);
    }
    candidatas = candidatas.filter((c) => !conRadio.includes(c) || dentro.has(c.id));
  }

  // Tope de frecuencia por usuario y día.
  if (input.usuarioId && candidatas.length > 0) {
    const tope = await obtenerConfig("publicidad.frecuencia_dia");
    const vistas = await prisma.eventoAviso.groupBy({
      by: ["campaniaId"],
      where: {
        usuarioId: input.usuarioId,
        tipo: "impresion",
        creadoEn: { gte: inicioDiaLocal(ahora) },
        campaniaId: { in: candidatas.map((c) => c.id) },
      },
      _count: { _all: true },
    });
    const porCampania = new Map(vistas.map((v) => [v.campaniaId, v._count._all]));
    candidatas = candidatas.filter((c) => (porCampania.get(c.id) ?? 0) < tope);
  }

  const elegida = elegirPonderado(candidatas);
  if (!elegida) return null;
  const pieza = elegida.piezas[Math.floor(Math.random() * elegida.piezas.length)];
  return {
    campaniaId: elegida.id,
    espacio: input.espacio,
    tipo: pieza.tipo,
    imagenUrl: pieza.imagenUrl,
    ancho: pieza.ancho,
    alto: pieza.alto,
    texto: pieza.texto,
    tienda: elegida.tienda,
    proveedor: "propio",
    token: firmarToken({ c: elegida.id, p: pieza.id, e: input.espacio, u: input.usuarioId, n: randomUUID() }, ahora),
  };
}

async function registrar(tipo: "impresion" | "clic", token: string, userAgent: string | null, ahora: Date) {
  const payload = verificarToken(token, ahora);
  if (!payload) return { payload: null, registrado: false };
  if (esBot(userAgent)) return { payload, registrado: false };
  try {
    const { count } = await prisma.eventoAviso.createMany({
      data: [{ campaniaId: payload.c, piezaId: payload.p, tipo, usuarioId: payload.u, nonce: payload.n }],
      skipDuplicates: true,
    });
    return { payload, registrado: count > 0 };
  } catch (error) {
    // Campaña o usuario borrados entre la entrega y el evento.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") return { payload, registrado: false };
    throw error;
  }
}

export async function registrarImpresion(token: string, userAgent: string | null, ahora = new Date()): Promise<boolean> {
  return (await registrar("impresion", token, userAgent, ahora)).registrado;
}

// Devuelve el destino de la pieza guardada (nunca una URL del request).
export async function registrarClic(token: string, userAgent: string | null, ahora = new Date()): Promise<string> {
  const { payload } = await registrar("clic", token, userAgent, ahora);
  if (!payload) return "/";
  const pieza = await prisma.piezaAviso.findUnique({ where: { id: payload.p }, select: { destino: true, campania: { select: { tiendaId: true } } } });
  if (!pieza) return "/";
  return pieza.destino ?? `/tiendas/${pieza.campania.tiendaId}`;
}
