import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import {
  esComprable,
  crearProducto,
  listarProductos,
  actualizarProducto,
  eliminarProducto,
  debitarStock,
  imagenEfectiva,
  type Producto,
} from "./productos";

let contador = 0;
async function crearVendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda }> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-productos-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda de prueba ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  return { vendedor, tienda };
}

// Atajo para las pruebas: siempre da de alta un producto nuevo en el catálogo
// compartido, que es lo que exige crearProducto por schema (03-productos.md /
// 06-catalogo.md). contadorNombre evita colisiones de nombre entre tests, aunque el
// catálogo no exige nombre único (solo codigoBarras si se manda).
let contadorNombre = 0;
function inputNuevo(overrides: { precio?: number; stock?: number; nombre?: string } = {}) {
  contadorNombre += 1;
  return {
    nuevo: { nombre: overrides.nombre ?? `Producto de prueba ${contadorNombre}` },
    precio: overrides.precio ?? 1,
    stock: overrides.stock ?? 1,
  };
}

async function limpiar(usuarioIds: string[]) {
  const catalogoIds = (
    await prisma.producto.findMany({ where: { tienda: { vendedorId: { in: usuarioIds } } }, select: { catalogoId: true } })
  ).map((p) => p.catalogoId);
  await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tienda: { vendedorId: { in: usuarioIds } } } } });
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogoIds } } });
}

describe("esComprable", () => {
  const base: Producto = {
    id: "x",
    tiendaId: "y",
    catalogoId: "z",
    nombre: "Producto",
    descripcion: null,
    categoria: null,
    imagenUrl: null,
    imagenCatalogoUrl: null,
    imagenEfectiva: null,
    precio: 10,
    precioOferta: null,
    destacado: false,
    stock: 1,
    disponible: true,
  };

  it("true si disponible=true y stock>0", () => {
    expect(esComprable(base)).toBe(true);
  });

  it("false si stock=0", () => {
    expect(esComprable({ ...base, stock: 0 })).toBe(false);
  });

  it("false si disponible=false", () => {
    expect(esComprable({ ...base, disponible: false })).toBe(false);
  });
});

describe("crearProducto", () => {
  let vendedor: Usuario;
  let otro: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    otro = await registrarUsuario({
      email: `test-productos-otro-${Date.now()}-${contador}@almacenia.test`,
      password: "password123",
      nombre: "Otro usuario",
    });
  });

  afterEach(() => limpiar([vendedor.id, otro.id]));

  it("crea el producto con disponible=true por defecto, dando de alta en el catálogo", async () => {
    const producto = await crearProducto(vendedor, tienda.id, {
      nuevo: { nombre: "Lechuga" },
      precio: 250.5,
      stock: 10,
    });

    expect(producto.tiendaId).toBe(tienda.id);
    expect(producto.nombre).toBe("Lechuga");
    expect(producto.precio).toBe(250.5);
    expect(producto.stock).toBe(10);
    expect(producto.disponible).toBe(true);
    expect(producto.catalogoId).toBeTruthy();
  });

  it("crea el producto adoptando un catalogoId existente", async () => {
    const primero = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Fideos" }, precio: 5, stock: 1 });

    const otraTienda = await crearTienda(otro, {
      nombre: "Otra tienda",
      direccion: "Dirección",
      lat: -34.6,
      lon: -58.4,
    });
    const adoptado = await crearProducto(otro, otraTienda.id, {
      catalogoId: primero.catalogoId,
      precio: 6,
      stock: 2,
    });

    expect(adoptado.catalogoId).toBe(primero.catalogoId);
    expect(adoptado.nombre).toBe("Fideos");
    expect(adoptado.precio).toBe(6);
  });

  it("lanza CATALOGO_NO_ENCONTRADO si el catalogoId no existe", async () => {
    await expect(
      crearProducto(vendedor, tienda.id, {
        catalogoId: "00000000-0000-0000-0000-000000000000",
        precio: 1,
        stock: 1,
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "CATALOGO_NO_ENCONTRADO" });
  });

  it("lanza TIENDA_NO_ENCONTRADA si la tienda no existe", async () => {
    await expect(
      crearProducto(vendedor, "00000000-0000-0000-0000-000000000000", inputNuevo())
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si el usuario no es el dueño", async () => {
    await expect(crearProducto(otro, tienda.id, inputNuevo())).rejects.toMatchObject<Partial<AppError>>({
      code: "NO_ES_DUENO_DE_TIENDA",
    });
  });

  it("lanza PRECIO_INVALIDO si precio < 0", async () => {
    await expect(
      crearProducto(vendedor, tienda.id, inputNuevo({ precio: -1 }))
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRECIO_INVALIDO" });
  });

  it("lanza STOCK_INVALIDO si stock < 0", async () => {
    await expect(
      crearProducto(vendedor, tienda.id, inputNuevo({ stock: -1 }))
    ).rejects.toMatchObject<Partial<AppError>>({ code: "STOCK_INVALIDO" });
  });
});

describe("listarProductos", () => {
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Disponible", stock: 5 }));
    const agotado = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Sin stock", stock: 5 }));
    await actualizarProducto(vendedor, agotado.id, { stock: 0 });
    const pausado = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Pausado", stock: 5 }));
    await actualizarProducto(vendedor, pausado.id, { disponible: false });
  });

  afterEach(() => limpiar([vendedor.id]));

  it("devuelve todos los productos sin el filtro soloDisponibles", async () => {
    const resultado = await listarProductos({ tiendaId: tienda.id });

    expect(resultado.total).toBe(3);
    expect(resultado.data).toHaveLength(3);
    expect(resultado.page).toBe(1);
    expect(resultado.pageSize).toBe(20);
  });

  it("filtra solo comprables con soloDisponibles=true", async () => {
    const resultado = await listarProductos({ tiendaId: tienda.id, soloDisponibles: true });

    expect(resultado.data).toHaveLength(1);
    expect(resultado.data[0].nombre).toBe("Disponible");
  });

  it("pagina correctamente", async () => {
    const resultado = await listarProductos({ tiendaId: tienda.id, page: 1, pageSize: 2 });

    expect(resultado.data).toHaveLength(2);
    expect(resultado.total).toBe(3);
    expect(resultado.pageSize).toBe(2);
  });
});

