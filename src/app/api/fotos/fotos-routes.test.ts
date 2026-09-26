// Rutas del banco de fotos (16-banco-fotos.md): parseo, sesión y mapeo de errores.
// La lógica (permisos, visibilidad) está testeada en src/lib/fotos/.
import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import * as banco from "@/lib/fotos/banco";
import * as web from "@/lib/fotos/buscador-web";
import { GET as getBanco, POST as postBanco } from "./banco/route";
import { PATCH as patchFoto } from "./banco/[id]/route";
import { POST as postUsar } from "./banco/[id]/usar/route";
import { GET as getWeb } from "./web/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/fotos/banco", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/fotos/banco")>();
  return {
    ...real,
    buscarEnBanco: vi.fn(),
    aprobarFotoWeb: vi.fn(),
    subirFotoBanco: vi.fn(),
    revisarFoto: vi.fn(),
    usarFoto: vi.fn(),
  };
});
vi.mock("@/lib/fotos/buscador-web", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/fotos/buscador-web")>()),
  buscarWeb: vi.fn(),
}));

const sesion = vi.mocked(obtenerUsuarioActual);
const usuario: Usuario = {
  id: "u1", email: "u@u.com", nombre: "U", esComprador: true, esVendedor: true,
  esAdmin: false, esTester: false, avatarUrl: null,
};
const tester: Usuario = { ...usuario, esTester: true };
const foto = { id: "f1", url: "http://b/f1.jpg" };
const params = { params: Promise.resolve({ id: "f1" }) };

function json(url: string, method: string, body?: unknown) {
  return new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
}

afterEach(() => vi.clearAllMocks());

describe("GET /api/fotos/banco", () => {
  it("401 sin sesión", async () => {
    sesion.mockResolvedValue(null);
    expect((await getBanco(json("http://l/api/fotos/banco?q=tomate", "GET"))).status).toBe(401);
  });

  it("200 paginado con q", async () => {
    sesion.mockResolvedValue(usuario);
    vi.mocked(banco.buscarEnBanco).mockResolvedValue({ data: [foto as never], page: 2, pageSize: 10, total: 11 });
    const res = await getBanco(json("http://l/api/fotos/banco?q=tomate&page=2&pageSize=10", "GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [foto], page: 2, pageSize: 10, total: 11 });
    expect(banco.buscarEnBanco).toHaveBeenCalledWith(usuario, "tomate", { page: 2, pageSize: 10 });
  });
});

describe("GET /api/fotos/web", () => {
  it("403 SOLO_CURADORES para no curadores", async () => {
    sesion.mockResolvedValue(usuario);
    const res = await getWeb(json("http://l/api/fotos/web?q=tomate", "GET"));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("SOLO_CURADORES");
    expect(web.buscarWeb).not.toHaveBeenCalled();
  });

  it("200 para curadores; 502 si la fuente falla", async () => {
    sesion.mockResolvedValue(tester);
    vi.mocked(web.buscarWeb).mockResolvedValue([]);
    expect((await getWeb(json("http://l/api/fotos/web?q=tomate", "GET"))).status).toBe(200);
    vi.mocked(web.buscarWeb).mockRejectedValue(new AppError("FUENTE_EXTERNA_NO_DISPONIBLE", "x"));
    expect((await getWeb(json("http://l/api/fotos/web?q=tomate", "GET"))).status).toBe(502);
  });
});

describe("POST /api/fotos/banco", () => {
  it("JSON: aprueba una foto web → 201", async () => {
    sesion.mockResolvedValue(tester);
    vi.mocked(banco.aprobarFotoWeb).mockResolvedValue(foto as never);
    const resultado = { origenUrl: "o", imagenUrl: "i" };
    const res = await postBanco(json("http://l/api/fotos/banco", "POST", { resultado, etiquetas: ["tomate"] }));
    expect(res.status).toBe(201);
    expect(banco.aprobarFotoWeb).toHaveBeenCalledWith(tester, resultado, ["tomate"]);
  });

  it("JSON sin resultado válido → 400", async () => {
    sesion.mockResolvedValue(tester);
    const res = await postBanco(json("http://l/api/fotos/banco", "POST", { etiquetas: ["x"] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("RESULTADO_WEB_INVALIDO");
  });

  it("multipart: sube una foto propia con etiquetas separadas por coma → 201", async () => {
    sesion.mockResolvedValue(usuario);
    vi.mocked(banco.subirFotoBanco).mockResolvedValue(foto as never);
    const form = new FormData();
    form.set("archivo", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "x.png");
    form.set("etiquetas", "queso, cremoso");
    const res = await postBanco(new NextRequest("http://l/api/fotos/banco", { method: "POST", body: form }));
    expect(res.status).toBe(201);
    const [u, archivo, etiquetas] = vi.mocked(banco.subirFotoBanco).mock.calls[0];
    expect(u).toBe(usuario);
    expect(archivo.contentType).toBe("image/png");
    expect(archivo.buffer.byteLength).toBe(3);
    expect(etiquetas).toEqual(["queso", "cremoso"]);
  });
});

describe("PATCH /api/fotos/banco/:id y POST /usar", () => {
  it("PATCH revisa la foto", async () => {
    sesion.mockResolvedValue(tester);
    vi.mocked(banco.revisarFoto).mockResolvedValue(foto as never);
    const res = await patchFoto(json("http://l/api/fotos/banco/f1", "PATCH", { estado: "aprobada" }), params);
    expect(res.status).toBe(200);
    expect(banco.revisarFoto).toHaveBeenCalledWith(tester, "f1", { estado: "aprobada", etiquetas: undefined });
  });

  it("POST usar con catalogoId → 200; errores mapeados", async () => {
    sesion.mockResolvedValue(usuario);
    vi.mocked(banco.usarFoto).mockResolvedValue({ imagenUrl: foto.url });
    const res = await postUsar(json("http://l/api/fotos/banco/f1/usar", "POST", { catalogoId: "c1" }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { imagenUrl: foto.url } });
    expect(banco.usarFoto).toHaveBeenCalledWith(usuario, "f1", { catalogoId: "c1" });

    vi.mocked(banco.usarFoto).mockRejectedValue(new AppError("CATALOGO_YA_TIENE_FOTO", "x"));
    expect((await postUsar(json("http://l/x", "POST", { catalogoId: "c1" }), params)).status).toBe(409);
  });
});
