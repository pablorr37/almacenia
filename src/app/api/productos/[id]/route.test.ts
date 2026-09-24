import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/productos/[id]", () => {
  let dueno: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    dueno = await registrarUsuario({
      email: `test-producto-id-dueno-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Dueño",
    });
    otro = await registrarUsuario({
      email: `test-producto-id-otro-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Otro",
    });
    tienda = await crearTienda(dueno, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(dueno, tienda.id, { nuevo: { nombre: "Producto" }, precio: 100, stock: 10 });
  });

  afterEach(async () => {
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: [dueno.id, otro.id] } } });
    await prisma.usuario.deleteMany({ where: { id: { in: [dueno.id, otro.id] } } });
    vi.clearAllMocks();
  });

  describe("PATCH", () => {
    function req(body: unknown) {
      return new NextRequest("http://localhost/api/productos/x", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    }

    it("403 NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(otro);
      const res = await PATCH(req({ precio: 200 }), params(producto.id));
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error.code).toBe("NO_ES_DUENO_DE_TIENDA");
    });

    it("200 actualiza el producto si es el dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await PATCH(req({ precio: 200 }), params(producto.id));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.precio).toBe(200);
    });

    it("404 PRODUCTO_NO_ENCONTRADO si no existe", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await PATCH(req({ precio: 200 }), params("00000000-0000-0000-0000-000000000000"));
      const body = await res.json();
      expect(res.status).toBe(404);
      expect(body.error.code).toBe("PRODUCTO_NO_ENCONTRADO");
    });
  });

  describe("DELETE", () => {
    it("200 marca disponible=false y stock=0 (borrado lógico)", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(dueno);
      const res = await DELETE(new NextRequest("http://localhost/api/productos/x"), params(producto.id));
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.data.disponible).toBe(false);
      expect(body.data.stock).toBe(0);
    });
  });
});
