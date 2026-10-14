import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  buscarEnCatalogo,
  obtenerProductoCatalogo,
  crearProductoNuevoEnCatalogo,
  asignarFotoCatalogo,
  sumarAlCatalogo,
  componerNombreCatalogo,
} from "./catalogo";
import { categoriaDePrueba, nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";

async function limpiar(ids: string[]) {
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: ids } } });
}

describe("componerNombreCatalogo (06-catalogo.md)", () => {
  it("une categoría, marca, variante y contenido formateado", () => {
    expect(
      componerNombreCatalogo({ categoria: "Arroz", marca: "Gallo Oro", variante: "largo fino", contenido: 1, unidadContenido: "kg" })
    ).toBe("Arroz Gallo Oro largo fino 1 kg");
    expect(componerNombreCatalogo({ categoria: "Gaseosa", marca: "Coca-Cola", contenido: 1.5, unidadContenido: "l" })).toBe(
      "Gaseosa Coca-Cola 1,5 l"
    );
    expect(componerNombreCatalogo({ categoria: "Huevos", contenido: 6, unidadContenido: "u" })).toBe("Huevos 6 u");
    expect(componerNombreCatalogo({ categoria: "Queso", variante: "cremoso" })).toBe("Queso cremoso");
    expect(componerNombreCatalogo({ categoria: "Yerba", marca: "  Playadito  ", contenido: 500, unidadContenido: "g" })).toBe(
      "Yerba Playadito 500 g"
    );
  });
});

describe("crearProductoNuevoEnCatalogo", () => {
  const creados: string[] = [];
  afterEach(() => limpiar(creados.splice(0)));
  let arroz: string;
  let queso: string;
  beforeAll(async () => {
    arroz = await categoriaDePrueba("Arroz test catálogo");
    queso = await categoriaDePrueba("Queso test catálogo");
  });

  it("crea la entrada con nombre compuesto y la categoría", async () => {
    const marca = `Gallo ${Date.now()}`;
    const p = await crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca, contenido: 1, unidadContenido: "kg" });
    creados.push(p.id);
    expect(p).toMatchObject({
      nombre: `Arroz test catálogo ${marca} 1 kg`,
      marca,
      categoria: { id: arroz, nombre: "Arroz test catálogo" },
      contenido: 1,
      unidadContenido: "kg",
      unidad: "unidad",
      codigoBarras: null,
    });
  });

  it("no duplica: misma categoría, marca/variante normalizadas y contenido devuelven la misma entrada", async () => {
    const marca = `Molinos ${Date.now()}`;
    const a = await crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca, variante: "Largo fino", contenido: 500, unidadContenido: "g" });
    creados.push(a.id);
    const b = await crearProductoNuevoEnCatalogo({
      categoriaId: arroz,
      marca: `  ${marca.toUpperCase()} `,
      variante: "largo  FÍNO",
      contenido: 500,
      unidadContenido: "g",
    });
    expect(b.id).toBe(a.id);
    const otroTamano = await crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca, variante: "Largo fino", contenido: 1, unidadContenido: "kg" });
    creados.push(otroTamano.id);
    expect(otroTamano.id).not.toBe(a.id);
  });

  it("producto suelto por kg sin contenido; con contenido da CONTENIDO_INVALIDO", async () => {
    const p = await crearProductoNuevoEnCatalogo({ categoriaId: queso, variante: `cremoso ${Date.now()}`, unidad: "kg" });
    creados.push(p.id);
    expect(p.unidad).toBe("kg");
    await expect(
      crearProductoNuevoEnCatalogo({ categoriaId: queso, unidad: "kg", contenido: 1, unidadContenido: "kg" })
    ).rejects.toMatchObject({ code: "CONTENIDO_INVALIDO" });
  });

  it("valida categoría, contenido, largo y groserías", async () => {
    await expect(crearProductoNuevoEnCatalogo({ categoriaId: "no-existe" })).rejects.toMatchObject({ code: "CATEGORIA_NO_ENCONTRADA" });
    await expect(crearProductoNuevoEnCatalogo({ categoriaId: arroz, contenido: 1 })).rejects.toMatchObject({ code: "CONTENIDO_INVALIDO" });
    await expect(
      crearProductoNuevoEnCatalogo({ categoriaId: arroz, contenido: 0, unidadContenido: "g" })
    ).rejects.toMatchObject({ code: "CONTENIDO_INVALIDO" });
    await expect(
      crearProductoNuevoEnCatalogo({ categoriaId: arroz, unidadContenido: "zz" as "g", contenido: 1 })
    ).rejects.toMatchObject({ code: "CONTENIDO_INVALIDO" });
    await expect(crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca: "x".repeat(41) })).rejects.toMatchObject({ code: "TEXTO_INVALIDO" });
    await expect(crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca: "La puta" })).rejects.toMatchObject({ code: "TEXTO_NO_PERMITIDO" });
    await expect(crearProductoNuevoEnCatalogo({ categoriaId: arroz, unidad: "litro" as "kg" })).rejects.toMatchObject({ code: "UNIDAD_INVALIDA" });
  });

  it("lanza CODIGO_BARRAS_DUPLICADO si el código ya existe", async () => {
    const p = await crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca: `Uno ${Date.now()}`, codigoBarras: "7791234567890" });
    creados.push(p.id);

    await expect(
      crearProductoNuevoEnCatalogo({ categoriaId: arroz, marca: `Otra ${Date.now()}`, codigoBarras: "7791234567890" })
    ).rejects.toMatchObject<Partial<AppError>>({ code: "CODIGO_BARRAS_DUPLICADO" });
  });
});

