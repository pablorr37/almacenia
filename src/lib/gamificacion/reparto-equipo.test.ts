import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { otorgarPorVenta, repartirPuntosVenta } from "./gamificacion";

// 12-gamificacion.md: reparto de venta_realizada entre quien vendió y el propietario.
describe("repartirPuntosVenta", () => {
  it("reparte con 1 decimal y la suma da exacta", () => {
    expect(repartirPuntosVenta(1.1, 50)).toEqual({ equipo: 0.6, propietario: 0.5 });
    expect(repartirPuntosVenta(1.1, 70)).toEqual({ equipo: 0.8, propietario: 0.3 });
    expect(repartirPuntosVenta(2.4, 25)).toEqual({ equipo: 0.6, propietario: 1.8 });
    expect(repartirPuntosVenta(1.1, 0)).toEqual({ equipo: 0, propietario: 1.1 });
    expect(repartirPuntosVenta(1.1, 100)).toEqual({ equipo: 1.1, propietario: 0 });
  });
});

describe("otorgarPorVenta con equipo", () => {
  const CLAVE = "gamificacion.porcentaje_puntos_equipo";
  const creados: string[] = [];
  let dueno: Usuario;
  let emp: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  const puntosDe = async (ventaId: string) => {
    const eventos = await prisma.eventoPuntos.findMany({ where: { metadata: { path: ["ventaId"], equals: ventaId } } });
    return Object.fromEntries(eventos.map((e) => [`${e.tipo}:${e.usuarioId === dueno.id ? "dueno" : e.usuarioId === emp.id ? "emp" : "otro"}`, Number(e.puntos)]));
  };
  const vender = (quien: Usuario, extra: Record<string, unknown> = {}) =>
    crearVentaPresencial(quien, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], ...extra });

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dueno = await registrarUsuario({ email: `test-reparto-d-${suf}@almacenia.test`, password: "password123", nombre: "Dueña" });
    emp = await registrarUsuario({ email: `test-reparto-e-${suf}@almacenia.test`, password: "password123", nombre: "Emp" });
    creados.push(dueno.id, emp.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Reparto", direccion: "D", lat: -31.5, lon: -68.5 });
    producto = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Reparto"), precio: 100, stock: 50 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });
  });

  afterEach(async () => {
    await prisma.configuracionSistema.deleteMany({ where: { clave: CLAVE } });
    await prisma.eventoPuntos.deleteMany({ where: { OR: [{ usuarioId: { in: creados } }, { tiendaId: tienda.id }] } });
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  it("por defecto (sistema) 50/50 cuando vende un empleado", async () => {
    const venta = await vender(emp);
    expect(await puntosDe(venta.id)).toEqual({ "venta_realizada_equipo:emp": 0.6, "venta_realizada:dueno": 0.5 });
    const ev = await prisma.eventoPuntos.findFirst({ where: { tipo: "venta_realizada_equipo", usuarioId: emp.id } });
    expect(ev?.metadata).toMatchObject({ ventaId: venta.id, porcentajeEquipo: 50 });
  });

  it("usa el porcentaje que configura el propietario en la tienda", async () => {
    await actualizarTienda(dueno, tienda.id, { porcentajePuntosEquipo: 70 });
    const venta = await vender(emp);
    expect(await puntosDe(venta.id)).toEqual({ "venta_realizada_equipo:emp": 0.8, "venta_realizada:dueno": 0.3 });
  });

  it("una tienda sin valor propio toma el default que configura el admin", async () => {
    await prisma.configuracionSistema.create({ data: { clave: CLAVE, valor: 100 } });
    const venta = await vender(emp);
    // 100 %: un solo evento, nada para el propietario.
    expect(await puntosDe(venta.id)).toEqual({ "venta_realizada_equipo:emp": 1.1 });
  });

  it("0 %: todo al propietario, sin evento de 0 puntos", async () => {
    await actualizarTienda(dueno, tienda.id, { porcentajePuntosEquipo: 0 });
    const venta = await vender(emp);
    expect(await puntosDe(venta.id)).toEqual({ "venta_realizada:dueno": 1.1 });
  });

  it("si vende el propietario o la venta no tiene quién la registró, 100 % al propietario", async () => {
    const propia = await vender(dueno);
    expect(await puntosDe(propia.id)).toEqual({ "venta_realizada:dueno": 1.1 });

    const sinVendedor = await prisma.venta.create({
      data: {
        tiendaId: tienda.id,
        origen: "presencial", // venta vieja, anterior a vendida_por_id
        estado: "cobrada",
        total: 100,
        items: { create: [{ productoId: producto.id, cantidad: 1, precioUnitario: 100 }] },
      },
    });
    await otorgarPorVenta(sinVendedor.id);
    expect(await puntosDe(sinVendedor.id)).toEqual({ "venta_realizada:dueno": 1.1 });
  });

  it("validación del porcentaje y solo el propietario lo cambia", async () => {
    await expect(actualizarTienda(dueno, tienda.id, { porcentajePuntosEquipo: 101 })).rejects.toMatchObject({ code: "PORCENTAJE_INVALIDO" });
    await expect(actualizarTienda(dueno, tienda.id, { porcentajePuntosEquipo: 12.5 })).rejects.toMatchObject({ code: "PORCENTAJE_INVALIDO" });
    await expect(actualizarTienda(emp, tienda.id, { porcentajePuntosEquipo: 90 })).rejects.toMatchObject({ code: "NO_ES_DUENO_DE_TIENDA" });
    expect((await actualizarTienda(dueno, tienda.id, { porcentajePuntosEquipo: 30 })).porcentajePuntosEquipo).toBe(30);
    expect((await actualizarTienda(dueno, tienda.id, { porcentajePuntosEquipo: null })).porcentajePuntosEquipo).toBeNull();
  });
});
