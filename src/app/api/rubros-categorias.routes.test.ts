import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import * as rc from "@/lib/rubros-categorias/rubros-categorias";
import { GET as getRubros } from "./rubros/route";
import { GET as getCategorias } from "./categorias/route";
import { POST as postRubro } from "./admin/rubros/route";
import { PATCH as patchRubro, DELETE as deleteRubro } from "./admin/rubros/[id]/route";
import { POST as postCategoria } from "./admin/categorias/route";
import { PATCH as patchCategoria, DELETE as deleteCategoria } from "./admin/categorias/[id]/route";

// 17-rubros-categorias.md — rutas finas: delegan en src/lib/rubros-categorias.
vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/rubros-categorias/rubros-categorias", () => ({
  listarRubros: vi.fn(),
  crearRubro: vi.fn(),
  actualizarRubro: vi.fn(),
  eliminarRubro: vi.fn(),
  listarCategorias: vi.fn(),
  crearCategoria: vi.fn(),
  actualizarCategoria: vi.fn(),
  eliminarCategoria: vi.fn(),
}));

const admin: Usuario = {
  id: "a", email: "a@a.com", nombre: "A", esComprador: true, esVendedor: false,
  esAdmin: true, esTester: false, avatarUrl: null,
};
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://l${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

afterEach(() => vi.clearAllMocks());

describe("lectura pública", () => {
  it("GET /api/rubros y /api/categorias?q= sin sesión", async () => {
    vi.mocked(rc.listarRubros).mockResolvedValue([{ id: "r", nombre: "Kiosco", orden: 1 }]);
    vi.mocked(rc.listarCategorias).mockResolvedValue([{ id: "c", nombre: "Arroz" }]);
    const r = await getRubros();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ data: [{ id: "r", nombre: "Kiosco", orden: 1 }] });
    const c = await getCategorias(req("/api/categorias?q=arr"));
    expect(await c.json()).toEqual({ data: [{ id: "c", nombre: "Arroz" }] });
    expect(rc.listarCategorias).toHaveBeenCalledWith("arr");
  });
});

describe("ABM del admin", () => {
  it("401 sin sesión", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await postRubro(req("/api/admin/rubros", "POST", { nombre: "Vivero" }))).status).toBe(401);
    expect((await deleteCategoria(req("/api/admin/categorias/c", "DELETE"), ctx("c"))).status).toBe(401);
  });

  it("crea (201), edita, borra y mapea los errores", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(rc.crearRubro).mockResolvedValue({ id: "r", nombre: "Vivero", orden: 3 });
    const creado = await postRubro(req("/api/admin/rubros", "POST", { nombre: "Vivero", orden: 3 }));
    expect(creado.status).toBe(201);
    expect(rc.crearRubro).toHaveBeenCalledWith(admin, { nombre: "Vivero", orden: 3 });

    vi.mocked(rc.actualizarRubro).mockResolvedValue({ id: "r", nombre: "Viveros", orden: 3 });
    expect((await patchRubro(req("/api/admin/rubros/r", "PATCH", { nombre: "Viveros" }), ctx("r"))).status).toBe(200);
    expect(rc.actualizarRubro).toHaveBeenCalledWith(admin, "r", { nombre: "Viveros", orden: undefined });

    vi.mocked(rc.eliminarRubro).mockRejectedValue(new AppError("RUBRO_EN_USO", "x"));
    expect((await deleteRubro(req("/api/admin/rubros/r", "DELETE"), ctx("r"))).status).toBe(409);

    vi.mocked(rc.crearCategoria).mockRejectedValue(new AppError("NOMBRE_DUPLICADO", "x"));
    expect((await postCategoria(req("/api/admin/categorias", "POST", { nombre: "Arroz" }))).status).toBe(409);

    vi.mocked(rc.actualizarCategoria).mockRejectedValue(new AppError("CATEGORIA_NO_ENCONTRADA", "x"));
    expect((await patchCategoria(req("/api/admin/categorias/c", "PATCH", { nombre: "X" }), ctx("c"))).status).toBe(404);

    vi.mocked(rc.eliminarCategoria).mockResolvedValue(undefined);
    const borrada = await deleteCategoria(req("/api/admin/categorias/c", "DELETE"), ctx("c"));
    expect(await borrada.json()).toEqual({ data: { id: "c" } });

    vi.mocked(rc.crearRubro).mockRejectedValue(new AppError("FORBIDDEN", "x"));
    expect((await postRubro(req("/api/admin/rubros", "POST", { nombre: "X" }))).status).toBe(403);
  });
});