describe("buscarEnCatalogo", () => {
  const creados: string[] = [];
  afterEach(() => limpiar(creados.splice(0)));

  it("lanza BUSQUEDA_CATALOGO_INVALIDA sin q ni codigoBarras", async () => {
    await expect(buscarEnCatalogo({})).rejects.toMatchObject<Partial<AppError>>({
      code: "BUSQUEDA_CATALOGO_INVALIDA",
    });
  });

  it("encuentra por nombre compuesto, parcial y case-insensitive", async () => {
    const p = await crearProductoNuevoEnCatalogo({ categoriaId: await categoriaDePrueba("Fideos test"), marca: "Matarazzo", contenido: 500, unidadContenido: "g" });
    creados.push(p.id);

    const resultados = await buscarEnCatalogo({ q: "fideos test matarazzo" });
    expect(resultados.some((r) => r.id === p.id)).toBe(true);
  });

  it("encuentra por código de barras exacto", async () => {
    const p = await crearProductoNuevoEnCatalogo({ ...(await nuevoDePrueba("Aceite")), codigoBarras: "7790001112223" });
    creados.push(p.id);

    const resultados = await buscarEnCatalogo({ codigoBarras: "7790001112223" });
    expect(resultados).toHaveLength(1);
    expect(resultados[0].id).toBe(p.id);
  });
});

describe("obtenerProductoCatalogo", () => {
  it("devuelve null si no existe", async () => {
    expect(await obtenerProductoCatalogo("00000000-0000-0000-0000-000000000000")).toBeNull();
  });
});

