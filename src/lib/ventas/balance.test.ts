import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearVentaPresencial, transicionarVenta } from "./ventas";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { balanceTienda, rangoBalance } from "./balance";

// 19-equipo-tienda.md, "Balance básico"
describe("rangoBalance", () => {
  const hoy = new Date("2026-10-17T02:00:00Z"); // 16/10 23 h en San Juan (UTC-3)

  it("por defecto, los últimos 7 días contando hoy (hora local del negocio)", () => {
    expect(rangoBalance({}, hoy)).toMatchObject({ desde: "2026-10-10", hasta: "2026-10-16" });
  });

  it("los límites son inicio y fin del día local", () => {
    const r = rangoBalance({ desde: "2026-10-01", hasta: "2026-10-02" }, hoy);
    expect(r.inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(r.fin.toISOString()).toBe("2026-10-03T03:00:00.000Z");
    expect(r.dias).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("RANGO_INVALIDO: formato, desde > hasta o más de 366 días", () => {
    expect(() => rangoBalance({ desde: "16/10/2026" }, hoy)).toThrow(expect.objectContaining({ code: "RANGO_INVALIDO" }));
    expect(() => rangoBalance({ desde: "2026-10-05", hasta: "2026-10-01" }, hoy)).toThrow(expect.objectContaining({ code: "RANGO_INVALIDO" }));
    expect(() => rangoBalance({ desde: "2025-01-01", hasta: "2026-10-01" }, hoy)).toThrow(expect.objectContaining({ code: "RANGO_INVALIDO" }));
  });
});

describe("balanceTienda", () => {
  const creados: string[] = [];
  let dueno: Usuario;
  let emp: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dueno = await registrarUsuario({ email: `test-balance-d-${suf}@almacenia.test`, password: "password123", nombre: "Dueña" });
    emp = await registrarUsuario({ email: `test-balance-e-${suf}@almacenia.test`, password: "password123", nombre: "Emp" });
    creados.push(dueno.id, emp.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Balance", direccion: "D", lat: -31.5, lon: -68.5, mediosDePago: ["efectivo", "qr"] });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });
  });

  afterEach(async () => {
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.eventoPuntos.deleteMany({ where: { OR: [{ usuarioId: { in: creados } }, { tiendaId: tienda.id }] } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  it("cobradas, por cobrar, anuladas, por medio de pago, por día y por quién vendió", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Balance"), precio: 100, stock: 50 });
    const item = (cantidad: number) => [{ productoId: p.id, cantidad }];
    await crearVentaPresencial(dueno, tienda.id, { items: item(2), medioPago: "efectivo" }); // 200
    await crearVentaPresencial(emp, tienda.id, { items: item(1), medioPago: "qr" }); // 100
    await crearVentaPresencial(emp, tienda.id, { items: item(3) }); // 300 sin medio
    await crearVentaPresencial(dueno, tienda.id, { items: item(4), cobrarAhora: false }); // 400 por cobrar
    const anular = await crearVentaPresencial(dueno, tienda.id, { items: item(5), cobrarAhora: false });
    await transicionarVenta(dueno, anular.id, "anular");

    const b = await balanceTienda(dueno, tienda.id, {});
    expect(b.cobradas).toEqual({ cantidad: 3, total: 600 });
    expect(b.porCobrar).toEqual({ cantidad: 1, total: 400 });
    expect(b.anuladas).toEqual({ cantidad: 1 });
    expect(b.porMedioPago).toEqual([
      { medioPago: "sin_medio", total: 300, cantidad: 1 },
      { medioPago: "efectivo", total: 200, cantidad: 1 },
      { medioPago: "qr", total: 100, cantidad: 1 },
    ]);
    expect(b.porDia).toHaveLength(7);
    expect(b.porDia.at(-1)).toMatchObject({ fecha: b.hasta, total: 600, cantidad: 3 });
    expect(b.porDia.slice(0, 6).every((d) => d.total === 0)).toBe(true);
    expect(b.porVendedor).toEqual([
      { usuario: { id: emp.id, nombre: "Emp" }, total: 400, cantidad: 2 },
      { usuario: { id: dueno.id, nombre: "Dueña" }, total: 200, cantidad: 1 },
    ]);
  });

  it("pide el permiso 'balance'", async () => {
    await expect(balanceTienda(emp, tienda.id, {})).rejects.toMatchObject({ code: "SIN_PERMISO" });
  });
});
