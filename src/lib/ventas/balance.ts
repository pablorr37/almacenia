import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { exigirPermiso } from "@/lib/equipo/equipo";
import { ZONA_HORARIA_NEGOCIO } from "@/lib/tiendas/horarios";
import type { MedioPago } from "@/lib/tiendas/tiendas";
import { obtenerConfig } from "@/lib/config/config";
import { exigirFeature, tienePermiso, type Plan } from "@/lib/planes/planes";
import type { AlicuotaIva } from "@/lib/precios/precios";

// Balance de una tienda (19-equipo-tienda.md) por nivel de plan
// (20-precios-facturacion.md): básico (free), sólido (premium) y completo (plata).

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
  nivel: Nivel;
  // Básico (todos los planes).
  masVendidos?: Array<{ productoId: string; nombre: string; cantidad: number; total: number }>;
  // Sólido (premium o más).
  resultado?: Resultado;
  porProducto?: Array<FilaRentabilidad>;
  porCategoria?: Array<FilaRentabilidad>;
  stock?: { valorCosto: number; valorVenta: number; productosSinCosto: number };
  comparativo?: {
    desde: string;
    hasta: string;
    cobrado: number;
    cantidad: number;
    gananciaBruta: number;
    variacionCobrado: number | null;
    variacionCantidad: number | null;
    variacionGanancia: number | null;
  };
  // Completo (plata).
  impuestos?: { ivaPorAlicuota: Array<{ alicuota: AlicuotaIva; neto: number; iva: number }>; internos: number };
  flujoCaja?: Array<{ fecha: string; porMedio: Partial<Record<MedioPago | "sin_medio", number>>; total: number }>;
  alertas?: {
    stockBajo: Array<AlertaProducto>;
    margenNegativo: Array<AlertaProducto>;
    sinCosto: Array<AlertaProducto>;
  };
}

export type Nivel = "basico" | "solido" | "completo";

export interface Resultado {
  ingresosNetos: number;
  costoVendido: number;
  gananciaBruta: number;
  margenBruto: number | null;
  itemsSinCosto: number;
}

export interface FilaRentabilidad {
  id: string;
  nombre: string;
  cantidad: number;
  ingresosNetos: number;
  costo: number | null;
  ganancia: number | null;
  margen: number | null;
}

interface AlertaProducto {
  id: string;
  nombre: string;
  stock: number;
  margen: number | null;
}

const redondear = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const porcentaje = (parte: number, base: number) => (base > 0 ? redondear((parte / base) * 100) : null);
const variacion = (actual: number, anterior: number) => (anterior > 0 ? redondear(((actual - anterior) / anterior) * 100) : null);

export function nivelDe(plan: Plan): Nivel {
  if (tienePermiso({ plan }, "balance_completo")) return "completo";
  if (tienePermiso({ plan }, "balance_solido")) return "solido";
  return "basico";
}

// Ítems de las ventas cobradas, con su foto fiscal (20-precios-facturacion.md). Las
// ventas anteriores a la foto cuentan el precio como neto y sin costo.
interface ItemCobrado {
  ventaId: string;
  tiendaId: string;
  creadaEn: Date;
  medioPago: MedioPago | null;
  vendidaPor: string | null;
  comprobante: string | null;
  productoId: string;
  nombre: string;
  categoria: { id: string; nombre: string } | null;
  cantidad: number;
  precioUnitario: number;
  neto: number; // unitario
  iva: number;
  internos: number;
  alicuota: AlicuotaIva;
  costo: number | null; // unitario
}

