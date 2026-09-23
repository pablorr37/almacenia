import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearPedido, type Pedido } from "@/lib/pedidos/pedidos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/pedidos/[id]", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let ajeno: Usuario;
  let tienda: Tienda;
  let producto: Producto;
  let pedido: Pedido;

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-pedido-id-vendedor-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    comprador = await registrarUsuario({
      email: `test-pedido-id-comprador-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Comprador",
    });
    ajeno = await registrarUsuario({
      email: `test-pedido-id-ajeno-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Ajeno",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(vendedor, tienda.id, { nombre: "Producto", precio: 100, stock: 10 });
    pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
  });

  afterEach(async () => {
    await prisma.itemPedido.deleteMany({});
    await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: vendedor.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, comprador.id, ajeno.id] } } });
    vi.clearAllMocks();
  });

  it("200 si es el comprador dueño del pedido", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await GET(new NextRequest("http://localhost/api/pedidos/x"), params(pedido.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.id).toBe(pedido.id);
  });

  it("200 si es el vendedor dueño de la tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await GET(new NextRequest("http://localhost/api/pedidos/x"), params(pedido.id));
    expect(res.status).toBe(200);
  });

  it("403 NO_AUTORIZADO_PEDIDO para un usuario que no es ni comprador ni vendedor", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(ajeno);
    const res = await GET(new NextRequest("http://localhost/api/pedidos/x"), params(pedido.id));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.error.code).toBe("NO_AUTORIZADO_PEDIDO");
  });

  it("404 PEDIDO_NO_ENCONTRADO si el id no existe", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await GET(
      new NextRequest("http://localhost/api/pedidos/x"),
      params("00000000-0000-0000-0000-000000000000"),
    );
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error.code).toBe("PEDIDO_NO_ENCONTRADO");
  });
});
