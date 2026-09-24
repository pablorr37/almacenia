import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { POST, GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(tiendaId: string) {
  return { params: Promise.resolve({ tiendaId }) };
}

describe("/api/tiendas/[tiendaId]/productos", () => {
  let dueno: Usuario;
  let otro: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    dueno = await registrarUsuario({
      email: `test-productos-dueno-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Dueño",
    });
    otro = await registrarUsuario({
      email: `test-productos-otro-${Date.now()}@almacenia.test`,
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
    await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: tienda.id } } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: [dueno.id, otro.id] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [dueno.id, otro.id] } } });
    vi.clearAllMocks();
  });

  describe("POST", () => {
    function req(body: unknown) {
      return new NextRequest("http://localhost/api/tiendas/x/productos", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("401 sin sesión", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(null);
      const res = await POST(req({ nuevo: { nombre: "X" }, precio: 10, stock: 5 }), params(tienda.id));
      expect(res.status).toBe(401);
    });

    it("403 NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(otro);
      const res = await POST(req({ nuevo: { nombre: "X" }, precio: 10, stock: 5 }), params(tienda.id));
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error.code).toBe("NO_ES_DUENO_DE_TIENDA");
    });

    it("201 crea el producto, disponible=true por defecto", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await POST(
        req({ nuevo: { nombre: "Lechuga fresca" }, precio: 250, stock: 12 }),
        params(tienda.id),
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data).toMatchObject({ nombre: "Lechuga fresca", precio: 250, stock: 12, disponible: true });
    });
  });

  describe("GET", () => {
    it("200 público, paginado, con soloDisponibles filtrando por comprable", async () => {
      await crearProducto(dueno, tienda.id, { nuevo: { nombre: "Disponible" }, precio: 100, stock: 5 });
      await crearProducto(dueno, tienda.id, { nuevo: { nombre: "Sin stock" }, precio: 100, stock: 0 });

      const res = await GET(
        new NextRequest(`http://localhost/api/tiendas/x/productos?soloDisponibles=true`),
        params(tienda.id),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.pageSize).toBe(20);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].nombre).toBe("Disponible");
    });
  });
});
