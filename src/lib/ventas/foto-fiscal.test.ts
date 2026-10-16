import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, actualizarTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, actualizarProducto } from "@/lib/productos/productos";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { crearVentaPresencial } from "./ventas";

// 20-precios-facturacion.md, "Foto fiscal de la venta"
describe("foto fiscal de cada ítem vendido", () => {
  let dueno: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    dueno = await registrarUsuario({ email: `test-foto-fiscal-${Date.now()}@almacenia.test`, password: "password123", nombre: "D" });
    tienda = await crearTienda(dueno, { nombre: "Almacén Foto", direccion: "D", lat: -31.5, lon: -68.5 });
  });

  afterEach(async () => {
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: dueno.id } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: dueno.id } });
  });

  const item = async (ventaId: string) => {
    const i = await prisma.itemVenta.findFirstOrThrow({ where: { ventaId } });
    return {
      costoUnitario: i.costoUnitario === null ? null : Number(i.costoUnitario),
      alicuotaIva: i.alicuotaIva,
      netoUnitario: Number(i.netoUnitario),
      ivaUnitario: Number(i.ivaUnitario),
      internosUnitario: Number(i.internosUnitario),
    };
  };

  it("responsable inscripto: guarda costo, alícuota y desglose del precio", async () => {
    await actualizarTienda(dueno, tienda.id, { condicionIva: "responsable_inscripto" });
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Foto RI"), costo: 1000, margen: 30, stock: 5 });
    const venta = await crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: p.id, cantidad: 2 }] });
    expect(await item(venta.id)).toEqual({ costoUnitario: 1000, alicuotaIva: "iva_21", netoUnitario: 1300, ivaUnitario: 273, internosUnitario: 0 });
  });

  it("monotributo: IVA 0; el costo vendido no cambia aunque después cambie el del producto", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Foto Mono"), costo: 1000, margen: 30, stock: 5 });
    const venta = await crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: p.id, cantidad: 1 }] });
    await actualizarProducto(dueno, p.id, { costo: 5000 });
    expect(await item(venta.id)).toEqual({ costoUnitario: 1000, alicuotaIva: "iva_21", netoUnitario: 1300, ivaUnitario: 0, internosUnitario: 0 });
  });

  it("sin costo cargado, el costo queda en null", async () => {
    const p = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Foto Sin"), precio: 100, stock: 5 });
    const venta = await crearVentaPresencial(dueno, tienda.id, { items: [{ productoId: p.id, cantidad: 1 }] });
    expect((await item(venta.id)).costoUnitario).toBeNull();
  });
});
