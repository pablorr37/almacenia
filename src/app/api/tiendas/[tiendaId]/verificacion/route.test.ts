import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(tiendaId: string) {
  return { params: Promise.resolve({ tiendaId }) };
}

describe("POST /api/tiendas/[tiendaId]/verificacion", () => {
  let dueno: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    dueno = await registrarUsuario({
      email: `test-verif-route-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Dueño",
    });
    tienda = await crearTienda(dueno, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
  });

  afterEach(async () => {
    await prisma.solicitudVerificacion.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: dueno.id } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST" }), params(tienda.id));
    expect(res.status).toBe(401);
  });

  it("201 crea la solicitud pendiente", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(dueno);
    const res = await POST(new NextRequest("http://localhost/x", { method: "POST" }), params(tienda.id));
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.data.estado).toBe("pendiente");
  });
});
