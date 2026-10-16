import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { accesoATienda, exigirPermiso } from "@/lib/equipo/equipo";
import { desglosar, type AlicuotaIva, type CondicionIva } from "@/lib/precios/precios";
import { normalizarCuit } from "@/lib/tiendas/cuit";
import { datosFiscalesCompletos } from "@/lib/tiendas/tiendas";
import { facturadorActivo } from "./facturador";
import type { Prisma, TipoComprobante } from "@/generated-prisma/client";

// Comprobantes por venta (20-precios-facturacion.md): tipo A/B/C, numeración propia por
// tienda, punto de venta y tipo, e importes desde la foto fiscal de los ítems.

export type DocTipo = "CF" | "DNI" | "CUIT";

export interface ClienteComprobante {
  docTipo: DocTipo;
  doc?: string | null;
  nombre?: string | null;
  condicionIva?: CondicionIva | null;
}

export interface Comprobante {
  id: string;
  ventaId: string;
  tiendaId: string;
  tipo: TipoComprobante;
  puntoVenta: number;
  numero: number;
  numeroFormateado: string; // 00003-00000001
  cliente: { docTipo: DocTipo; doc: string | null; nombre: string | null; condicionIva: CondicionIva | null };
  neto: number;
  ivaPorAlicuota: Array<{ alicuota: AlicuotaIva; neto: number; iva: number }>;
  internos: number;
  total: number;
  estado: "interno" | "autorizado" | "rechazado";
  cae: string | null;
  caeVencimiento: string | null;
  emitidoEn: string;
}

export interface ComprobanteDetalle extends Comprobante {
  tienda: {
    nombre: string;
    razonSocial: string | null;
    cuit: string | null;
    condicionIva: CondicionIva;
    domicilioFiscal: string | null;
    ingresosBrutos: string | null;
    inicioActividades: string | null;
    puntoVenta: number | null;
  };
  venta: { creadaEn: string; medioPago: string | null };
  items: Array<{ nombre: string; cantidad: number; precioUnitario: number; subtotal: number; alicuotaIva: AlicuotaIva | null }>;
}

const DOC_TIPOS: readonly DocTipo[] = ["CF", "DNI", "CUIT"];
const PERMISOS_VER_VENTAS = ["vender", "cobrar", "balance"] as const;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function tipoComprobante(
  emisor: CondicionIva,
  cliente: { docTipo: DocTipo; condicionIva?: CondicionIva | null }
): TipoComprobante {
  if (emisor !== "responsable_inscripto") return "C";
  return cliente.docTipo === "CUIT" && cliente.condicionIva === "responsable_inscripto" ? "A" : "B";
}

function validarCliente(cliente: ClienteComprobante | undefined): Comprobante["cliente"] {
  if (!cliente || cliente.docTipo === "CF" || !cliente.docTipo) {
    return { docTipo: "CF", doc: null, nombre: cliente?.nombre?.trim() || null, condicionIva: null };
  }
  if (!DOC_TIPOS.includes(cliente.docTipo)) {
    throw new AppError("CLIENTE_INVALIDO", "El tipo de documento tiene que ser CUIT, DNI o consumidor final.");
  }
  let doc = String(cliente.doc ?? "").replace(/\D/g, "");
  if (cliente.docTipo === "CUIT") {
    const cuit = normalizarCuit(doc);
    if (!cuit) throw new AppError("CUIT_INVALIDO", "El CUIT del cliente no es válido.");
    doc = cuit;
  } else if (!/^\d{7,8}$/.test(doc)) {
    throw new AppError("CLIENTE_INVALIDO", "El DNI del cliente tiene que tener 7 u 8 números.");
  }
  return { docTipo: cliente.docTipo, doc, nombre: cliente.nombre?.trim() || null, condicionIva: cliente.condicionIva ?? null };
}

type FilaComprobante = Prisma.ComprobanteGetPayload<object>;

function aComprobante(c: FilaComprobante): Comprobante {
  return {
    id: c.id,
    ventaId: c.ventaId,
    tiendaId: c.tiendaId,
    tipo: c.tipo,
    puntoVenta: c.puntoVenta,
    numero: c.numero,
    numeroFormateado: `${String(c.puntoVenta).padStart(5, "0")}-${String(c.numero).padStart(8, "0")}`,
    cliente: {
      docTipo: c.clienteDocTipo as DocTipo,
      doc: c.clienteDoc,
      nombre: c.clienteNombre,
      condicionIva: c.clienteCondicion,
    },
    neto: Number(c.neto),
    ivaPorAlicuota: c.ivaPorAlicuota as Comprobante["ivaPorAlicuota"],
    internos: Number(c.internos),
    total: Number(c.total),
    estado: c.estado,
    cae: c.cae,
    caeVencimiento: c.caeVencimiento ? c.caeVencimiento.toISOString().slice(0, 10) : null,
    emitidoEn: c.emitidoEn.toISOString(),
  };
}

