import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import {
  buscarEnCatalogo,
  obtenerProductoCatalogo,
  crearProductoNuevoEnCatalogo,
  asignarFotoCatalogo,
} from "./catalogo";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";

async function limpiar(ids: string[]) {
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: ids } } });
}

describe("crearProductoNuevoEnCatalogo", () => {
  const creados: string[] = [];
  afterEach(() => limpiar(creados.splice(0)));

  it("crea el producto de catálogo", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Yerba Cruz de Malta 1kg" });
    creados.push(p.id);

    expect(p.nombre).toBe("Yerba Cruz de Malta 1kg");
    expect(p.codigoBarras).toBeNull();
  });

  it("lanza CODIGO_BARRAS_DUPLICADO si el código ya existe", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Arroz", codigoBarras: "7791234567890" });
    creados.push(p.id);

    await expect(
      crearProductoNuevoEnCatalogo({ nombre: "Arroz otra marca", codigoBarras: "7791234567890" })
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

  it("encuentra por nombre parcial case-insensitive", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Fideos Matarazzo 500g" });
    creados.push(p.id);

    const resultados = await buscarEnCatalogo({ q: "matarazzo" });
    expect(resultados.some((r) => r.id === p.id)).toBe(true);
  });

  it("encuentra por código de barras exacto", async () => {
    const p = await crearProductoNuevoEnCatalogo({ nombre: "Aceite", codigoBarras: "7790001112223" });
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
    const p = await prisma.productoCatalogo.create({ data: { nombre: `Foto ${Date.now()}-${contador}`, imagenUrl } });
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