async function itemsCobrados(tiendaIds: string[], inicio: Date, fin: Date): Promise<ItemCobrado[]> {
  const items = await prisma.itemVenta.findMany({
    where: { venta: { tiendaId: { in: tiendaIds }, estado: "cobrada", creadaEn: { gte: inicio, lt: fin } } },
    include: {
      venta: {
        select: {
          id: true,
          tiendaId: true,
          creadaEn: true,
          medioPago: true,
          vendidaPor: { select: { nombre: true } },
          comprobante: { select: { tipo: true, puntoVenta: true, numero: true } },
        },
      },
      producto: { select: { nombre: true, alicuotaIva: true, categoria: { select: { id: true, nombre: true } } } },
    },
    orderBy: [{ venta: { creadaEn: "asc" } }, { id: "asc" }],
  });
  return items.map((i) => {
    const c = i.venta.comprobante;
    const precio = Number(i.precioUnitario);
    const conFoto = i.netoUnitario !== null;
    return {
      ventaId: i.venta.id,
      tiendaId: i.venta.tiendaId,
      creadaEn: i.venta.creadaEn,
      medioPago: i.venta.medioPago,
      vendidaPor: i.venta.vendidaPor?.nombre ?? null,
      comprobante: c ? `${c.tipo} ${String(c.puntoVenta).padStart(5, "0")}-${String(c.numero).padStart(8, "0")}` : null,
      productoId: i.productoId,
      nombre: i.producto.nombre,
      categoria: i.producto.categoria,
      cantidad: Number(i.cantidad),
      precioUnitario: precio,
      neto: conFoto ? Number(i.netoUnitario) : precio,
      iva: conFoto ? Number(i.ivaUnitario) : 0,
      internos: conFoto ? Number(i.internosUnitario) : 0,
      alicuota: i.alicuotaIva ?? i.producto.alicuotaIva,
      costo: i.costoUnitario === null ? null : Number(i.costoUnitario),
    };
  });
}

function resultadoDe(items: ItemCobrado[]): Resultado {
  let ingresosNetos = 0;
  let netosConCosto = 0;
  let costoVendido = 0;
  let itemsSinCosto = 0;
  for (const i of items) {
    ingresosNetos += i.neto * i.cantidad;
    if (i.costo === null) {
      itemsSinCosto += 1;
    } else {
      netosConCosto += i.neto * i.cantidad;
      costoVendido += i.costo * i.cantidad;
    }
  }
  const gananciaBruta = redondear(netosConCosto - costoVendido);
  return {
    ingresosNetos: redondear(ingresosNetos),
    costoVendido: redondear(costoVendido),
    gananciaBruta,
    margenBruto: porcentaje(gananciaBruta, netosConCosto),
    itemsSinCosto,
  };
}

function rentabilidadPor(items: ItemCobrado[], clave: (i: ItemCobrado) => { id: string; nombre: string }): FilaRentabilidad[] {
  const grupos = new Map<string, { id: string; nombre: string; cantidad: number; items: ItemCobrado[] }>();
  for (const i of items) {
    const k = clave(i);
    const g = grupos.get(k.id) ?? { ...k, cantidad: 0, items: [] };
    g.cantidad += i.cantidad;
    g.items.push(i);
    grupos.set(k.id, g);
  }
  return [...grupos.values()]
    .map((g) => {
      const r = resultadoDe(g.items);
      const tieneCosto = g.items.some((i) => i.costo !== null);
      return {
        id: g.id,
        nombre: g.nombre,
        cantidad: Math.round(g.cantidad * 1000) / 1000,
        ingresosNetos: r.ingresosNetos,
        costo: tieneCosto ? r.costoVendido : null,
        ganancia: tieneCosto ? r.gananciaBruta : null,
        margen: tieneCosto ? r.margenBruto : null,
      };
    })
    .sort((a, b) => b.ingresosNetos - a.ingresosNetos);
}

