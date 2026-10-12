import type { Usuario } from "@/lib/auth/auth";
import { AppError } from "@/lib/errors";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { diagnosticar } from "@/lib/admin/diagnostico";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
vi.mock("@/lib/admin/diagnostico", () => ({ diagnosticar: vi.fn() }));

const admin: Usuario = {
  id: "a", email: "a@a.com", nombre: "A", esComprador: true, esVendedor: false,
  esAdmin: true, esTester: false, avatarUrl: null,
};

describe("GET /api/admin/diagnostico", () => {
  it("401 sin sesión; 200 con el diagnóstico; 403 si no es admin", async () => {
    vi.mocked(obtenerUsuarioActual).mockResolvedValue(null);
    expect((await GET()).status).toBe(401);

    vi.mocked(obtenerUsuarioActual).mockResolvedValue(admin);
    vi.mocked(diagnosticar).mockResolvedValue({ db: "ok", almacenamiento: { ok: true, bucket: "b", endpoint: "e", lecturaPublica: true } });
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data.db).toBe("ok");

    vi.mocked(diagnosticar).mockRejectedValue(new AppError("FORBIDDEN", "x"));
    expect((await GET()).status).toBe(403);
  });
});
