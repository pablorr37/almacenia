import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { exigirPermiso } from "@/lib/equipo/equipo";
import { ZONA_HORARIA_NEGOCIO } from "@/lib/tiendas/horarios";
import type { MedioPago } from "@/lib/tiendas/tiendas";

// Balance básico de una tienda (19-equipo-tienda.md). La ronda 3 suma costo,
// ganancia e impuestos.

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_POR_DEFECTO = 7;
const DIAS_MAXIMO = 366;
const DIA_MS = 24 * 3600_000;
// Argentina no tiene horario de verano: el día local empieza a las 03:00 UTC.
const OFFSET_NEGOCIO = "-03:00";

const fechaLocal = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA_NEGOCIO }).format(d);
const inicioDelDia = (fecha: string) => new Date(`${fecha}T00:00:00${OFFSET_NEGOCIO}`);
const sumarDias = (fecha: string, dias: number) => fechaLocal(new Date(inicioDelDia(fecha).getTime() + dias * DIA_MS + 12 * 3600_000));

function rangoInvalido(): AppError {
  return new AppError("RANGO_INVALIDO", `Revisá las fechas: formato AAAA-MM-DD, desde antes que hasta y hasta ${DIAS_MAXIMO} días.`);
}

export function rangoBalance(
  rango: { desde?: string; hasta?: string },
  hoy = new Date()
): { desde: string; hasta: string; inicio: Date; fin: Date; dias: string[] } {
  const hasta = rango.hasta ?? fechaLocal(hoy);
  const desde = rango.desde ?? sumarDias(hasta, -(DIAS_POR_DEFECTO - 1));
  if (!FECHA_RE.test(desde) || !FECHA_RE.test(hasta)) throw rangoInvalido();
  const inicio = inicioDelDia(desde);
  const fin = new Date(inicioDelDia(hasta).getTime() + DIA_MS);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime()) || inicio >= fin) throw rangoInvalido();
  const cantidad = Math.round((fin.getTime() - inicio.getTime()) / DIA_MS);
  if (cantidad > DIAS_MAXIMO) throw rangoInvalido();
  const dias = Array.from({ length: cantidad }, (_, i) => sumarDias(desde, i));
  return { desde, hasta, inicio, fin, dias };
}

export interface Balance {
  desde: string;
  hasta: string;
  cobradas: { cantidad: number; total: number };
  porCobrar: { cantidad: number; total: number };
  anuladas: { cantidad: number };
  porMedioPago: Array<{ medioPago: MedioPago | "sin_medio"; total: number; cantidad: number }>;
  porDia: Array<{ fecha: string; total: number; cantidad: number }>;
  porVendedor: Array<{ usuario: { id: string; nombre: string } | null; total: number; cantidad: number }>;
}

const redondear = (n: number) => Math.round(n * 100) / 100;

export async function balanceTienda(
  usuario: Usuario,
  tiendaId: string,
  rango: { desde?: string; hasta?: string },
  hoy = new Date()
): Promise<Balance> {
  await exigirPermiso(usuario, tiendaId, "balance");
  const { desde, hasta, inicio, fin, dias } = rangoBalance(rango, hoy);

  const ventas = await prisma.venta.findMany({
    where: { tiendaId, creadaEn: { gte: inicio, lt: fin } },
    select: { total: true, estado: true, medioPago: true, creadaEn: true, vendidaPor: { select: { id: true, nombre: true } } },
  });

  const porCobrar = ventas.filter((v) => v.estado === "por_cobrar");
  const cobradas = ventas.filter((v) => v.estado === "cobrada");
  const suma = (lista: typeof ventas) => redondear(lista.reduce((s, v) => s + Number(v.total), 0));

  const agrupar = <K>(clave: (v: (typeof ventas)[number]) => K, id: (k: K) => string) => {
    const grupos = new Map<string, { clave: K; total: number; cantidad: number }>();
    for (const v of cobradas) {
      const k = clave(v);
      const g = grupos.get(id(k)) ?? { clave: k, total: 0, cantidad: 0 };
      g.total += Number(v.total);
      g.cantidad += 1;
      grupos.set(id(k), g);
    }
    return [...grupos.values()].map((g) => ({ ...g, total: redondear(g.total) })).sort((a, b) => b.total - a.total);
  };

  const porDiaMap = new Map(agrupar((v) => fechaLocal(v.creadaEn), (k) => k).map((g) => [g.clave, g]));

  return {
    desde,
    hasta,
    cobradas: { cantidad: cobradas.length, total: suma(cobradas) },
    porCobrar: { cantidad: porCobrar.length, total: suma(porCobrar) },
    anuladas: { cantidad: ventas.filter((v) => v.estado === "anulada").length },
    porMedioPago: agrupar((v) => v.medioPago ?? ("sin_medio" as const), (k) => k).map((g) => ({
      medioPago: g.clave,
      total: g.total,
      cantidad: g.cantidad,
    })),
    porDia: dias.map((fecha) => ({ fecha, total: porDiaMap.get(fecha)?.total ?? 0, cantidad: porDiaMap.get(fecha)?.cantidad ?? 0 })),
    porVendedor: agrupar((v) => v.vendidaPor, (k) => k?.id ?? "").map((g) => ({
      usuario: g.clave,
      total: g.total,
      cantidad: g.cantidad,
    })),
  };
}
