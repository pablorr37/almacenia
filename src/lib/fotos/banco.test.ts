import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import type { ResultadoWeb } from "./buscador-web";

// El bucket no está disponible en los tests: se reemplaza solo la subida (la
// validación de imagen sigue siendo la real).
vi.mock("@/lib/archivos/archivos", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/archivos/archivos")>();
  return {
    ...real,
    subirArchivo: vi.fn(async (input: { tipo: string; entidadId: string; contentType: string; buffer: Buffer }) => {
      real.validarImagen(input.contentType, input.buffer.byteLength);
      return { url: `http://bucket.test/${input.tipo}/${input.entidadId}/x.jpg` };
    }),
  };
});

import {
  esCurador,
  fuentesVisibles,
  normalizarEtiquetas,
  buscarEnBanco,
  mejorFotoDelBanco,
  aprobarFotoWeb,
  guardarFotoWeb,
  subirFotoBanco,
  revisarFoto,
  usarFoto,
  permisosFotos,
  catalogoSinFoto,
} from "./banco";

const JPG = { contentType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) };
const PREFIJO = `test-banco-${Date.now()}`;

function base(extra: Partial<Usuario> = {}): Usuario {
  return {
    id: "x",
    email: "x@x.com",
    nombre: "X",
    esComprador: true,
    esVendedor: false,
    esAdmin: false,
    esTester: false,
    avatarUrl: null,
    ...extra,
  };
}

function resultadoWeb(n: string | number): ResultadoWeb {
  return {
    origenUrl: `https://openverse.test/${PREFIJO}/${n}`,
    imagenUrl: `https://img.test/${PREFIJO}/${n}.jpg`,
    miniaturaUrl: `https://img.test/${PREFIJO}/${n}-thumb.jpg`,
    ancho: 1200,
    alto: 800,
    titulo: `Fresh tomatoes ${n}`,
    autor: "Fotógrafo",
    licencia: "cc0",
  };
}

// fetch que devuelve una imagen JPEG válida (la descarga al aprobar).
const fetchImagen = vi.fn(
  async () => new Response(new Uint8Array(JPG.buffer), { headers: { "content-type": "image/jpeg" } })
) as unknown as typeof fetch;

describe("reglas puras", () => {
  it("esCurador: admin o tester", () => {
    expect(esCurador(base({ esAdmin: true }))).toBe(true);
    expect(esCurador(base({ esTester: true }))).toBe(true);
    expect(esCurador(base())).toBe(false);
  });

  it("fuentesVisibles según rol y plan", () => {
    expect(fuentesVisibles(base({ esTester: true }), null)).toEqual(["web", "curado", "subidas", "propias"]);
    expect(fuentesVisibles(base({ esVendedor: true }), "premium")).toEqual(["curado", "subidas", "propias"]);
    expect(fuentesVisibles(base({ esVendedor: true }), "free")).toEqual(["curado"]);
    expect(fuentesVisibles(base(), null)).toEqual(["curado"]);
  });

  it("normalizarEtiquetas: minúsculas, sin tildes, sin repetidas", () => {
    expect(normalizarEtiquetas([" Tomate ", "TOMATE", "Limón"])).toEqual(["tomate", "limon"]);
  });

  it("normalizarEtiquetas: rechaza vacías, largas, demasiadas o que no son array", () => {
    for (const malo of [[], [""], ["x".repeat(41)], Array.from({ length: 21 }, (_, i) => `e${i}`), "tomate"]) {
      expect(() => normalizarEtiquetas(malo)).toThrow(expect.objectContaining({ code: "ETIQUETAS_INVALIDAS" }));
    }
  });
});