describe("asignarFotoCatalogo", () => {
  const creados: string[] = [];
  const usuarios: string[] = [];
  let contador = 0;

  afterEach(async () => {
    await limpiar(creados.splice(0));
    const ids = usuarios.splice(0);
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  });

  async function vendedorCon(plan: "free" | "premium"): Promise<Usuario> {
    contador += 1;
    const u = await registrarUsuario({
      email: `test-catalogo-foto-${Date.now()}-${contador}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    usuarios.push(u.id);
    const tienda = await crearTienda(u, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan } });
    return { ...u, esVendedor: true };
  }

  async function admin(): Promise<Usuario> {
    contador += 1;
    const u = await registrarUsuario({
      email: `test-catalogo-admin-${Date.now()}-${contador}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    usuarios.push(u.id);
    await prisma.usuario.update({ where: { id: u.id }, data: { esAdmin: true } });
    return { ...u, esAdmin: true };
  }

  async function entrada(imagenUrl: string | null = null) {
    const p = await prisma.productoCatalogo.create({
      data: { nombre: `Foto ${Date.now()}-${contador}`, imagenUrl, categoriaId: await categoriaDePrueba() },
    });
    creados.push(p.id);
    return p;
  }

  it("vendedor premium asigna la foto a una entrada sin foto", async () => {
    const vendedor = await vendedorCon("premium");
    const e = await entrada();
    const r = await asignarFotoCatalogo(vendedor, e.id, "http://s3/nueva.jpg");
    expect(r.imagenUrl).toBe("http://s3/nueva.jpg");
  });

  it("vendedor premium no puede reemplazar una foto existente (CATALOGO_YA_TIENE_FOTO)", async () => {
    const vendedor = await vendedorCon("premium");
    const e = await entrada("http://s3/vieja.jpg");
    await expect(asignarFotoCatalogo(vendedor, e.id, "http://s3/nueva.jpg")).rejects.toMatchObject<Partial<AppError>>({
      code: "CATALOGO_YA_TIENE_FOTO",
    });
  });

  it("vendedor free no puede asignar fotos (FOTOS_SOLO_PREMIUM)", async () => {
    const vendedor = await vendedorCon("free");
    const e = await entrada();
    await expect(asignarFotoCatalogo(vendedor, e.id, "http://s3/nueva.jpg")).rejects.toMatchObject<Partial<AppError>>({
      code: "FOTOS_SOLO_PREMIUM",
    });
  });

  it("admin puede reemplazar una foto existente", async () => {
    const a = await admin();
    const e = await entrada("http://s3/vieja.jpg");
    const r = await asignarFotoCatalogo(a, e.id, "http://s3/nueva.jpg");
    expect(r.imagenUrl).toBe("http://s3/nueva.jpg");
  });

  it("CATALOGO_NO_ENCONTRADO si la entrada no existe", async () => {
    const a = await admin();
    await expect(
      asignarFotoCatalogo(a, "00000000-0000-0000-0000-000000000000", "http://s3/x.jpg")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "CATALOGO_NO_ENCONTRADO" });
  });
});

describe("sumarAlCatalogo (alta desde una lista de compras)", () => {
  const usuarios: string[] = [];
  const creados: string[] = [];
  let n = 0;
  let fernet: string;
  beforeAll(async () => {
    fernet = await categoriaDePrueba("Fernet test");
  });
  afterEach(async () => {
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: creados.splice(0) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.splice(0) } } });
  });
  async function comprador(): Promise<Usuario> {
    n += 1;
    const u = await registrarUsuario({ email: `test-sumar-cat-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre: "C" });
    usuarios.push(u.id);
    return u;
  }
  const marcaUnica = () => `Branca ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  it("crea la entrada con creadoPorId, categoría y nombre compuesto", async () => {
    const u = await comprador();
    const marca = marcaUnica();
    const { producto, creado } = await sumarAlCatalogo(u, { categoriaId: fernet, marca, contenido: 750, unidadContenido: "ml" });
    creados.push(producto.id);
    expect(creado).toBe(true);
    expect(producto).toMatchObject({ nombre: `Fernet test ${marca} 750 ml`, unidad: "unidad", categoria: { id: fernet } });
    expect((await prisma.productoCatalogo.findUniqueOrThrow({ where: { id: producto.id } })).creadoPorId).toBe(u.id);
  });

  it("no duplica: la misma entrada (sin tildes ni mayúsculas) devuelve la existente", async () => {
    const u = await comprador();
    const marca = `Dulce ${Date.now()}`;
    const primero = await sumarAlCatalogo(u, { categoriaId: fernet, marca });
    creados.push(primero.producto.id);
    const segundo = await sumarAlCatalogo(u, { categoriaId: fernet, marca: marca.toUpperCase().replace("DULCE", "DÚLCE") });
    expect(segundo).toEqual({ producto: primero.producto, creado: false });
  });

  it("rechaza groserías, datos inválidos y más de 20 altas por día", async () => {
    const u = await comprador();
    await expect(sumarAlCatalogo(u, { categoriaId: fernet, variante: "pelotudo" })).rejects.toMatchObject({ code: "TEXTO_NO_PERMITIDO" });
    await expect(sumarAlCatalogo(u, { categoriaId: fernet, marca: "La puta" })).rejects.toMatchObject({ code: "TEXTO_NO_PERMITIDO" });
    await expect(sumarAlCatalogo(u, { categoriaId: "" })).rejects.toMatchObject({ code: "CATEGORIA_NO_ENCONTRADA" });
    await expect(sumarAlCatalogo(u, { categoriaId: fernet, unidad: "litro" as "kg" })).rejects.toMatchObject({ code: "UNIDAD_INVALIDA" });

    const datos = Array.from({ length: 20 }, (_, i) => ({ nombre: `Alta ${Date.now()} ${i}`, creadoPorId: u.id, categoriaId: fernet }));
    await prisma.productoCatalogo.createMany({ data: datos });
    const ids = await prisma.productoCatalogo.findMany({ where: { creadoPorId: u.id }, select: { id: true } });
    creados.push(...ids.map((x) => x.id));
    await expect(sumarAlCatalogo(u, { categoriaId: fernet, marca: marcaUnica() })).rejects.toMatchObject({ code: "LIMITE_ALTAS_CATALOGO" });
  });
});
