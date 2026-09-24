import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { subirArchivo } from "@/lib/archivos/archivos";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/archivos/archivos", async () => {
  const actual = await vi.importActual<typeof import("@/lib/archivos/archivos")>("@/lib/archivos/archivos");
  return { ...actual, subirArchivo: vi.fn() };
});

const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);
const subirArchivoMock = vi.mocked(subirArchivo);

function reqConArchivo(url: string) {
  const form = new FormData();
  form.set("archivo", new Blob(["contenido"], { type: "image/jpeg" }), "foto.jpg");
  return new NextRequest(url, { method: "POST", body: form });
}

describe("POST /api/archivos/upload", () => {
  let dueno: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    dueno = await registrarUsuario({
      email: `test-archivos-dueno-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Dueño",
    });
    otro = await registrarUsuario({
      email: `test-archivos-otro-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Otro",
    });
    tienda = await crearTienda(dueno, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(dueno, tienda.id, { nuevo: { nombre: "Producto" }, precio: 100, stock: 5 });
    subirArchivoMock.mockResolvedValue({ url: "http://localhost:9000/almacenia/productos/x/y.jpg" });
  });

  afterEach(async () => {
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [dueno.id, otro.id] } } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    const res = await POST(reqConArchivo(`http://localhost/api/archivos/upload?tipo=avatar`));
    expect(res.status).toBe(401);
  });

  it("201 sube el avatar propio", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(dueno);
    const res = await POST(reqConArchivo(`http://localhost/api/archivos/upload?tipo=avatar`));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.url).toBeTruthy();
  });

  it("201 sube la foto de la tienda propia", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(dueno);
    const res = await POST(
      reqConArchivo(`http://localhost/api/archivos/upload?tipo=tienda&entidadId=${tienda.id}`)
    );
    expect(res.status).toBe(201);
  });

  it("403 NO_ES_DUENO_DE_TIENDA al subir foto de una tienda ajena", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(otro);
    const res = await POST(
      reqConArchivo(`http://localhost/api/archivos/upload?tipo=tienda&entidadId=${tienda.id}`)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("NO_ES_DUENO_DE_TIENDA");
  });

  it("201 sube la foto de un producto propio", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(dueno);
    const res = await POST(
      reqConArchivo(`http://localhost/api/archivos/upload?tipo=producto&entidadId=${producto.id}`)
    );
    expect(res.status).toBe(201);
  });

  it("400 TIPO_ARCHIVO_INVALIDO sin entidadId para tipo=tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(dueno);
    const res = await POST(reqConArchivo(`http://localhost/api/archivos/upload?tipo=tienda`));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("TIPO_ARCHIVO_INVALIDO");
  });

  describe("límite de fotos del plan free", () => {
    let productosExtra: Producto[];

    beforeEach(async () => {
      // La tienda ya tiene 1 producto ("producto", sin foto) del beforeEach de
      // arriba. Se agregan 2 más y se les asigna foto directo en la DB (no importa
      // el mecanismo de subida acá, solo que imagenUrl quede no nulo) para llegar
      // a las 3 fotos que permite el plan free antes de la prueba.
      productosExtra = await Promise.all(
        [1, 2].map((i) =>
          crearProducto(dueno, tienda.id, { nuevo: { nombre: `Extra ${i}` }, precio: 10, stock: 1 })
        )
      );
      await prisma.producto.updateMany({
        where: { id: { in: productosExtra.map((p) => p.id) } },
        data: { imagenUrl: "http://localhost:9000/x.jpg" },
      });
      await prisma.producto.update({ where: { id: producto.id }, data: { imagenUrl: "http://localhost:9000/x.jpg" } });
    });

    afterEach(async () => {
      // Se borran los productos extra antes que su catálogo (FK) — el afterEach
      // del describe exterior, que borra el resto de los productos de la tienda,
      // corre después de este (los hooks anidados corren de adentro hacia afuera).
      await prisma.producto.deleteMany({ where: { id: { in: productosExtra.map((p) => p.id) } } });
      await prisma.productoCatalogo.deleteMany({ where: { id: { in: productosExtra.map((p) => p.catalogoId) } } });
    });

    it("409 LIMITE_FOTOS_PLAN_FREE al querer poner foto a un 4to producto", async () => {
      const cuarto = await crearProducto(dueno, tienda.id, { nuevo: { nombre: "Cuarto" }, precio: 10, stock: 1 });

      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        reqConArchivo(`http://localhost/api/archivos/upload?tipo=producto&entidadId=${cuarto.id}`)
      );
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.error.code).toBe("LIMITE_FOTOS_PLAN_FREE");

      await prisma.producto.deleteMany({ where: { id: cuarto.id } });
      await prisma.productoCatalogo.deleteMany({ where: { id: cuarto.catalogoId } });
    });

    it("permite reemplazar la foto de un producto que ya tenía, sin contar contra el límite", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        reqConArchivo(`http://localhost/api/archivos/upload?tipo=producto&entidadId=${producto.id}`)
      );
      expect(res.status).toBe(201);
    });

    it("no aplica el límite si la tienda es premium", async () => {
      await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
      const cuarto = await crearProducto(dueno, tienda.id, { nuevo: { nombre: "Cuarto premium" }, precio: 10, stock: 1 });

      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        reqConArchivo(`http://localhost/api/archivos/upload?tipo=producto&entidadId=${cuarto.id}`)
      );
      expect(res.status).toBe(201);

      await prisma.producto.deleteMany({ where: { id: cuarto.id } });
      await prisma.productoCatalogo.deleteMany({ where: { id: cuarto.catalogoId } });
    });
  });
});
