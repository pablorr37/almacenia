import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { generarCodigoCliente, resolverCodigoCliente, leerCodigoQr, VIGENCIA_MINUTOS } from "./codigo-cliente";

let n = 0;
async function usuario(nombre = "María González"): Promise<Usuario> {
  n += 1;
  return registrarUsuario({ email: `test-codigo-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
}

describe("leerCodigoQr", () => {
  it("acepta el contenido del QR o el número tipeado (con espacios)", () => {
    expect(leerCodigoQr("almacenia:cliente:123456")).toBe("123456");
    expect(leerCodigoQr(" 123 456 ")).toBe("123456");
    expect(leerCodigoQr("12345")).toBeNull();
    expect(leerCodigoQr("otra-cosa")).toBeNull();
  });
});

describe("código de cliente", () => {
  const ids: string[] = [];
  afterEach(async () => {
    const lista = ids.splice(0);
    await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: lista } } } } });
    await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: lista } } } });
    await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: lista } } } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: lista } } });
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: lista } } });
    await prisma.usuario.deleteMany({ where: { id: { in: lista } } });
  });

  it("genera un código de 6 dígitos que vence a los 10 minutos y lo resuelve al usuario", async () => {
    const u = await usuario();
    ids.push(u.id);
    const ahora = new Date("2026-10-12T15:00:00Z");
    const { codigo, expiraEn } = await generarCodigoCliente(u, ahora);
    expect(codigo).toMatch(/^\d{6}$/);
    expect(new Date(expiraEn).getTime() - ahora.getTime()).toBe(VIGENCIA_MINUTOS * 60_000);

    expect(await resolverCodigoCliente(codigo, new Date("2026-10-12T15:09:00Z"))).toEqual({ id: u.id, nombre: "María González" });
    await expect(resolverCodigoCliente(codigo, new Date("2026-10-12T15:11:00Z"))).rejects.toMatchObject<Partial<AppError>>({
      code: "CODIGO_CLIENTE_INVALIDO",
    });
  });

  it("generar otro reemplaza al anterior", async () => {
    const u = await usuario();
    ids.push(u.id);
    const primero = await generarCodigoCliente(u);
    const segundo = await generarCodigoCliente(u);
    await expect(resolverCodigoCliente(primero.codigo)).rejects.toMatchObject({ code: "CODIGO_CLIENTE_INVALIDO" });
    expect((await resolverCodigoCliente(segundo.codigo)).id).toBe(u.id);
    expect(await prisma.codigoCliente.count({ where: { usuarioId: u.id } })).toBe(1);
  });

  it("CODIGO_CLIENTE_INVALIDO con formato inválido o inexistente", async () => {
    await expect(resolverCodigoCliente("abc")).rejects.toMatchObject({ code: "CODIGO_CLIENTE_INVALIDO" });
    await expect(resolverCodigoCliente("000000")).rejects.toMatchObject({ code: "CODIGO_CLIENTE_INVALIDO" });
  });

  it("la venta de mostrador acepta el código (o el QR); VENTA_PROPIA con el propio código", async () => {
    const vendedor = await usuario("Vendedor");
    const cliente = await usuario("Cliente QR");
    ids.push(vendedor.id, cliente.id);
    const tienda = await crearTienda(vendedor, { nombre: "T", direccion: "D", lat: -31.5, lon: -68.5 });
    const producto = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Yerba" }, precio: 100, stock: 10 });

    const { codigo } = await generarCodigoCliente(cliente);
    const venta = await crearVentaPresencial(vendedor, tienda.id, {
      items: [{ productoId: producto.id, cantidad: 1 }],
      compradorCodigo: `almacenia:cliente:${codigo}`,
    });
    expect(venta.compradorId).toBe(cliente.id);

    const propio = await generarCodigoCliente(vendedor);
    await expect(
      crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], compradorCodigo: propio.codigo })
    ).rejects.toMatchObject({ code: "VENTA_PROPIA" });
  });
});