export async function emitirComprobante(usuario: Usuario, ventaId: string, cliente?: ClienteComprobante): Promise<Comprobante> {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: {
      tienda: true,
      comprobante: { select: { id: true } },
      items: { include: { producto: { select: { alicuotaIva: true, impuestosInternos: true } } } },
    },
  });
  if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe.");
  await exigirPermiso(usuario, venta.tiendaId, ["cobrar", "vender"]);
  const { tienda } = venta;
  if (!datosFiscalesCompletos(tienda)) {
    throw new AppError(
      "DATOS_FISCALES_INCOMPLETOS",
      "Completá los datos fiscales de la tienda (razón social, CUIT, domicilio fiscal y punto de venta)."
    );
  }
  if (venta.estado !== "cobrada") throw new AppError("VENTA_NO_COBRADA", "Solo se emite comprobante de una venta cobrada.");
  if (venta.comprobante) throw new AppError("COMPROBANTE_YA_EMITIDO", "Esta venta ya tiene comprobante.");

  const datosCliente = validarCliente(cliente);
  const tipo = tipoComprobante(tienda.condicionIva, datosCliente);

  // Importes desde la foto fiscal; las ventas viejas (sin foto) se desglosan con los
  // datos actuales del producto.
  const porAlicuota = new Map<AlicuotaIva, { neto: number; iva: number }>();
  let internos = 0;
  for (const item of venta.items) {
    const cantidad = Number(item.cantidad);
    const foto =
      item.netoUnitario !== null && item.alicuotaIva !== null
        ? { neto: Number(item.netoUnitario), iva: Number(item.ivaUnitario), internos: Number(item.internosUnitario), alicuota: item.alicuotaIva }
        : {
            ...desglosar(Number(item.precioUnitario), {
              condicion: tienda.condicionIva,
              alicuota: item.producto.alicuotaIva,
              internos: Number(item.producto.impuestosInternos),
            }),
            alicuota: item.producto.alicuotaIva,
          };
    const g = porAlicuota.get(foto.alicuota) ?? { neto: 0, iva: 0 };
    g.neto += foto.neto * cantidad;
    g.iva += foto.iva * cantidad;
    porAlicuota.set(foto.alicuota, g);
    internos += foto.internos * cantidad;
  }
  const total = Number(venta.total);
  internos = r2(internos);
  // En la C el IVA no se discrimina.
  const ivaPorAlicuota =
    tipo === "C" ? [] : [...porAlicuota.entries()].map(([alicuota, g]) => ({ alicuota, neto: r2(g.neto), iva: r2(g.iva) }));
  const neto = r2(total - ivaPorAlicuota.reduce((s, a) => s + a.iva, 0) - internos);

  const puntoVenta = tienda.puntoVenta!;
  const autorizacion = await facturadorActivo().autorizar({ tipo, puntoVenta, numero: 0, total });

  const creado = await prisma.$transaction(async (tx) => {
    // Numeración atómica por (tienda, punto de venta, tipo).
    const [{ ultimo }] = await tx.$queryRaw<Array<{ ultimo: number }>>`
      INSERT INTO numeracion_comprobantes (tienda_id, punto_venta, tipo, ultimo)
      VALUES (${tienda.id}, ${puntoVenta}, ${tipo}::tipo_comprobante, 1)
      ON CONFLICT (tienda_id, punto_venta, tipo) DO UPDATE SET ultimo = numeracion_comprobantes.ultimo + 1
      RETURNING ultimo
    `;
    return tx.comprobante.create({
      data: {
        ventaId,
        tiendaId: tienda.id,
        tipo,
        puntoVenta,
        numero: ultimo,
        clienteDocTipo: datosCliente.docTipo,
        clienteDoc: datosCliente.doc,
        clienteNombre: datosCliente.nombre,
        clienteCondicion: datosCliente.condicionIva,
        neto,
        ivaPorAlicuota,
        internos,
        total,
        estado: autorizacion.estado,
        cae: autorizacion.cae ?? null,
        caeVencimiento: autorizacion.caeVencimiento ? new Date(autorizacion.caeVencimiento) : null,
      },
    });
  });
  return aComprobante(creado);
}

export async function obtenerComprobante(usuario: Usuario, ventaId: string): Promise<ComprobanteDetalle> {
  const venta = await prisma.venta.findUnique({
    where: { id: ventaId },
    include: {
      tienda: true,
      comprobante: true,
      items: { include: { producto: { select: { nombre: true } } } },
    },
  });
  if (!venta) throw new AppError("VENTA_NO_ENCONTRADA", "La venta no existe.");
  const acceso = await accesoATienda(usuario.id, venta.tiendaId);
  const delEquipo = !!acceso && PERMISOS_VER_VENTAS.some((p) => acceso.permisos.includes(p));
  if (!delEquipo && venta.compradorId !== usuario.id) {
    throw new AppError("NO_AUTORIZADO_VENTA", "No tenés acceso a esta venta.");
  }
  if (!venta.comprobante) throw new AppError("COMPROBANTE_NO_ENCONTRADO", "Esta venta no tiene comprobante.");
  const t = venta.tienda;
  return {
    ...aComprobante(venta.comprobante),
    tienda: {
      nombre: t.nombre,
      razonSocial: t.razonSocial,
      cuit: t.cuit,
      condicionIva: t.condicionIva,
      domicilioFiscal: t.domicilioFiscal,
      ingresosBrutos: t.ingresosBrutos,
      inicioActividades: t.inicioActividades ? t.inicioActividades.toISOString().slice(0, 10) : null,
      puntoVenta: t.puntoVenta,
    },
    venta: { creadaEn: venta.creadaEn.toISOString(), medioPago: venta.medioPago },
    items: venta.items.map((i) => ({
      nombre: i.producto.nombre,
      cantidad: Number(i.cantidad),
      precioUnitario: Number(i.precioUnitario),
      subtotal: r2(Number(i.cantidad) * Number(i.precioUnitario)),
      alicuotaIva: i.alicuotaIva,
    })),
  };
}
