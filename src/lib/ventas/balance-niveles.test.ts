import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, actualizarProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "./ventas";
import { emitirComprobante } from "@/lib/facturacion/comprobantes";
import { categoriaDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { balanceTienda, libroVentasCsv, rentabilidadSucursales } from "./balance";

// 20-precios-facturacion.md, "Balance por plan"
describe("balance por nivel de plan", () => {
  const creados: string[] = [];
  let dueno: Usuario;
  let tienda: Tienda;
  let yerba: Producto;
  let fideos: Producto;
  let sinCosto: Producto;

  const plan = (p: "free" | "premium" | "plata") =>
    Promise.all([
      prisma.usuario.update({ where: { id: dueno.id }, data: { plan: p } }),
      prisma.tienda.updateMany({ where: { vendedorId: dueno.id }, data: { plan: p } }),
    ]);

  beforeEach(async () => {
    dueno = await registrarUsuario({ email: `test-bal-niv-${Date.now()}@almacenia.test`, password: "password123", nombre: "Dueña" });
    creados.push(dueno.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Niveles", direccion: "D", lat: -31.5, lon: -68.5, mediosDePago: ["efectivo", "qr"] });
    await actualizarTienda(dueno, tienda.id, {
      condicionIva: "responsable_inscripto",
      razonSocial: "Niveles SRL",
      cuit: "20123456786",
      domicilioFiscal: "Mitre 1",
      puntoVenta: 1,
    });
    const cat = await categoriaDePrueba("Almacén niveles");
    // RI: yerba costo 1000 + 30 % + IVA 21 % = 1573; fideos costo 500 + 20 % + IVA 10,5 % = 663.
    yerba = await crearProducto(dueno, tienda.id, { nuevo: { categoriaId: cat, variante: "Yerba niveles" }, costo: 1000, margen: 30, stock: 20 });
    fideos = await crearProducto(dueno, tienda.id, { nuevo: { categoriaId: cat, variante: "Fideos niveles" }, costo: 500, margen: 20, alicuotaIva: "iva_10_5", stock: 2 });
    sinCosto = await crearProducto(dueno, tienda.id, { nuevo: { categoriaId: cat, variante: "Sin costo niveles" }, precio: 100, stock: 10 });
    await crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: yerba.id, cantidad: 2 }, { productoId: fideos.id, cantidad: 1 }], medioPago: "efectivo" });
    await crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: sinCosto.id, cantidad: 3 }], medioPago: "qr" });
  });

  afterEach(async () => {
    const tiendas = (await prisma.tienda.findMany({ where: { vendedorId: { in: creados } }, select: { id: true } })).map((t) => t.id);
    await prisma.comprobante.deleteMany({ where: { tiendaId: { in: tiendas } } });
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: { in: tiendas } } } });
    await prisma.venta.deleteMany({ where: { tiendaId: { in: tiendas } } });
    await prisma.producto.deleteMany({ where: { tiendaId: { in: tiendas } } });
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: creados } } });
    await prisma.configuracionSistema.deleteMany({ where: { clave: "balance.umbral_stock_bajo" } });
    await prisma.tienda.deleteMany({ where: { id: { in: tiendas } } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  it("free: básico + más vendidos; sin secciones de otros niveles", async () => {
    const b = await balanceTienda(dueno, tienda.id, {});
    expect(b.nivel).toBe("basico");
    expect(b.cobradas).toEqual({ cantidad: 2, total: 3146 + 663 + 300 });
    expect(b.masVendidos![0]).toMatchObject({ productoId: yerba.id, cantidad: 2, total: 3146 });
    expect(b.masVendidos!.map((m) => m.productoId)).toEqual([yerba.id, fideos.id, sinCosto.id]);
    expect(b.resultado).toBeUndefined();
    expect(b.impuestos).toBeUndefined();
  });

  it("premium: resultado, por producto y categoría, stock y comparativo", async () => {
    await plan("premium");
    const b = await balanceTienda(dueno, tienda.id, {});
    expect(b.nivel).toBe("solido");
    // Netos (RI): yerba 1300×2, fideos 600×1, sin costo (100/1,21)×3 = 247,93. Costos: 2000 + 500.
    // Ganancia y margen solo sobre los ítems con costo: 3200 − 2500 = 700 → 21,88 %.
    expect(b.resultado).toEqual({ ingresosNetos: 3447.93, costoVendido: 2500, gananciaBruta: 700, margenBruto: 21.88, itemsSinCosto: 1 });
    expect(b.porProducto!.find((p) => p.id === yerba.id)).toMatchObject({ cantidad: 2, ingresosNetos: 2600, costo: 2000, ganancia: 600, margen: 23.08 });
    expect(b.porProducto!.find((p) => p.id === sinCosto.id)).toMatchObject({ costo: null, ganancia: null });
    expect(b.porCategoria).toHaveLength(1);
    expect(b.porCategoria![0]).toMatchObject({ nombre: "Almacén niveles", ingresosNetos: 3447.93 });
    // Stock: yerba 18 × 1000 + fideos 1 × 500; a precio: 18×1573 + 1×663 + 7×100.
    expect(b.stock).toEqual({ valorCosto: 18500, valorVenta: 28314 + 663 + 700, productosSinCosto: 1 });
    expect(b.comparativo).toMatchObject({ cobrado: 0, cantidad: 0, variacionCobrado: null });
    expect(b.impuestos).toBeUndefined();
  });

  it("plata: IVA débito por alícuota, flujo de caja, alertas configurables", async () => {
    await plan("plata");
    await actualizarProducto(dueno, sinCosto.id, { precio: 100 });
    await actualizarProducto(dueno, fideos.id, { precio: 400 }); // por debajo del costo con IVA → margen negativo
    const b = await balanceTienda(dueno, tienda.id, {});
    expect(b.nivel).toBe("completo");
    // IVA 21 %: yerba (neto 2600, IVA 546) + sin costo (neto 247,93, IVA 52,07); 10,5 %: fideos.
    expect(b.impuestos!.ivaPorAlicuota).toEqual([
      { alicuota: "iva_21", neto: 2847.93, iva: 598.07 },
      { alicuota: "iva_10_5", neto: 600, iva: 63 },
    ]);
    expect(b.impuestos!.internos).toBe(0);
    expect(b.flujoCaja!.at(-1)).toMatchObject({ porMedio: { efectivo: 3809, qr: 300 }, total: 4109 });
    expect(b.alertas!.stockBajo.map((p) => p.id)).toEqual([fideos.id]);
    expect(b.alertas!.margenNegativo.map((p) => p.id)).toEqual([fideos.id]);
    expect(b.alertas!.sinCosto.map((p) => p.id)).toEqual([sinCosto.id]);
    await prisma.configuracionSistema.create({ data: { clave: "balance.umbral_stock_bajo", valor: 10 } });
    expect((await balanceTienda(dueno, tienda.id, {})).alertas!.stockBajo.map((p) => p.id).sort()).toEqual([fideos.id, sinCosto.id].sort());
  });

  it("libro de ventas CSV (plata) y rentabilidad por sucursal (plata)", async () => {
    await expect(libroVentasCsv(dueno, tienda.id, {})).rejects.toMatchObject({ code: "PLAN_INSUFICIENTE" });
    await expect(rentabilidadSucursales(dueno, {})).rejects.toMatchObject({ code: "PLAN_INSUFICIENTE" });
    await plan("plata");
    const venta = await crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: yerba.id, cantidad: 1 }], medioPago: "efectivo" });
    await emitirComprobante(dueno, venta.id);
    const csv = await libroVentasCsv(dueno, tienda.id, {});
    const lineas = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lineas[0]).toBe("Fecha;Venta;Comprobante;Producto;Cantidad;Precio unitario;Neto;Alícuota;IVA;Internos;Total;Costo;Medio de pago;Vendió");
    expect(lineas).toHaveLength(1 + 4);
    expect(lineas.some((l) => l.includes("B 00001-00000001") && l.includes("1573,00"))).toBe(true);

    const sucursal = await crearTienda(dueno, { nombre: "Sucursal Niveles", direccion: "D", lat: -31.5, lon: -68.5 });
    const r = await rentabilidadSucursales(dueno, {});
    expect(r.map((x) => x.tienda.id).sort()).toEqual([tienda.id, sucursal.id].sort());
    expect(r.find((x) => x.tienda.id === tienda.id)).toMatchObject({ cantidad: 3, gananciaBruta: 1000 });
    expect(r.find((x) => x.tienda.id === sucursal.id)).toMatchObject({ cobrado: 0, cantidad: 0 });
  });
});
