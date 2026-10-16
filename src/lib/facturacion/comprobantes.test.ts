import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { tipoComprobante, emitirComprobante, obtenerComprobante } from "./comprobantes";
import { SinFacturacion } from "./facturador";

// 20-precios-facturacion.md, "Comprobantes"
describe("tipoComprobante", () => {
  it("monotributo/exento → C; RI → A con cliente RI con CUIT, si no B", () => {
    expect(tipoComprobante("monotributo", { docTipo: "CF" })).toBe("C");
    expect(tipoComprobante("exento", { docTipo: "CUIT", condicionIva: "responsable_inscripto" })).toBe("C");
    expect(tipoComprobante("responsable_inscripto", { docTipo: "CF" })).toBe("B");
    expect(tipoComprobante("responsable_inscripto", { docTipo: "DNI" })).toBe("B");
    expect(tipoComprobante("responsable_inscripto", { docTipo: "CUIT", condicionIva: "monotributo" })).toBe("B");
    expect(tipoComprobante("responsable_inscripto", { docTipo: "CUIT", condicionIva: "responsable_inscripto" })).toBe("A");
  });
});

describe("SinFacturacion", () => {
  it("no autoriza: el comprobante queda interno", async () => {
    expect(await new SinFacturacion().autorizar()).toEqual({ estado: "interno" });
  });
});

describe("emitirComprobante y obtenerComprobante", () => {
  const creados: string[] = [];
  let dueno: Usuario;
  let emp: Usuario;
  let comprador: Usuario;
  let extrano: Usuario;
  let tienda: Tienda;
  let producto: Producto;
  const DATOS = { razonSocial: "Almacén SRL", cuit: "20-12345678-6", domicilioFiscal: "Mitre 100", puntoVenta: 3 };

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const nuevo = (n: string) => registrarUsuario({ email: `test-comp-${n}-${suf}@almacenia.test`, password: "password123", nombre: n });
    dueno = await nuevo("Dueño");
    emp = await nuevo("Emp");
    comprador = await nuevo("Comprador");
    extrano = await nuevo("Extraño");
    creados.push(dueno.id, emp.id, comprador.id, extrano.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Comprobantes", direccion: "D", lat: -31.5, lon: -68.5 });
    producto = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Comprobante"), costo: 1000, margen: 30, stock: 50 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });
  });

  afterEach(async () => {
    await prisma.comprobante.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.eventoPuntos.deleteMany({ where: { OR: [{ usuarioId: { in: creados } }, { tiendaId: tienda.id }] } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  const vender = (extra: Record<string, unknown> = {}) =>
    crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: producto.id, cantidad: 2 }], ...extra });

  it("exige datos fiscales completos y venta cobrada", async () => {
    const venta = await vender();
    await expect(emitirComprobante(dueno, venta.id)).rejects.toMatchObject({ code: "DATOS_FISCALES_INCOMPLETOS" });
    await actualizarTienda(dueno, tienda.id, DATOS);
    const porCobrar = await vender({ cobrarAhora: false });
    await expect(emitirComprobante(dueno, porCobrar.id)).rejects.toMatchObject({ code: "VENTA_NO_COBRADA" });
  });

  it("monotributo: factura C correlativa, sin IVA; una sola por venta", async () => {
    await actualizarTienda(dueno, tienda.id, DATOS);
    const v1 = await vender();
    const c1 = await emitirComprobante(emp, v1.id);
    expect(c1).toMatchObject({
      tipo: "C",
      puntoVenta: 3,
      numero: 1,
      numeroFormateado: "00003-00000001",
      cliente: { docTipo: "CF", doc: null, nombre: null },
      neto: 2600,
      ivaPorAlicuota: [],
      internos: 0,
      total: 2600,
      estado: "interno",
      cae: null,
    });
    const c2 = await emitirComprobante(dueno, (await vender()).id);
    expect(c2.numero).toBe(2);
    await expect(emitirComprobante(dueno, v1.id)).rejects.toMatchObject({ code: "COMPROBANTE_YA_EMITIDO" });
  });

  it("responsable inscripto: B a consumidor final con IVA discriminado; A a un RI (numeración propia)", async () => {
    await actualizarTienda(dueno, tienda.id, { ...DATOS, condicionIva: "responsable_inscripto" });
    // El producto se creó como monotributo (precio 1300): ahora se desglosa con IVA 21 %.
    const b = await emitirComprobante(dueno, (await vender()).id);
    expect(b.tipo).toBe("B");
    expect(b.ivaPorAlicuota).toEqual([{ alicuota: "iva_21", neto: 2148.76, iva: 451.24 }]);
    expect(b.neto + b.ivaPorAlicuota[0].iva + b.internos).toBeCloseTo(2600, 2);

    const a = await emitirComprobante(dueno, (await vender()).id, {
      docTipo: "CUIT",
      doc: "20-12345678-6",
      nombre: "Cliente SA",
      condicionIva: "responsable_inscripto",
    });
    expect(a).toMatchObject({ tipo: "A", numero: 1, cliente: { docTipo: "CUIT", doc: "20123456786", nombre: "Cliente SA" } });
    await expect(
      emitirComprobante(dueno, (await vender()).id, { docTipo: "CUIT", doc: "123", condicionIva: "responsable_inscripto" })
    ).rejects.toMatchObject({ code: "CUIT_INVALIDO" });
  });

  it("permisos: el comprador y el equipo lo ven; un extraño no; sin comprobante → 404", async () => {
    await actualizarTienda(dueno, tienda.id, DATOS);
    const venta = await vender({ compradorId: comprador.id });
    await expect(obtenerComprobante(dueno, venta.id)).rejects.toMatchObject({ code: "COMPROBANTE_NO_ENCONTRADO" });
    await expect(emitirComprobante(extrano, venta.id)).rejects.toMatchObject({ code: "NO_ES_DUENO_DE_TIENDA" });
    await emitirComprobante(dueno, venta.id);
    const detalle = await obtenerComprobante(comprador, venta.id);
    expect(detalle).toMatchObject({
      tienda: { razonSocial: "Almacén SRL", cuit: "20123456786", condicionIva: "monotributo", puntoVenta: 3 },
      items: [{ nombre: producto.nombre, cantidad: 2, precioUnitario: 1300, subtotal: 2600 }],
    });
    await expect(obtenerComprobante(emp, venta.id)).resolves.toBeTruthy();
    await expect(obtenerComprobante(extrano, venta.id)).rejects.toMatchObject({ code: "NO_AUTORIZADO_VENTA" });
  });
});
