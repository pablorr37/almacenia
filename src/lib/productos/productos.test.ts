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

async function limpiar(usuarioIds: string[]) {
  await prisma.itemVenta.deleteMany({});
  await prisma.itemPedido.deleteMany({});
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: usuarioIds } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
}

describe("esComprable", () => {
  const base: Producto = {
    id: "x",
    tiendaId: "y",
    nombre: "Producto",
    descripcion: null,
    precio: 10,
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

  it("crea el producto con disponible=true por defecto", async () => {
    const producto = await crearProducto(vendedor, tienda.id, {
      nombre: "Lechuga",
      descripcion: "Fresca",
      precio: 250.5,
      stock: 10,
    });

    expect(producto.tiendaId).toBe(tienda.id);
    expect(producto.nombre).toBe("Lechuga");
    expect(producto.precio).toBe(250.5);
    expect(producto.stock).toBe(10);
    expect(producto.disponible).toBe(true);
  });

  it("lanza TIENDA_NO_ENCONTRADA si la tienda no existe", async () => {
    await expect(
      crearProducto(vendedor, "00000000-0000-0000-0000-000000000000", {
        nombre: "X",
        precio: 1,
        stock: 1,
      })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });

  it("lanza NO_ES_DUENO_DE_TIENDA si el usuario no es el dueño", async () => {
    await expect(
      crearProducto(otro, tienda.id, { nombre: "X", precio: 1, stock: 1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "NO_ES_DUENO_DE_TIENDA" });
  });

  it("lanza PRECIO_INVALIDO si precio < 0", async () => {
    await expect(
      crearProducto(vendedor, tienda.id, { nombre: "X", precio: -1, stock: 1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "PRECIO_INVALIDO" });
  });

  it("lanza STOCK_INVALIDO si stock < 0", async () => {
    await expect(
      crearProducto(vendedor, tienda.id, { nombre: "X", precio: 1, stock: -1 })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "STOCK_INVALIDO" });
  });
});

describe("listarProductos", () => {
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    await crearProducto(vendedor, tienda.id, { nombre: "Disponible", precio: 1, stock: 5 });
    const agotado = await crearProducto(vendedor, tienda.id, { nombre: "Sin stock", precio: 1, stock: 5 });
    await actualizarProducto(vendedor, agotado.id, { stock: 0 });
    const pausado = await crearProducto(vendedor, tienda.id, { nombre: "Pausado", precio: 1, stock: 5 });
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
    producto = await crearProducto(vendedor, tienda.id, { nombre: "Original", precio: 100, stock: 5 });
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
    producto = await crearProducto(vendedor, tienda.id, { nombre: "A borrar", precio: 100, stock: 5 });
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
    producto = await crearProducto(vendedor, tienda.id, { nombre: "Con stock", precio: 100, stock: 10 });
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
