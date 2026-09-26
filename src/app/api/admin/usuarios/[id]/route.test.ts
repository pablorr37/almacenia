import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { marcarTester } from "@/lib/admin/usuarios";
import { PATCH } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/admin/usuarios", () => ({ marcarTester: vi.fn() }));

const admin: Usuario = {
  id: "a", email: "a@a.com", nombre: "A", esComprador: true, esVendedor: false,
  esAdmin: true, esTester: false, avatarUrl: null,
};
const req = (body: unknown) => new NextRequest("http://l/api/admin/usuarios/u1", { method: "PATCH", body: JSON.stringify(body) });
const params = { params: Promise.resolve({ id: "u1" }) };

afterEach(() => vi.clearAllMocks());

describe("PATCH /api/admin/usuarios/:id", () => {
  it("401 sin sesión", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await PATCH(req({ esTester: true }), params)).status).toBe(401);
  });

  it("200 marca tester", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(marcarTester).mockResolvedValue({ id: "u1", esTester: true } as never);
    const res = await PATCH(req({ esTester: true }), params);
    expect(res.status).toBe(200);
    expect(marcarTester).toHaveBeenCalledWith(admin, "u1", true);
  });

  it("403 si no es admin", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue({ ...admin, esAdmin: false });
    vi.mocked(marcarTester).mockRejectedValue(new AppError("FORBIDDEN", "x"));
    expect((await PATCH(req({ esTester: true }), params)).status).toBe(403);
  });
});
