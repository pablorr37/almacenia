import { NextRequest } from "next/server";
import { AppError } from "@/lib/errors";
import type { Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { marcarTester, cambiarEstadoCuenta, eliminarUsuario } from "@/lib/admin/usuarios";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/admin/usuarios", () => ({ marcarTester: vi.fn(), cambiarEstadoCuenta: vi.fn(), eliminarUsuario: vi.fn() }));

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

  it("200 cambia el estado de cuenta con motivo", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(cambiarEstadoCuenta).mockResolvedValue({ id: "u1", estadoCuenta: "baneada" } as never);
    const res = await PATCH(req({ estadoCuenta: "baneada", motivo: "Spam" }), params);
    expect(res.status).toBe(200);
    expect(cambiarEstadoCuenta).toHaveBeenCalledWith(admin, "u1", "baneada", "Spam");
    expect(marcarTester).not.toHaveBeenCalled();
  });

  it("DELETE elimina con confirmación; 409 sobre sí mismo", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(eliminarUsuario).mockResolvedValue({ id: "u1" });
    const del = (body: unknown) => new NextRequest("http://l/api/admin/usuarios/u1", { method: "DELETE", body: JSON.stringify(body) });
    const res = await DELETE(del({ confirmacionEmail: "u@u.com" }), params);
    expect(res.status).toBe(200);
    expect(eliminarUsuario).toHaveBeenCalledWith(admin, "u1", "u@u.com");

    vi.mocked(eliminarUsuario).mockRejectedValue(new AppError("ACCION_SOBRE_SI_MISMO", "x"));
    expect((await DELETE(del({ confirmacionEmail: "a@a.com" }), params)).status).toBe(409);
  });
});
