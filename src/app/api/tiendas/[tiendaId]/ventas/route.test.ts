import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { POST, GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(tiendaId: string) {
  return { params: Promise.resolve({ tiendaId }) };
}

describe("/api/tiendas/[tiendaId]/ventas", () => {
  let vendedor: Usuario;
  let otro: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-ventas-vendedor-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    otro = await registrarUsuario({
      email: `test-ventas-otro-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Otro",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(vendedor, tienda.id, { nombre: "Producto", precio: 100, stock: 10 });
  });

  afterEach(async () => {
    await prisma.itemVenta.deleteMany({});
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: vendedor.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, otro.id] } } });
    vi.clearAllMocks();
  });

  describe("POST", () => {
    function req(body: unknown) {
      return new NextRequest("http://localhost/api/tiendas/x/ventas", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("403 NO_ES_DUENO_DE_TIENDA si no es el dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(otro);
      const res = await POST(
        req({ items: [{ productoId: producto.id, cantidad: 1 }] }),
        params(tienda.id),
      );
      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error.code).toBe("NO_ES_DUENO_DE_TIENDA");
    });

    it("201 crea la venta presencial y debita stock", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(vendedor);
      const res = await POST(
        req({ items: [{ productoId: producto.id, cantidad: 3 }] }),
        params(tienda.id),
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data.origen).toBe("presencial");

      const actualizado = await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } });
      expect(actualizado.stock).toBe(7);
    });

    it("409 STOCK_INSUFICIENTE si pide más de lo disponible", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(vendedor);
      const res = await POST(
        req({ items: [{ productoId: producto.id, cantidad: 999 }] }),
        params(tienda.id),
      );
      const body = await res.json();
      expect(res.status).toBe(409);
      expect(body.error.code).toBe("STOCK_INSUFICIENTE");
    });
  });

  describe("GET", () => {
    it("200 lista paginada, requiere ser dueño de la tienda", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(vendedor);
      await POST(
        new NextRequest("http://localhost/api/tiendas/x/ventas", {
          method: "POST",
          body: JSON.stringify({ items: [{ productoId: producto.id, cantidad: 1 }] }),
        }),
        params(tienda.id),
      );

      const res = await GET(new NextRequest(`http://localhost/api/tiendas/x/ventas`), params(tienda.id));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data).toHaveLength(1);
    });
  });
});