describe("listarProductos: filtros, orden y tabs", () => {
  let vendedor: Usuario;
  let tienda: Tienda;
  let barato: Producto;
  let caro: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    barato = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Alfajor", precio: 10, stock: 5 }));
    caro = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Zapallo", precio: 100, stock: 5 }));
  });

  afterEach(() => limpiar([vendedor.id]));

  it("filtra por q (nombre, insensible a mayúsculas)", async () => {
    const resultado = await listarProductos({ tiendaId: tienda.id, q: "alfa" });
    expect(resultado.data).toHaveLength(1);
    expect(resultado.data[0].id).toBe(barato.id);
  });

  it("filtra por precioMin/precioMax", async () => {
    const resultado = await listarProductos({ tiendaId: tienda.id, precioMin: 50 });
    expect(resultado.data.map((p) => p.id)).toEqual([caro.id]);
  });

  it("ordena por precio_asc y precio_desc", async () => {
    const asc = await listarProductos({ tiendaId: tienda.id, sort: "precio_asc" });
    expect(asc.data.map((p) => p.id)).toEqual([barato.id, caro.id]);

    const desc = await listarProductos({ tiendaId: tienda.id, sort: "precio_desc" });
    expect(desc.data.map((p) => p.id)).toEqual([caro.id, barato.id]);
  });

  it("ordena alfabéticamente", async () => {
    const resultado = await listarProductos({ tiendaId: tienda.id, sort: "alfabetico" });
    expect(resultado.data.map((p) => p.id)).toEqual([barato.id, caro.id]); // Alfajor < Zapallo
  });

  it("tab=ofertas filtra productos con precioOferta", async () => {
    await actualizarProducto(vendedor, barato.id, { precioOferta: 5 });
    const resultado = await listarProductos({ tiendaId: tienda.id, tab: "ofertas" });
    expect(resultado.data.map((p) => p.id)).toEqual([barato.id]);
  });

  it("tab=destacados filtra productos marcados como destacado", async () => {
    await actualizarProducto(vendedor, caro.id, { destacado: true });
    const resultado = await listarProductos({ tiendaId: tienda.id, tab: "destacados" });
    expect(resultado.data.map((p) => p.id)).toEqual([caro.id]);
  });

  it("sort=mas_vendidos ordena por cantidad vendida", async () => {
    const { crearVentaPresencial } = await import("@/lib/ventas/ventas");
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: barato.id, cantidad: 3 }] });

    const resultado = await listarProductos({ tiendaId: tienda.id, sort: "mas_vendidos" });
    expect(resultado.data[0].id).toBe(barato.id);
  });
});