export async function balanceTienda(
  usuario: Usuario,
  tiendaId: string,
  rango: { desde?: string; hasta?: string },
  hoy = new Date()
): Promise<Balance> {
  await exigirPermiso(usuario, tiendaId, "balance");
  const { desde, hasta, inicio, fin, dias } = rangoBalance(rango, hoy);
  const tienda = await prisma.tienda.findUniqueOrThrow({ where: { id: tiendaId }, select: { plan: true, condicionIva: true } });
  const nivel = nivelDe(tienda.plan);

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

  const basico = {
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

  const items = await itemsCobrados([tiendaId], inicio, fin);
  const masVendidos = rentabilidadPor(items, (i) => ({ id: i.productoId, nombre: i.nombre }))
    .map((f) => ({
      productoId: f.id,
      nombre: f.nombre,
      cantidad: f.cantidad,
      total: redondear(items.filter((i) => i.productoId === f.id).reduce((s, i) => s + i.precioUnitario * i.cantidad, 0)),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const balance: Balance = { ...basico, nivel, masVendidos };
  if (nivel === "basico") return balance;

  // Sólido (premium).
  const resultado = resultadoDe(items);
  const productos = await prisma.producto.findMany({
    where: { tiendaId, eliminadoEn: null },
    select: { id: true, nombre: true, precio: true, costo: true, margen: true, stock: true, disponible: true },
    orderBy: { nombre: "asc" },
  });
  const anterior = rangoBalance({ desde: sumarDias(desde, -dias.length), hasta: sumarDias(desde, -1) }, hoy);
  const ventasAnteriores = await prisma.venta.aggregate({
    where: { tiendaId, estado: "cobrada", creadaEn: { gte: anterior.inicio, lt: anterior.fin } },
    _sum: { total: true },
    _count: { _all: true },
  });
  const resultadoAnterior = resultadoDe(await itemsCobrados([tiendaId], anterior.inicio, anterior.fin));
  const cobradoAnterior = redondear(Number(ventasAnteriores._sum.total ?? 0));
  Object.assign(balance, {
    resultado,
    porProducto: rentabilidadPor(items, (i) => ({ id: i.productoId, nombre: i.nombre })),
    porCategoria: rentabilidadPor(items, (i) => i.categoria ?? { id: "sin_categoria", nombre: "Sin categoría" }),
    stock: {
      valorCosto: redondear(productos.reduce((s, p) => s + (p.costo === null ? 0 : Number(p.costo) * Number(p.stock)), 0)),
      valorVenta: redondear(productos.reduce((s, p) => s + Number(p.precio) * Number(p.stock), 0)),
      productosSinCosto: productos.filter((p) => p.costo === null).length,
    },
    comparativo: {
      desde: anterior.desde,
      hasta: anterior.hasta,
      cobrado: cobradoAnterior,
      cantidad: ventasAnteriores._count._all,
      gananciaBruta: resultadoAnterior.gananciaBruta,
      variacionCobrado: variacion(basico.cobradas.total, cobradoAnterior),
      variacionCantidad: variacion(basico.cobradas.cantidad, ventasAnteriores._count._all),
      variacionGanancia: variacion(resultado.gananciaBruta, resultadoAnterior.gananciaBruta),
    },
  });
  if (nivel === "solido") return balance;

  // Completo (plata).
  const ivas = new Map<AlicuotaIva, { neto: number; iva: number }>();
  if (tienda.condicionIva === "responsable_inscripto") {
    for (const i of items) {
      const g = ivas.get(i.alicuota) ?? { neto: 0, iva: 0 };
      g.neto += i.neto * i.cantidad;
      g.iva += i.iva * i.cantidad;
      ivas.set(i.alicuota, g);
    }
  }
  const flujo = new Map<string, Partial<Record<MedioPago | "sin_medio", number>>>();
  for (const v of cobradas) {
    const dia = fechaLocal(v.creadaEn);
    const medio = v.medioPago ?? "sin_medio";
    const porMedio = flujo.get(dia) ?? {};
    porMedio[medio] = redondear((porMedio[medio] ?? 0) + Number(v.total));
    flujo.set(dia, porMedio);
  }
  const umbral = await obtenerConfig("balance.umbral_stock_bajo");
  const alerta = (p: (typeof productos)[number]): AlertaProducto => ({
    id: p.id,
    nombre: p.nombre,
    stock: Number(p.stock),
    margen: p.margen === null ? null : Number(p.margen),
  });
  Object.assign(balance, {
    impuestos: {
      ivaPorAlicuota: [...ivas.entries()]
        .map(([alicuota, g]) => ({ alicuota, neto: redondear(g.neto), iva: redondear(g.iva) }))
        .sort((a, b) => b.neto - a.neto),
      internos: redondear(items.reduce((s, i) => s + i.internos * i.cantidad, 0)),
    },
    flujoCaja: dias.map((fecha) => {
      const porMedio = flujo.get(fecha) ?? {};
      return { fecha, porMedio, total: redondear(Object.values(porMedio).reduce((s, n) => s + (n ?? 0), 0)) };
    }),
    alertas: {
      stockBajo: productos
        .filter((p) => p.disponible && Number(p.stock) <= umbral)
        .sort((a, b) => Number(a.stock) - Number(b.stock))
        .map(alerta),
      margenNegativo: productos.filter((p) => p.margen !== null && Number(p.margen) < 0).map(alerta),
      sinCosto: productos.filter((p) => p.costo === null).map(alerta),
    },
  });
  return balance;
}

// Libro de ventas (plata): una fila por ítem cobrado, para abrir en Excel en español.
const ETIQUETA_ALICUOTA_CSV: Record<AlicuotaIva, string> = { iva_21: "21%", iva_10_5: "10,5%", iva_27: "27%", iva_0: "0%", exento: "Exento" };
const numeroCsv = (n: number) => n.toFixed(2).replace(".", ",");
const textoCsv = (t: string | null) => {
  const v = t ?? "";
  return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const fechaHoraLocal = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: ZONA_HORARIA_NEGOCIO, dateStyle: "short", timeStyle: "short" }).format(d);

export async function libroVentasCsv(
  usuario: Usuario,
  tiendaId: string,
  rango: { desde?: string; hasta?: string },
  hoy = new Date()
): Promise<string> {
  await exigirPermiso(usuario, tiendaId, "balance");
  const tienda = await prisma.tienda.findUniqueOrThrow({ where: { id: tiendaId }, select: { plan: true } });
  exigirFeature(tienda, "exportar_libro_ventas");
  const { inicio, fin } = rangoBalance(rango, hoy);
  const encabezado = [
    "Fecha", "Venta", "Comprobante", "Producto", "Cantidad", "Precio unitario", "Neto", "Alícuota",
    "IVA", "Internos", "Total", "Costo", "Medio de pago", "Vendió",
  ];
  const filas = (await itemsCobrados([tiendaId], inicio, fin)).map((i) =>
    [
      fechaHoraLocal(i.creadaEn),
      i.ventaId.slice(0, 8),
      textoCsv(i.comprobante),
      textoCsv(i.nombre),
      String(i.cantidad).replace(".", ","),
      numeroCsv(i.precioUnitario),
      numeroCsv(i.neto * i.cantidad),
      ETIQUETA_ALICUOTA_CSV[i.alicuota],
      numeroCsv(i.iva * i.cantidad),
      numeroCsv(i.internos * i.cantidad),
      numeroCsv(i.precioUnitario * i.cantidad),
      i.costo === null ? "" : numeroCsv(i.costo * i.cantidad),
      i.medioPago ?? "",
      textoCsv(i.vendidaPor),
    ].join(";")
  );
  return "\uFEFF" + [encabezado.join(";"), ...filas].join("\r\n") + "\r\n";
}

// Rentabilidad de todas las tiendas propias (plata, por el plan del dueño).
export async function rentabilidadSucursales(
  usuario: Usuario,
  rango: { desde?: string; hasta?: string },
  hoy = new Date()
): Promise<Array<{ tienda: { id: string; nombre: string }; cobrado: number; cantidad: number; ingresosNetos: number; gananciaBruta: number }>> {
  const dueno = await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id }, select: { plan: true } });
  exigirFeature(dueno, "balance_completo");
  const { inicio, fin } = rangoBalance(rango, hoy);
  const tiendas = await prisma.tienda.findMany({ where: { vendedorId: usuario.id }, select: { id: true, nombre: true }, orderBy: { nombre: "asc" } });
  const items = await itemsCobrados(tiendas.map((t) => t.id), inicio, fin);
  const ventas = await prisma.venta.groupBy({
    by: ["tiendaId"],
    where: { tiendaId: { in: tiendas.map((t) => t.id) }, estado: "cobrada", creadaEn: { gte: inicio, lt: fin } },
    _sum: { total: true },
    _count: { _all: true },
  });
  return tiendas.map((t) => {
    const v = ventas.find((x) => x.tiendaId === t.id);
    const r = resultadoDe(items.filter((i) => i.tiendaId === t.id));
    return {
      tienda: t,
      cobrado: redondear(Number(v?._sum.total ?? 0)),
      cantidad: v?._count._all ?? 0,
      ingresosNetos: r.ingresosNetos,
      gananciaBruta: r.gananciaBruta,
    };
  });
}
