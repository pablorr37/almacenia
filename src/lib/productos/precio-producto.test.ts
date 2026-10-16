import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { crearProducto, actualizarProducto, ocultarCostos } from "./productos";

// 20-precios-facturacion.md, "Alta y edición de productos"
describe("precio del producto = costo + ganancia + impuestos", () => {
  const creados: string[] = [];
  let dueno: Usuario;
  let emp: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    const suf = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dueno = await registrarUsuario({ email: `test-precio-d-${suf}@almacenia.test`, password: "password123", nombre: "D" });
    emp = await registrarUsuario({ email: `test-precio-e-${suf}@almacenia.test`, password: "password123", nombre: "E" });
    creados.push(dueno.id, emp.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Precio", direccion: "D", lat: -31.5, lon: -68.5 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado", permisos: ["vender", "stock"] });
  });

  afterEach(async () => {
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: creados } } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  it("monotributo: con costo y margen se calcula el precio (sin IVA discriminado)", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio A"), costo: 1000, margen: 30, stock: 5 });
    expect(p).toMatchObject({ precio: 1300, costo: 1000, margen: 30, alicuotaIva: "iva_21", impuestosInternos: 0 });
  });

  it("responsable inscripto: suma IVA e internos", async () => {
    await actualizarTienda(dueno, tienda.id, { condicionIva: "responsable_inscripto" });
    const p = await crearProducto(dueno, tienda.id, {
      nuevo: await nuevoDePrueba("Precio B"),
      costo: 1000,
      margen: 30,
      alicuotaIva: "iva_10_5",
      stock: 5,
    });
    expect(p.precio).toBe(1436.5);
    const conInternos = await actualizarProducto(dueno, p.id, { alicuotaIva: "iva_21", impuestosInternos: 8 });
    expect(conInternos.precio).toBe(1677);
  });

  it("si viene el precio, manda el precio y se recalcula el margen", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio C"), precio: 1500, costo: 1000, stock: 5 });
    expect(p).toMatchObject({ precio: 1500, margen: 50 });
    const bajo = await actualizarProducto(dueno, p.id, { precio: 900 });
    expect(bajo).toMatchObject({ precio: 900, costo: 1000, margen: -10 });
    // Cambia el costo sin precio: con margen guardado, se recalcula el precio.
    const otroCosto = await actualizarProducto(dueno, p.id, { costo: 2000 });
    expect(otroCosto.precio).toBe(1800);
  });

  it("sin precio ni costo + margen no se puede crear; validaciones", async () => {
    await expect(crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio D"), costo: 1000, stock: 1 })).rejects.toMatchObject({ code: "PRECIO_INVALIDO" });
    await expect(crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio E"), costo: -1, margen: 10, stock: 1 })).rejects.toMatchObject({ code: "COSTO_INVALIDO" });
    await expect(crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio F"), costo: 10, margen: -100, stock: 1 })).rejects.toMatchObject({ code: "MARGEN_INVALIDO" });
    await expect(crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio G"), precio: 10, alicuotaIva: "iva_99" as never, stock: 1 })).rejects.toMatchObject({ code: "ALICUOTA_INVALIDA" });
    await expect(crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio H"), precio: 10, impuestosInternos: 101, stock: 1 })).rejects.toMatchObject({ code: "INTERNOS_INVALIDOS" });
  });

  it("costo, margen e impuestos piden el permiso 'precios'", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio I"), precio: 100, stock: 5 });
    await expect(actualizarProducto(emp, p.id, { costo: 50 })).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(actualizarProducto(emp, p.id, { stock: 2 })).resolves.toMatchObject({ stock: 2 });
  });

  it("ocultarCostos deja costo y margen en null (vistas públicas)", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Precio J"), costo: 10, margen: 10, stock: 5 });
    expect(ocultarCostos(p)).toMatchObject({ precio: 11, costo: null, margen: null });
  });
});
