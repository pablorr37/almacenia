import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import {
  valorarCliente,
  resumenCliente,
  resumenesClientes,
  miResumenComoCliente,
} from "./valoraciones-clientes";

let contador = 0;
async function usuario(prefijo: string): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-valcli-${prefijo}-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: `${prefijo} ${contador}`,
  });
}

async function vendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda; producto: Producto }> {
  const vendedor = await usuario("vendedor");
  const tienda = await crearTienda(vendedor, { nombre: "Tienda", direccion: "D", lat: -31.53, lon: -68.52 });
  const producto = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: `P ${contador}` }, precio: 10, stock: 100 });
  return { vendedor: { ...vendedor, esVendedor: true }, tienda, producto };
}

async function vender(vendedor: Usuario, tienda: Tienda, producto: Producto, compradorId: string) {
  await crearVentaPresencial(vendedor, tienda.id, { compradorId, items: [{ productoId: producto.id, cantidad: 1 }] });
}

describe("valoraciones de clientes", () => {
  const usuarios: string[] = [];
  const catalogos: string[] = [];
  let a: { vendedor: Usuario; tienda: Tienda; producto: Producto };
  let b: { vendedor: Usuario; tienda: Tienda; producto: Producto };
  let comprador: Usuario;

  beforeEach(async () => {
    a = await vendedorConTienda();
    b = await vendedorConTienda();
    comprador = await usuario("comprador");
    usuarios.push(a.vendedor.id, b.vendedor.id, comprador.id);
    catalogos.push(a.producto.catalogoId, b.producto.catalogoId);
  });

  afterEach(async () => {
    const ids = usuarios.splice(0);
    await prisma.valoracionCliente.deleteMany({ where: { compradorId: { in: ids } } });
    await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: ids } } } } });
    await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
    await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogos.splice(0) } } });
  });

  it("VALORACION_SIN_VENTA_PREVIA si el comprador nunca compró en la tienda", async () => {
    await expect(valorarCliente(a.vendedor, comprador.id, { puntuacion: 5 })).rejects.toMatchObject<Partial<AppError>>({
      code: "VALORACION_SIN_VENTA_PREVIA",
    });
  });

  it("valora a un cliente con venta previa", async () => {
    await vender(a.vendedor, a.tienda, a.producto, comprador.id);
    const v = await valorarCliente(a.vendedor, comprador.id, { puntuacion: 4, comentario: "Puntual" });
    expect(v).toMatchObject({ tiendaId: a.tienda.id, compradorId: comprador.id, puntuacion: 4, comentario: "Puntual" });
  });

  it("volver a valorar reemplaza la valoración (una por tienda y cliente)", async () => {
    await vender(a.vendedor, a.tienda, a.producto, comprador.id);
    await valorarCliente(a.vendedor, comprador.id, { puntuacion: 2 });
    const v = await valorarCliente(a.vendedor, comprador.id, { puntuacion: 5 });
    expect(v.puntuacion).toBe(5);
    expect(await prisma.valoracionCliente.count({ where: { compradorId: comprador.id } })).toBe(1);
  });

  it("PUNTUACION_INVALIDA fuera de 1..5 o no entera", async () => {
    await vender(a.vendedor, a.tienda, a.producto, comprador.id);
    for (const puntuacion of [0, 6, 3.5]) {
      await expect(valorarCliente(a.vendedor, comprador.id, { puntuacion })).rejects.toMatchObject<Partial<AppError>>({
        code: "PUNTUACION_INVALIDA",
      });
    }
  });

  it("FORBIDDEN si el usuario no tiene tienda", async () => {
    const otro = await usuario("sin-tienda");
    usuarios.push(otro.id);
    await expect(valorarCliente(otro, comprador.id, { puntuacion: 5 })).rejects.toMatchObject<Partial<AppError>>({
      code: "FORBIDDEN",
    });
  });

  it("VALORACION_PROPIA si el vendedor intenta valorarse a sí mismo", async () => {
    await expect(valorarCliente(a.vendedor, a.vendedor.id, { puntuacion: 5 })).rejects.toMatchObject<Partial<AppError>>({
      code: "VALORACION_PROPIA",
    });
  });

  it("USUARIO_NO_ENCONTRADO si el comprador no existe", async () => {
    await expect(
      valorarCliente(a.vendedor, "00000000-0000-0000-0000-000000000000", { puntuacion: 5 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "USUARIO_NO_ENCONTRADO" });
  });

  it("resumenCliente: promedio de todas las tiendas y la valoración propia completa", async () => {
    await vender(a.vendedor, a.tienda, a.producto, comprador.id);
    await vender(b.vendedor, b.tienda, b.producto, comprador.id);
    await valorarCliente(a.vendedor, comprador.id, { puntuacion: 5, comentario: "Excelente" });
    await valorarCliente(b.vendedor, comprador.id, { puntuacion: 2, comentario: "Llegó tarde" });

    const r = await resumenCliente(a.vendedor, comprador.id);
    expect(r.promedio).toBe(3.5);
    expect(r.cantidad).toBe(2);
    expect(r.miValoracion?.comentario).toBe("Excelente");
  });

  it("resumenCliente sin valoraciones: promedio null", async () => {
    const r = await resumenCliente(a.vendedor, comprador.id);
    expect(r).toEqual({ promedio: null, cantidad: 0, miValoracion: null });
  });

  it("resumenesClientes devuelve el resumen de varios clientes a la vez", async () => {
    await vender(a.vendedor, a.tienda, a.producto, comprador.id);
    await valorarCliente(a.vendedor, comprador.id, { puntuacion: 4 });
    const r = await resumenesClientes(a.vendedor, [comprador.id, b.vendedor.id]);
    expect(r[comprador.id]).toEqual({ promedio: 4, cantidad: 1 });
    expect(r[b.vendedor.id]).toEqual({ promedio: null, cantidad: 0 });
  });

  it("miResumenComoCliente: el comprador ve solo su promedio y cantidad", async () => {
    await vender(a.vendedor, a.tienda, a.producto, comprador.id);
    await valorarCliente(a.vendedor, comprador.id, { puntuacion: 3, comentario: "privado" });
    expect(await miResumenComoCliente(comprador)).toEqual({ promedio: 3, cantidad: 1 });
  });
});
