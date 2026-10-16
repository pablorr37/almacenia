import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

// 18-alcance.md
describe("GET /api/alcance", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await registrarUsuario({ email: `test-api-alcance-${Date.now()}@almacenia.test`, password: "password123", nombre: "A" });
  });

  afterEach(async () => {
    await prisma.usuario.deleteMany({ where: { id: usuario.id } });
    vi.clearAllMocks();
  });

  it("sin sesión: invitado, sin caché", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).data).toMatchObject({ invitado: true, radioKm: 3 });
  });

  it("con sesión: plan y radio del usuario", async () => {
    await prisma.usuario.update({ where: { id: usuario.id }, data: { plan: "premium" } });
    obtenerUsuarioActualMock.mockResolvedValue(usuario);
    const body = await (await GET()).json();
    expect(body.data).toEqual({ invitado: false, plan: "premium", puntos: 0, radioKm: 15, provincia: false, proximoUmbral: null });
  });
});
