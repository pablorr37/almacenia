import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("GET /api/tiendas/mia", () => {
  let usuario: Usuario;

  beforeEach(async () => {
    usuario = await registrarUsuario({
      email: `test-tienda-mia-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { vendedorId: usuario.id } });
    await prisma.usuario.deleteMany({ where: { id: usuario.id } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("404 TIENDA_NO_ENCONTRADA si el usuario no tiene tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(usuario);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("TIENDA_NO_ENCONTRADA");
  });

  it("200 con la tienda del usuario autenticado", async () => {
    const tienda = await crearTienda(usuario, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    obtenerUsuarioActualMock.mockResolvedValue(usuario);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe(tienda.id);
  });
});
