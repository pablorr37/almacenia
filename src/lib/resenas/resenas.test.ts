import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { crearResena, listarResenas, ratingPromedioProducto } from "./resenas";

let contador = 0;
async function armarEscenario(): Promise<{
  vendedor: Usuario;
  comprador: Usuario;
  tienda: Tienda;
  producto: Producto;
}> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-resenas-v-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor",
  });
  const comprador = await registrarUsuario({
    email: `test-resenas-c-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Comprador",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  const producto = await crearProducto(vendedor, tienda.id, {
    nuevo: { nombre: `Producto ${contador}` },
    precio: 100,
    stock: 10,
  });
  return { vendedor, comprador, tienda, producto };
}

async function limpiar(usuarioIds: string[], catalogoIds: string[]) {
  await prisma.resena.deleteMany({ where: { compradorId: { in: usuarioIds } } });
  await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogoIds } } });
}

describe("crearResena", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, comprador, tienda, producto } = await armarEscenario());
  });

  afterEach(() => limpiar([vendedor.id, comprador.id], [producto.catalogoId]));

  it("lanza RESENA_SIN_COMPRA_PREVIA si el comprador nunca compró ahí", async () => {
    await expect(
      crearResena(comprador, { tiendaId: tienda.id, puntuacion: 5 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "RESENA_SIN_COMPRA_PREVIA" });
  });

  it("permite reseñar la tienda tras una compra", async () => {
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const resena = await crearResena(comprador, { tiendaId: tienda.id, puntuacion: 4, comentario: "Bien" });
    expect(resena.puntuacion).toBe(4);
    expect(resena.productoId).toBeNull();
  });

  it("permite reseñar un producto puntual tras comprarlo", async () => {
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });

    const resena = await crearResena(comprador, {
      tiendaId: tienda.id,
      productoId: producto.id,
      puntuacion: 5,
    });
    expect(resena.productoId).toBe(producto.id);
  });

  it("lanza RESENA_DUPLICADA en la segunda reseña del mismo producto", async () => {
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
    await crearResena(comprador, { tiendaId: tienda.id, productoId: producto.id, puntuacion: 5 });

    await expect(
      crearResena(comprador, { tiendaId: tienda.id, productoId: producto.id, puntuacion: 3 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "RESENA_DUPLICADA" });
  });

  it("lanza PUNTUACION_INVALIDA fuera de 1-5", async () => {
    await expect(
      crearResena(comprador, { tiendaId: tienda.id, puntuacion: 6 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PUNTUACION_INVALIDA" });
  });
});

describe("ratingPromedioProducto", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, comprador, tienda, producto } = await armarEscenario());
  });

  afterEach(() => limpiar([vendedor.id, comprador.id], [producto.catalogoId]));

  it("devuelve null sin reseñas", async () => {
    expect(await ratingPromedioProducto(producto.id)).toBeNull();
  });

  it("promedia las puntuaciones", async () => {
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
    await crearResena(comprador, { tiendaId: tienda.id, productoId: producto.id, puntuacion: 4 });

    expect(await ratingPromedioProducto(producto.id)).toBe(4);
  });
});

describe("listarResenas", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, comprador, tienda, producto } = await armarEscenario());
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
    await crearResena(comprador, { tiendaId: tienda.id, productoId: producto.id, puntuacion: 5 });
  });

  afterEach(() => limpiar([vendedor.id, comprador.id], [producto.catalogoId]));

  it("lista reseñas de la tienda", async () => {
    const resultado = await listarResenas({ tiendaId: tienda.id });
    expect(resultado.total).toBe(1);
    expect(resultado.data[0].puntuacion).toBe(5);
  });
});
