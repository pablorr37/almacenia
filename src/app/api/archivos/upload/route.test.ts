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

  it("403 FOTOS_SOLO_PREMIUM al subir foto propia de un producto con tienda free", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(dueno);
    const res = await POST(
      reqConArchivo(`http://localhost/api/archivos/upload?tipo=producto&entidadId=${producto.id}`)
    );
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FOTOS_SOLO_PREMIUM");
  });

  it("201 sube la foto propia de un producto con tienda premium", async () => {
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
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

  describe("tipo=catalogo (foto compartida del producto)", () => {
    it("403 FOTOS_SOLO_PREMIUM con tienda free", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        reqConArchivo(`http://localhost/api/archivos/upload?tipo=catalogo&entidadId=${producto.catalogoId}`)
      );
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error.code).toBe("FOTOS_SOLO_PREMIUM");
    });

    it("201 con tienda premium si el catálogo no tiene foto", async () => {
      await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        reqConArchivo(`http://localhost/api/archivos/upload?tipo=catalogo&entidadId=${producto.catalogoId}`)
      );
      expect(res.status).toBe(201);
      expect(subirArchivoMock).toHaveBeenCalledWith(expect.objectContaining({ tipo: "catalogo", entidadId: producto.catalogoId }));
    });

    it("409 CATALOGO_YA_TIENE_FOTO con tienda premium si el catálogo ya tiene foto", async () => {
      await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
      await prisma.productoCatalogo.update({ where: { id: producto.catalogoId }, data: { imagenUrl: "http://s3/x.jpg" } });
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        reqConArchivo(`http://localhost/api/archivos/upload?tipo=catalogo&entidadId=${producto.catalogoId}`)
      );
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.error.code).toBe("CATALOGO_YA_TIENE_FOTO");
    });
  });
});
