import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { verificarTiendaAdmin } from "@/lib/admin/tiendas";
import { PATCH } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/admin/tiendas", () => ({ verificarTiendaAdmin: vi.fn() }));

const admin: Usuario = {
  id: "a", email: "a@a.com", nombre: "A", esComprador: true, esVendedor: false,
  esAdmin: true, esTester: false, avatarUrl: null,
};
const req = (body: unknown) => new NextRequest("http://l/api/admin/tiendas/t1/verificacion", { method: "PATCH", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "t1" }) };

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/admin/tiendas/:id/verificacion", () => {
  it("401 sin sesión", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await PATCH(req({ verificada: true }), params)).status).toBe(401);
  });

  it("200 verifica la tienda", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(verificarTiendaAdmin).mockResolvedValue({ id: "t1", verificada: true });
    const res = await PATCH(req({ verificada: true }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { id: "t1", verificada: true } });
    expect(verificarTiendaAdmin).toHaveBeenCalledWith(admin, "t1", true);
  });

  it("403 si no es admin", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue({ ...admin, esAdmin: false });
    vi.mocked(verificarTiendaAdmin).mockRejectedValue(new AppError("FORBIDDEN", "x"));
    expect((await PATCH(req({ verificada: true }), params)).status).toBe(403);
  });
});
