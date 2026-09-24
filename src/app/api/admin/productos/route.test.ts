import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { GET } from "./route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("GET /api/admin/productos", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let tienda: Tienda;
  let producto: Producto;

  beforeEach(async () => {
    admin = await registrarUsuario({
      email: `test-admin-productos-route-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };
    vendedor = await registrarUsuario({
      email: `test-admin-productos-route-v-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre: "Vendedor",
    });
    tienda = await crearTienda(vendedor, {
      nombre: "Tienda",
      direccion: "Dirección",
      lat: -34.6037,
      lon: -58.3816,
    });
    producto = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Producto" }, precio: 100, stock: 5 });
  });

  afterEach(async () => {
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, vendedor.id] } } });
    vi.clearAllMocks();
  });

  it("403 si no es admin", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await GET(new NextRequest("http://localhost/api/admin/productos"));
    expect(res.status).toBe(403);
  });

  it("200 lista productos con tiendaNombre/vendedorNombre", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(admin);
    const res = await GET(new NextRequest(`http://localhost/api/admin/productos?tiendaId=${tienda.id}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data[0].tiendaNombre).toBe(tienda.nombre);
    expect(body.data[0].vendedorNombre).toBe(vendedor.nombre);
  });
});
