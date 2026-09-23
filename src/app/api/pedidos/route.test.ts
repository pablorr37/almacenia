import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { POST, GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("/api/pedidos", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-pedidos-vendedor-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    comprador = await registrarUsuario({
      email: `test-pedidos-comprador-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Comprador",
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
    await prisma.itemPedido.deleteMany({});
    await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: vendedor.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, comprador.id] } } });
    vi.clearAllMocks();
  });

  describe("POST", () => {
    function req(body: unknown) {
      return new NextRequest("http://localhost/api/pedidos", {
        method: "POST",
        body: JSON.stringify(body),
      });
    }

    it("401 sin sesión", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(null);
      const res = await POST(req({ tiendaId: tienda.id, items: [] }));
      expect(res.status).toBe(401);
    });

    it("201 crea el pedido en estado pendiente", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(comprador);
      const res = await POST(
        req({ tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 2 }] }),
      );
      const body = await res.json();

      expect(res.status).toBe(201);
      expect(body.data.estado).toBe("pendiente");
      expect(body.data.items).toHaveLength(1);
      expect(body.data.items[0].precioUnitario).toBe(100);
    });

    it("409 STOCK_INSUFICIENTE si pide más de lo disponible", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(comprador);
      const res = await POST(
        req({ tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 999 }] }),
      );
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe("STOCK_INSUFICIENTE");
    });
  });

  describe("GET", () => {
    it("200 lista paginada filtrando por tiendaId, requiere ser dueño", async () => {
      obtenerUsuarioActualMock.mockResolvedValue(comprador);
      await POST(
        new NextRequest("http://localhost/api/pedidos", {
          method: "POST",
          body: JSON.stringify({ tiendaId: tienda.id, items: [{ productoId: producto.id, cantidad: 1 }] }),
        }),
      );

      obtenerUsuarioActualMock.mockResolvedValue(vendedor);
      const res = await GET(new NextRequest(`http://localhost/api/pedidos?tiendaId=${tienda.id}`));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.page).toBe(1);
      expect(body.data).toHaveLength(1);
    });
  });
});
