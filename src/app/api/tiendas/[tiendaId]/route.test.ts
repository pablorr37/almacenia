import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(tiendaId: string) {
  return { params: Promise.resolve({ tiendaId }) };
}

describe("/api/tiendas/[tiendaId]", () => {
  let dueno: Usuario;
  let otro: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    dueno = await registrarUsuario({
      email: `test-tienda-id-dueno-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Dueño",
    });
    otro = await registrarUsuario({
      email: `test-tienda-id-otro-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Otro",
    });
    tienda = await crearTienda(dueno, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
  });

  afterEach(async () => {
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: [dueno.id, otro.id] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [dueno.id, otro.id] } } });
    vi.clearAllMocks();
  });

  describe("GET", () => {
    it("200 con la tienda, es público", async () => {
      const res = await GET(new NextRequest("http://localhost/api/tiendas/x"), params(tienda.id));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.id).toBe(tienda.id);
    });

    it("404 TIENDA_NO_ENCONTRADA si no existe", async () => {
      const res = await GET(
        new NextRequest("http://localhost/api/tiendas/x"),
        params("00000000-0000-0000-0000-000000000000"),
      );
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error.code).toBe("TIENDA_NO_ENCONTRADA");
    });
  });

  describe("PATCH", () => {
    function patchReq(body: unknown) {
      return new NextRequest("http://localhost/api/tiendas/x", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }

    it("401 sin sesión", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(null);

      const res = await PATCH(patchReq({ nombre: "Nuevo nombre" }), params(tienda.id));
      expect(res.status).toBe(401);
    });

    it("403 NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(otro);

      const res = await PATCH(patchReq({ nombre: "Nuevo nombre" }), params(tienda.id));
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error.code).toBe("NO_ES_DUENO_DE_TIENDA");
    });

    it("200 actualiza la tienda si es el dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);

      const res = await PATCH(patchReq({ nombre: "Nombre actualizado" }), params(tienda.id));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.nombre).toBe("Nombre actualizado");
    });
  });
});