describe("banco de fotos (DB)", () => {
  const usuarios: string[] = [];
  const catalogos: string[] = [];
  let n = 0;

  afterEach(async () => {
    await prisma.fotoBanco.deleteMany({ where: { OR: [{ origenUrl: { contains: PREFIJO } }, { etiquetas: { has: PREFIJO } }] } });
    await prisma.producto.deleteMany({ where: { catalogoId: { in: catalogos } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogos.splice(0) } } });
    const ids = usuarios.splice(0);
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: ids } } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  });

  async function usuario(flags: { esAdmin?: boolean; esTester?: boolean } = {}): Promise<Usuario> {
    n += 1;
    const u = await registrarUsuario({ email: `${PREFIJO}-${n}@almacenia.test`, password: "password123", nombre: "U" });
    usuarios.push(u.id);
    await prisma.usuario.update({ where: { id: u.id }, data: flags });
    return { ...u, ...flags };
  }

  async function vendedor(plan: "free" | "premium"): Promise<Usuario & { tiendaId: string }> {
    const u = await usuario();
    const tienda = await crearTienda(u, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan } });
    return { ...u, esVendedor: true, tiendaId: tienda.id };
  }

  async function catalogo(imagenUrl: string | null = null) {
    n += 1;
    const c = await prisma.productoCatalogo.create({ data: { nombre: `${PREFIJO} catálogo ${n}`, imagenUrl } });
    catalogos.push(c.id);
    return c;
  }

  // Etiqueta PREFIJO para poder limpiar las subidas (no tienen origenUrl).
  const etiquetas = (...extra: string[]) => [PREFIJO, ...extra];

  describe("aprobarFotoWeb", () => {
    it("un curador aprueba: descarga, sube al bucket y queda aprobada", async () => {
      const tester = await usuario({ esTester: true });
      const foto = await aprobarFotoWeb(tester, resultadoWeb(1), ["Tomate", "tomato"], { fetch: fetchImagen });

      expect(foto).toMatchObject({
        fuente: "web",
        estado: "aprobada",
        etiquetas: ["tomate", "tomato"],
        licencia: "cc0",
        autor: "Fotógrafo",
        origenUrl: resultadoWeb(1).origenUrl,
      });
      expect(foto.url).toMatch(/^http:\/\/bucket\.test\/bancofotos\//);
      expect(fetchImagen).toHaveBeenCalledWith(resultadoWeb(1).imagenUrl, expect.anything());
    });

    it("es idempotente por origenUrl: suma etiquetas y aprueba la pendiente", async () => {
      const admin = await usuario({ esAdmin: true });
      const pendiente = await guardarFotoWeb(resultadoWeb(2), ["tomate"], { estado: "pendiente", fetch: fetchImagen });
      expect(pendiente.estado).toBe("pendiente");

      const aprobada = await aprobarFotoWeb(admin, resultadoWeb(2), ["perita"], { fetch: fetchImagen });
      expect(aprobada.id).toBe(pendiente.id);
      expect(aprobada.estado).toBe("aprobada");
      expect(aprobada.etiquetas).toEqual(["tomate", "perita"]);
    });

    it("SOLO_CURADORES para quien no es admin ni tester", async () => {
      const premium = await vendedor("premium");
      await expect(aprobarFotoWeb(premium, resultadoWeb(3), ["x"], { fetch: fetchImagen })).rejects.toMatchObject<Partial<AppError>>({
        code: "SOLO_CURADORES",
      });
    });

    it("FOTO_INVALIDA si la descarga falla o no es una imagen", async () => {
      const tester = await usuario({ esTester: true });
      const html = vi.fn(async () => new Response("<html>", { headers: { "content-type": "text/html" } }));
      await expect(
        aprobarFotoWeb(tester, resultadoWeb(4), ["x"], { fetch: html as unknown as typeof fetch })
      ).rejects.toMatchObject<Partial<AppError>>({ code: "FOTO_INVALIDA" });
      const caida = vi.fn(async () => {
        throw new TypeError("fetch failed");
      });
      await expect(
        aprobarFotoWeb(tester, resultadoWeb(5), ["x"], { fetch: caida as unknown as typeof fetch })
      ).rejects.toMatchObject<Partial<AppError>>({ code: "FOTO_INVALIDA" });
    });
  });

  describe("subirFotoBanco", () => {
    it("tester → aprobada; premium → pendiente; free → FOTOS_SOLO_PREMIUM", async () => {
      const tester = await usuario({ esTester: true });
      const premium = await vendedor("premium");
      const free = await vendedor("free");

      expect((await subirFotoBanco(tester, JPG, etiquetas("queso"))).estado).toBe("aprobada");
      const propia = await subirFotoBanco(premium, JPG, etiquetas("queso"));
      expect(propia).toMatchObject({ estado: "pendiente", fuente: "subida", licencia: "propia", subidaPorId: premium.id });
      await expect(subirFotoBanco(free, JPG, etiquetas("queso"))).rejects.toMatchObject<Partial<AppError>>({
        code: "FOTOS_SOLO_PREMIUM",
      });
    });

    it("valida el tipo de archivo", async () => {
      const tester = await usuario({ esTester: true });
      await expect(
        subirFotoBanco(tester, { contentType: "application/pdf", buffer: Buffer.from("x") }, etiquetas())
      ).rejects.toMatchObject<Partial<AppError>>({ code: "TIPO_ARCHIVO_INVALIDO" });
    });
  });

  describe("buscarEnBanco y visibilidad", () => {
    it("free ve solo el banco curado; premium además subidas aprobadas y propias; curador todo", async () => {
      const tester = await usuario({ esTester: true });
      const premium = await vendedor("premium");
      const otroPremium = await vendedor("premium");
      const free = await vendedor("free");
      const palabra = `zqx${Date.now()}`; // término único para aislar el test

      const curada = await aprobarFotoWeb(tester, resultadoWeb(10), [palabra], { fetch: fetchImagen });
      const pendienteWeb = await guardarFotoWeb(resultadoWeb(11), [palabra], { estado: "pendiente", fetch: fetchImagen });
      const deTester = await subirFotoBanco(tester, JPG, etiquetas(palabra));
      const propia = await subirFotoBanco(premium, JPG, etiquetas(palabra));
      const ajena = await subirFotoBanco(otroPremium, JPG, etiquetas(palabra));

      const ids = async (u: Usuario) => (await buscarEnBanco(u, palabra, {})).data.map((f) => f.id).sort();

      expect(await ids(free)).toEqual([curada.id]);
      expect(await ids(premium)).toEqual([curada.id, deTester.id, propia.id].sort());
      expect(await ids(tester)).toEqual([curada.id, pendienteWeb.id, deTester.id, propia.id, ajena.id].sort());
    });

    it("coincide por palabra, sin tildes y en singular; ordena por cantidad de coincidencias", async () => {
      const tester = await usuario({ esTester: true });
      const tag = `ywv${Date.now()}`;
      const una = await aprobarFotoWeb(tester, resultadoWeb(20), [`${tag} limon`], { fetch: fetchImagen });
      const dos = await aprobarFotoWeb(tester, resultadoWeb(21), [`${tag} limon`, "verde"], { fetch: fetchImagen });
      await aprobarFotoWeb(tester, resultadoWeb(22), ["otra cosa"], { fetch: fetchImagen });

      const r = await buscarEnBanco(tester, `Limones verdes ${tag}s (kg)`, {});
      expect(r.data.map((f) => f.id)).toEqual([dos.id, una.id]);
      expect(r.total).toBe(2);
    });

    it("mejorFotoDelBanco devuelve la mejor aprobada o null", async () => {
      const tester = await usuario({ esTester: true });
      const tag = `mfb${Date.now()}`;
      await guardarFotoWeb(resultadoWeb(30), [tag], { estado: "pendiente", fetch: fetchImagen });
      expect(await mejorFotoDelBanco(`${tag} 1kg`)).toBeNull();

      const aprobada = await aprobarFotoWeb(tester, resultadoWeb(31), [tag], { fetch: fetchImagen });
      expect((await mejorFotoDelBanco(`${tag} 1kg`))?.id).toBe(aprobada.id);
    });
  });

  describe("revisarFoto", () => {
    it("un curador aprueba una subida pendiente y cambia etiquetas", async () => {
      const admin = await usuario({ esAdmin: true });
      const premium = await vendedor("premium");
      const propia = await subirFotoBanco(premium, JPG, etiquetas("queso"));

      const revisada = await revisarFoto(admin, propia.id, { estado: "aprobada", etiquetas: etiquetas("queso", "cremoso") });
      expect(revisada.estado).toBe("aprobada");
      expect(revisada.etiquetas).toEqual([PREFIJO, "queso", "cremoso"]);
      const db = await prisma.fotoBanco.findUniqueOrThrow({ where: { id: propia.id } });
      expect(db.revisadaPorId).toBe(admin.id);
      expect(db.revisadaEn).not.toBeNull();
    });

    it("SOLO_CURADORES, FOTO_NO_ENCONTRADA y ESTADO_FOTO_INVALIDO", async () => {
      const tester = await usuario({ esTester: true });
      const premium = await vendedor("premium");
      const propia = await subirFotoBanco(premium, JPG, etiquetas());

      await expect(revisarFoto(premium, propia.id, { estado: "aprobada" })).rejects.toMatchObject({ code: "SOLO_CURADORES" });
      await expect(revisarFoto(tester, crypto.randomUUID(), { estado: "aprobada" })).rejects.toMatchObject({
        code: "FOTO_NO_ENCONTRADA",
      });
      await expect(
        revisarFoto(tester, propia.id, { estado: "pendiente" as "aprobada" })
      ).rejects.toMatchObject({ code: "ESTADO_FOTO_INVALIDO" });
    });
  });

  describe("usarFoto", () => {
    it("un vendedor free usa una foto curada en un catálogo sin foto y suma foto_cargada", async () => {
      const tester = await usuario({ esTester: true });
      const free = await vendedor("free");
      const foto = await aprobarFotoWeb(tester, resultadoWeb(40), ["tomate"], { fetch: fetchImagen });
      const c = await catalogo();

      expect(await usarFoto(free, foto.id, { catalogoId: c.id })).toEqual({ imagenUrl: foto.url });
      expect((await prisma.productoCatalogo.findUniqueOrThrow({ where: { id: c.id } })).imagenUrl).toBe(foto.url);
      const eventos = await prisma.eventoPuntos.count({ where: { usuarioId: free.id, tipo: "foto_cargada" } });
      expect(eventos).toBe(1);
    });

    it("CATALOGO_YA_TIENE_FOTO para no-admin; el admin reemplaza", async () => {
      const admin = await usuario({ esAdmin: true });
      const free = await vendedor("free");
      const foto = await aprobarFotoWeb(admin, resultadoWeb(41), ["tomate"], { fetch: fetchImagen });
      const c = await catalogo("http://vieja.jpg");

      await expect(usarFoto(free, foto.id, { catalogoId: c.id })).rejects.toMatchObject({ code: "CATALOGO_YA_TIENE_FOTO" });
      await usarFoto(admin, foto.id, { catalogoId: c.id });
      expect((await prisma.productoCatalogo.findUniqueOrThrow({ where: { id: c.id } })).imagenUrl).toBe(foto.url);
    });

    it("FORBIDDEN para quien no es vendedor ni curador; 404 si la foto no es visible", async () => {
      const tester = await usuario({ esTester: true });
      const comprador = await usuario();
      const premium = await vendedor("premium");
      const free = await vendedor("free");
      const curada = await aprobarFotoWeb(tester, resultadoWeb(42), ["tomate"], { fetch: fetchImagen });
      const propia = await subirFotoBanco(premium, JPG, etiquetas());
      const c = await catalogo();

      await expect(usarFoto(comprador, curada.id, { catalogoId: c.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(usarFoto(free, propia.id, { catalogoId: c.id })).rejects.toMatchObject({ code: "FOTO_NO_ENCONTRADA" });
    });

    it("en un producto propio: solo premium y dueño", async () => {
      const tester = await usuario({ esTester: true });
      const premium = await vendedor("premium");
      const free = await vendedor("free");
      const foto = await aprobarFotoWeb(tester, resultadoWeb(43), ["tomate"], { fetch: fetchImagen });
      const c = await catalogo();
      const productoPremium = await prisma.producto.create({
        data: { tiendaId: premium.tiendaId, catalogoId: c.id, nombre: "Tomate", precio: 100, stock: 1 },
      });
      const productoFree = await prisma.producto.create({
        data: { tiendaId: free.tiendaId, catalogoId: c.id, nombre: "Tomate", precio: 100, stock: 1 },
      });

      expect(await usarFoto(premium, foto.id, { productoId: productoPremium.id })).toEqual({ imagenUrl: foto.url });
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: productoPremium.id } })).imagenUrl).toBe(foto.url);
      await expect(usarFoto(free, foto.id, { productoId: productoFree.id })).rejects.toMatchObject({ code: "FOTOS_SOLO_PREMIUM" });
      await expect(usarFoto(free, foto.id, { productoId: productoPremium.id })).rejects.toMatchObject({
        code: "NO_ES_DUENO_DE_TIENDA",
      });
    });

    it("DESTINO_INVALIDO sin catalogoId ni productoId", async () => {
      const tester = await usuario({ esTester: true });
      const foto = await aprobarFotoWeb(tester, resultadoWeb(44), ["tomate"], { fetch: fetchImagen });
      await expect(usarFoto(tester, foto.id, {} as { catalogoId: string })).rejects.toMatchObject({ code: "DESTINO_INVALIDO" });
    });
  });
});

