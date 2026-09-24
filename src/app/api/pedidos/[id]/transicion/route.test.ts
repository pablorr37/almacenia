import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearPedido, type Pedido } from "@/lib/pedidos/pedidos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { POST } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(accion: string) {
  return new NextRequest("http://localhost/api/pedidos/x/transicion", {
    method: "POST",
    body: JSON.stringify({ accion }),
  });
}

describe("POST /api/pedidos/[id]/transicion", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;
  let pedido: Pedido;

  beforeEach(async () => {
    vendedor = await registrarUsuario({
      email: `test-transicion-vendedor-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    comprador = await registrarUsuario({
      email: `test-transicion-comprador-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Comprador",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Mi tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Producto" }, precio: 100, stock: 10 });
    pedido = await crearPedido(comprador, {
      tiendaId: tienda.id,
      items: [{ productoId: producto.id, cantidad: 1 }],
    });
  });

  afterEach(async () => {
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: tienda.id } } });
    await prisma.pedido.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.tienda.deleteMany({ where: { vendedorId: vendedor.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [vendedor.id, comprador.id] } } });
    vi.clearAllMocks();
  });

  it("200 el vendedor confirma el pedido pendiente", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await POST(req("confirmar"), params(pedido.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.estado).toBe("confirmado");
  });

  it("409 TRANSICION_INVALIDA si el comprador intenta confirmar (no le corresponde)", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await POST(req("confirmar"), params(pedido.id));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("TRANSICION_INVALIDA");
  });

  it("el comprador puede cancelar su propio pedido pendiente", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await POST(req("cancelar"), params(pedido.id));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.estado).toBe("cancelado");
  });
});
