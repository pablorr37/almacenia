import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { obtenerUsuarioActual } from "@/lib/auth/session";
import { PUT, GET } from "./route";
import { GET as GET_PROPIA } from "@/app/api/auth/perfil/valoracion/route";

vi.mock("@/lib/auth/session", () => ({ obtenerUsuarioActual: vi.fn() }));
const obtenerUsuarioActualMock = vi.mocked(obtenerUsuarioActual);

describe("/api/clientes/:compradorId/valoracion", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let producto: Producto;
  const ctx = () => ({ params: Promise.resolve({ compradorId: comprador.id }) });
  const put = (body: unknown) =>
    new NextRequest("http://localhost/api/clientes/x/valoracion", { method: "PUT", body: JSON.stringify(body) });

  beforeEach(async () => {
    vendedor = await registrarUsuario({ email: `test-valcli-api-v-${Date.now()}@almacenia.test`, password: "password123", nombre: "V" });
    comprador = await registrarUsuario({ email: `test-valcli-api-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    tienda = await crearTienda(vendedor, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    producto = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "P" }, precio: 10, stock: 5 });
  });

  afterEach(async () => {
    const ids = [vendedor.id, comprador.id];
    await prisma.valoracionCliente.deleteMany({ where: { compradorId: { in: ids } } });
    await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: tienda.id } } });
    await prisma.venta.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.productoCatalogo.deleteMany({ where: { id: producto.catalogoId } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    vi.clearAllMocks();
  });

  it("401 sin sesión", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(null);
    expect((await PUT(put({ puntuacion: 5 }), ctx())).status).toBe(401);
  });

  it("409 VALORACION_SIN_VENTA_PREVIA sin compra previa", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await PUT(put({ puntuacion: 5 }), ctx());
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("VALORACION_SIN_VENTA_PREVIA");
  });

  it("200 valora tras una venta; GET devuelve el resumen; el comprador ve su promedio", async () => {
    await crearVentaPresencial(vendedor, tienda.id, { compradorId: comprador.id, items: [{ productoId: producto.id, cantidad: 1 }] });
    obtenerUsuarioActualMock.mockResolvedValue(vendedor);
    const res = await PUT(put({ puntuacion: 4, comentario: "Buen cliente" }), ctx());
    expect(res.status).toBe(200);

    const resumen = await (await GET(new NextRequest("http://localhost/x"), ctx())).json();
    expect(resumen.data).toMatchObject({ promedio: 4, cantidad: 1, miValoracion: { comentario: "Buen cliente" } });

    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const propia = await (await GET_PROPIA()).json();
    expect(propia.data).toEqual({ promedio: 4, cantidad: 1 });
  });

  it("403 FORBIDDEN si quien consulta no tiene tienda", async () => {
    obtenerUsuarioActualMock.mockResolvedValue(comprador);
    const res = await GET(new NextRequest("http://localhost/x"), { params: Promise.resolve({ compradorId: vendedor.id }) });
    expect(res.status).toBe(403);
  });
});
