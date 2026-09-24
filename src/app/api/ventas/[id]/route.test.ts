import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial, type Venta } from "@/lib/ventas/ventas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/ventas/[id]", () => {
  let vendedor: Usuario;
  let ajeno: Usuario;
  let tienda: Tienda;
  let producto: Producto;
  let venta: Venta;

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-venta-id-vendedor-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    ajeno = await registrarUsuario({
      email: `test-venta-id-ajeno-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Ajeno",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Producto" }, precio: 100, stock: 10 });
    venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
  });

  afterEach(async () => {
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: vendedor.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, ajeno.id] } } });
    vi.clearAllMocks();
  });

  it("200 si es el vendedor dueño de la tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await GET(new NextRequest("http://localhost/api/ventas/x"), params(venta.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe(venta.id);
  });

  it("403 NO_AUTORIZADO_VENTA para un usuario ajeno", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(ajeno);
    const res = await GET(new NextRequest("http://localhost/api/ventas/x"), params(venta.id));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("NO_AUTORIZADO_VENTA");
  });

  it("404 VENTA_NO_ENCONTRADA si no existe", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await GET(
      new NextRequest("http://localhost/api/ventas/x"),
      params("00000000-0000-0000-0000-000000000000"),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("VENTA_NO_ENCONTRADA");
  });
});