describe("actualizarProducto", () => {
  let vendedor: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    otro = await registrarUsuario({
      email: `test-productos-otro2-${Date.now()}-${contador}@almacenia.test`,
      password: "password123",
      nombre: "Otro usuario",
    });
    producto = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Original", precio: 100, stock: 5 }));
  });

  afterEach(() => limpiar([vendedor.id, otro.id]));

  it("permite al dueño actualizar campos", async () => {
    const actualizado = await actualizarProducto(vendedor, producto.id, {
      precio: 150,
      stock: 20,
    });

    expect(actualizado.precio).toBe(150);
    expect(actualizado.stock).toBe(20);
    expect(actualizado.nombre).toBe("Original");
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
    await expect(
      actualizarProducto(otro, producto.id, { precio: 1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_ES_DUENO_DE_TIENDA" });
  });

  it("lanza PRODUCTO_NO_ENCONTRADO si el id no existe", async () => {
    await expect(
      actualizarProducto(vendedor, "00000000-0000-0000-0000-000000000000", { precio: 1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRODUCTO_NO_ENCONTRADO" });
  });

  it("lanza PRECIO_INVALIDO si precio < 0", async () => {
    await expect(
      actualizarProducto(vendedor, producto.id, { precio: -1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRECIO_INVALIDO" });
  });

  it("permite setear precioOferta menor al precio", async () => {
    const actualizado = await actualizarProducto(vendedor, producto.id, { precioOferta: 80 });
    expect(actualizado.precioOferta).toBe(80);
  });

  it("lanza PRECIO_OFERTA_INVALIDO si precioOferta >= precio", async () => {
    await expect(
      actualizarProducto(vendedor, producto.id, { precioOferta: 100 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRECIO_OFERTA_INVALIDO" });
  });
});

describe("eliminarProducto", () => {
  let vendedor: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    otro = await registrarUsuario({
      email: `test-productos-otro3-${Date.now()}-${contador}@almacenia.test`,
      password: "password123",
      nombre: "Otro usuario",
    });
    producto = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "A borrar", precio: 100, stock: 5 }));
  });

  afterEach(() => limpiar([vendedor.id, otro.id]));

  it("hace borrado lógico: disponible=false y stock=0", async () => {
    const eliminado = await eliminarProducto(vendedor, producto.id);

    expect(eliminado.disponible).toBe(false);
    expect(eliminado.stock).toBe(0);
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
    await expect(eliminarProducto(otro, producto.id)).rejects.toMatchObject<Partial<AppError>>({
      code: "NO_ES_DUENO_DE_TIENDA",
    });
  });
});

describe("debitarStock", () => {
  let vendedor: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    producto = await crearProducto(vendedor, tienda.id, inputNuevo({ nombre: "Con stock", precio: 100, stock: 10 }));
  });

  afterEach(() => limpiar([vendedor.id]));

  it("debita la cantidad indicada del stock", async () => {
    const actualizado = await debitarStock(producto.id, 3);

    expect(actualizado.stock).toBe(7);
  });

  it("lanza STOCK_INSUFICIENTE si la cantidad excede el stock disponible", async () => {
    await expect(debitarStock(producto.id, 11)).rejects.toMatchObject<Partial<AppError>>({
      code: "STOCK_INSUFICIENTE",
    });
  });
});

describe("imagenEfectiva", () => {
  const FOTO_CATALOGO = "http://s3/catalogo.jpg";
  const FOTO_PROPIA = "http://s3/propia.jpg";

  it("premium con foto propia: usa la foto propia", () => {
    expect(imagenEfectiva({ plan: "premium" }, { imagenUrl: FOTO_PROPIA }, { imagenUrl: FOTO_CATALOGO })).toBe(FOTO_PROPIA);
  });

  it("premium sin foto propia: usa la del catálogo", () => {
    expect(imagenEfectiva({ plan: "premium" }, { imagenUrl: null }, { imagenUrl: FOTO_CATALOGO })).toBe(FOTO_CATALOGO);
  });

  it("free con foto propia heredada: se ignora y usa la del catálogo", () => {
    expect(imagenEfectiva({ plan: "free" }, { imagenUrl: FOTO_PROPIA }, { imagenUrl: FOTO_CATALOGO })).toBe(FOTO_CATALOGO);
  });

  it("sin ninguna foto: null", () => {
    expect(imagenEfectiva({ plan: "free" }, { imagenUrl: FOTO_PROPIA }, { imagenUrl: null })).toBeNull();
  });
});

describe("fotos de producto (catálogo compartido + personalizadas premium)", () => {
  let vendedor: Usuario;
  let tienda: Tienda;
  const FOTO_CATALOGO = "http://s3/catalogo.jpg";
  const FOTO_PROPIA = "http://s3/propia.jpg";

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
  });

  afterEach(() => limpiar([vendedor.id]));

  async function catalogoConFoto() {
    contadorNombre += 1;
    return prisma.productoCatalogo.create({
      data: { nombre: `Con foto ${contadorNombre}`, imagenUrl: FOTO_CATALOGO },
    });
  }

  it("adoptar un producto de catálogo con foto: no copia la foto, la muestra como efectiva", async () => {
    const catalogo = await catalogoConFoto();
    const producto = await crearProducto(vendedor, tienda.id, { catalogoId: catalogo.id, precio: 10, stock: 1 });

    expect(producto.imagenUrl).toBeNull();
    expect(producto.imagenCatalogoUrl).toBe(FOTO_CATALOGO);
    expect(producto.imagenEfectiva).toBe(FOTO_CATALOGO);

    const listado = await listarProductos({ tiendaId: tienda.id });
    expect(listado.data[0].imagenEfectiva).toBe(FOTO_CATALOGO);
  });

  it("tienda free no puede crear un producto con foto propia (FOTOS_SOLO_PREMIUM)", async () => {
    const catalogo = await catalogoConFoto();
    await expect(
      crearProducto(vendedor, tienda.id, { catalogoId: catalogo.id, precio: 10, stock: 1, imagenUrl: FOTO_PROPIA })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "FOTOS_SOLO_PREMIUM" });
  });

  it("tienda free no puede dar de alta un producto nuevo con foto de catálogo (FOTOS_SOLO_PREMIUM)", async () => {
    await expect(
      crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Con foto", imagenUrl: FOTO_CATALOGO }, precio: 10, stock: 1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "FOTOS_SOLO_PREMIUM" });
  });

  it("tienda free no puede setear foto personalizada por PATCH, pero sí quitarla", async () => {
    const producto = await crearProducto(vendedor, tienda.id, inputNuevo());
    await expect(actualizarProducto(vendedor, producto.id, { imagenUrl: FOTO_PROPIA })).rejects.toMatchObject<
      Partial<AppError>
    >({ code: "FOTOS_SOLO_PREMIUM" });

    const sinFoto = await actualizarProducto(vendedor, producto.id, { imagenUrl: null });
    expect(sinFoto.imagenUrl).toBeNull();
  });

  it("tienda premium: la foto personalizada pasa a ser la efectiva", async () => {
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
    const catalogo = await catalogoConFoto();
    const producto = await crearProducto(vendedor, tienda.id, { catalogoId: catalogo.id, precio: 10, stock: 1 });

    const actualizado = await actualizarProducto(vendedor, producto.id, { imagenUrl: FOTO_PROPIA });
    expect(actualizado.imagenUrl).toBe(FOTO_PROPIA);
    expect(actualizado.imagenEfectiva).toBe(FOTO_PROPIA);
    expect(actualizado.imagenCatalogoUrl).toBe(FOTO_CATALOGO);
  });

  it("si la tienda vuelve a free, la foto propia deja de mostrarse (no se borra)", async () => {
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
    const catalogo = await catalogoConFoto();
    const producto = await crearProducto(vendedor, tienda.id, { catalogoId: catalogo.id, precio: 10, stock: 1, imagenUrl: FOTO_PROPIA });
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "free" } });

    const listado = await listarProductos({ tiendaId: tienda.id });
    expect(listado.data[0].id).toBe(producto.id);
    expect(listado.data[0].imagenUrl).toBe(FOTO_PROPIA);
    expect(listado.data[0].imagenEfectiva).toBe(FOTO_CATALOGO);
  });
});