describe("permisos, filtro por estado y catálogo sin foto", () => {
  const usuarios: string[] = [];
  const catalogos: string[] = [];
  let n = 0;
  afterEach(async () => {
    await prisma.fotoBanco.deleteMany({ where: { OR: [{ origenUrl: { contains: PREFIJO } }, { etiquetas: { has: PREFIJO } }] } });
    await prisma.producto.deleteMany({ where: { catalogoId: { in: catalogos } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogos.splice(0) } } });
    const ids = usuarios.splice(0);
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  });
  async function usuario(flags: { esAdmin?: boolean; esTester?: boolean } = {}): Promise<Usuario> {
    n += 1;
    const u = await registrarUsuario({ email: `${PREFIJO}-p${n}@almacenia.test`, password: "password123", nombre: "U" });
    usuarios.push(u.id);
    await prisma.usuario.update({ where: { id: u.id }, data: flags });
    return { ...u, ...flags };
  }

  it("permisosFotos resume fuentes, curador y si puede subir", async () => {
    const tester = await usuario({ esTester: true });
    const premium = await usuario();
    const t = await crearTienda(premium, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    await prisma.tienda.update({ where: { id: t.id }, data: { plan: "premium" } });
    const comprador = await usuario();

    expect(await permisosFotos(tester)).toEqual({ fuentes: ["web", "curado", "subidas", "propias"], curador: true, puedeSubir: true });
    expect(await permisosFotos(premium)).toEqual({ fuentes: ["curado", "subidas", "propias"], curador: false, puedeSubir: true });
    expect(await permisosFotos(comprador)).toEqual({ fuentes: ["curado"], curador: false, puedeSubir: false });
  });

  it("buscarEnBanco filtra por estado (cola de pendientes)", async () => {
    const tester = await usuario({ esTester: true });
    const tag = `est${Date.now()}`;
    const pendiente = await guardarFotoWeb(resultadoWeb(50), [tag], { estado: "pendiente", fetch: fetchImagen });
    await aprobarFotoWeb(tester, resultadoWeb(51), [tag], { fetch: fetchImagen });
    const r = await buscarEnBanco(tester, tag, { estado: "pendiente" });
    expect(r.data.map((f) => f.id)).toEqual([pendiente.id]);
  });

  it("catalogoSinFoto: solo curadores, entradas sin foto filtradas por q", async () => {
    const tester = await usuario({ esTester: true });
    const comprador = await usuario();
    const sin = await prisma.productoCatalogo.create({ data: { nombre: `${PREFIJO} Sin foto` } });
    const con = await prisma.productoCatalogo.create({ data: { nombre: `${PREFIJO} Con foto`, imagenUrl: "http://x.jpg" } });
    catalogos.push(sin.id, con.id);

    const r = await catalogoSinFoto(tester, { q: PREFIJO });
    expect(r.data.map((c) => c.id)).toEqual([sin.id]);
    expect(r.total).toBe(1);
    await expect(catalogoSinFoto(comprador, {})).rejects.toMatchObject({ code: "SOLO_CURADORES" });
  });
});
