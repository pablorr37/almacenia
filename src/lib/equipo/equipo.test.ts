import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, actualizarProducto, listarParaVenta } from "@/lib/productos/productos";
import { crearVentaPresencial, transicionarVenta, listarVentas } from "@/lib/ventas/ventas";
import { listarPedidos } from "@/lib/pedidos/pedidos";
import { generarCodigoCliente } from "@/lib/clientes/codigo-cliente";
import { nuevoDePrueba } from "@/lib/rubros-categorias/test-helpers";
import {
  PERMISOS,
  permisosPorDefecto,
  accesoATienda,
  exigirPermiso,
  misTiendas,
  listarMiembros,
  agregarMiembro,
  actualizarMiembro,
  quitarMiembro,
} from "./equipo";

// 19-equipo-tienda.md
let n = 0;
const creados: string[] = [];
async function usuario(nombre: string): Promise<Usuario> {
  n += 1;
  const u = await registrarUsuario({ email: `test-equipo-${Date.now()}-${n}@almacenia.test`, password: "password123", nombre });
  creados.push(u.id);
  return u;
}
async function tiendaDe(dueno: Usuario, nombre: string): Promise<Tienda> {
  return crearTienda(dueno, { nombre, direccion: "D", lat: -31.5375, lon: -68.5364 });
}

afterEach(async () => {
  const tiendas = await prisma.tienda.findMany({ where: { vendedorId: { in: creados } }, select: { id: true } });
  const ids = tiendas.map((t) => t.id);
  await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: { in: ids } } } });
  await prisma.venta.deleteMany({ where: { tiendaId: { in: ids } } });
  await prisma.producto.deleteMany({ where: { tiendaId: { in: ids } } });
  await prisma.eventoPuntos.deleteMany({ where: { OR: [{ usuarioId: { in: creados } }, { tiendaId: { in: ids } }] } });
  await prisma.tienda.deleteMany({ where: { id: { in: ids } } });
  await prisma.codigoCliente.deleteMany({ where: { usuarioId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

describe("permisos por defecto", () => {
  it("encargado: todos menos usuarios; empleado: vender y cobrar", () => {
    expect(permisosPorDefecto("encargado")).toEqual(PERMISOS.filter((p) => p !== "usuarios"));
    expect(permisosPorDefecto("empleado")).toEqual(["vender", "cobrar"]);
  });
});

describe("accesoATienda y exigirPermiso", () => {
  it("propietario tiene todo; miembro sus permisos; un extraño nada", async () => {
    const dueno = await usuario("Dueña");
    const empleado = await usuario("Empleado");
    const extrano = await usuario("Extraño");
    const tienda = await tiendaDe(dueno, "Almacén Equipo");
    await agregarMiembro(dueno, tienda.id, { email: empleado.email, rol: "empleado" });

    expect(await accesoATienda(dueno.id, tienda.id)).toEqual({ rol: "propietario", permisos: [...PERMISOS] });
    expect(await accesoATienda(empleado.id, tienda.id)).toEqual({ rol: "empleado", permisos: ["vender", "cobrar"] });
    expect(await accesoATienda(extrano.id, tienda.id)).toBeNull();

    await expect(exigirPermiso(empleado, tienda.id, "vender")).resolves.toMatchObject({ rol: "empleado" });
    await expect(exigirPermiso(empleado, tienda.id, ["balance", "cobrar"])).resolves.toBeTruthy();
    await expect(exigirPermiso(empleado, tienda.id, "precios")).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(exigirPermiso(empleado, tienda.id, "propietario")).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(exigirPermiso(extrano, tienda.id, "vender")).rejects.toMatchObject({ code: "NO_ES_DUENO_DE_TIENDA" });
    await expect(exigirPermiso(dueno, "00000000-0000-0000-0000-000000000000", "vender")).rejects.toMatchObject({ code: "TIENDA_NO_ENCONTRADA" });
    await expect(exigirPermiso(dueno, tienda.id, "propietario")).resolves.toMatchObject({ rol: "propietario" });
  });
});

describe("gestión del equipo", () => {
  it("suma por email (permisos por defecto) o por código de cliente (permisos explícitos)", async () => {
    const dueno = await usuario("Dueño");
    const a = await usuario("Ana");
    const b = await usuario("Beto");
    const tienda = await tiendaDe(dueno, "Kiosco Equipo");

    const m1 = await agregarMiembro(dueno, tienda.id, { email: a.email.toUpperCase(), rol: "encargado" });
    expect(m1).toMatchObject({ usuario: { id: a.id, nombre: "Ana" }, rol: "encargado", permisos: permisosPorDefecto("encargado") });

    const { codigo } = await generarCodigoCliente(b);
    const m2 = await agregarMiembro(dueno, tienda.id, { codigo, rol: "empleado", permisos: ["vender", "stock"] });
    expect(m2.permisos).toEqual(["vender", "stock"]);

    expect((await listarMiembros(dueno, tienda.id)).map((m) => m.usuario.nombre).sort()).toEqual(["Ana", "Beto"]);
  });

  it("errores: duplicado, propietario, rol, permiso, usuario inexistente o no activo", async () => {
    const dueno = await usuario("Dueño");
    const a = await usuario("Ana");
    const pausado = await usuario("Pausado");
    await prisma.usuario.update({ where: { id: pausado.id }, data: { estadoCuenta: "pausada" } });
    const tienda = await tiendaDe(dueno, "Verdulería Equipo");
    await agregarMiembro(dueno, tienda.id, { email: a.email, rol: "empleado" });

    await expect(agregarMiembro(dueno, tienda.id, { email: a.email, rol: "empleado" })).rejects.toMatchObject({ code: "MIEMBRO_YA_EXISTE" });
    await expect(agregarMiembro(dueno, tienda.id, { email: dueno.email, rol: "empleado" })).rejects.toMatchObject({ code: "ES_PROPIETARIO" });
    await expect(agregarMiembro(dueno, tienda.id, { email: "nadie@almacenia.test", rol: "empleado" })).rejects.toMatchObject({ code: "USUARIO_NO_ENCONTRADO" });
    await expect(agregarMiembro(dueno, tienda.id, { email: pausado.email, rol: "empleado" })).rejects.toMatchObject({ code: "USUARIO_NO_ENCONTRADO" });
    await expect(agregarMiembro(dueno, tienda.id, { email: pausado.email, rol: "jefe" as never })).rejects.toMatchObject({ code: "ROL_INVALIDO" });
    await expect(agregarMiembro(dueno, tienda.id, { email: pausado.email, rol: "empleado", permisos: ["volar" as never] })).rejects.toMatchObject({ code: "PERMISO_INVALIDO" });
    await expect(agregarMiembro(dueno, tienda.id, { codigo: "000000", rol: "empleado" })).rejects.toMatchObject({ code: "CODIGO_CLIENTE_INVALIDO" });
  });

  it("un miembro con 'usuarios' gestiona a otros pero solo da permisos que tiene; sin 'usuarios', no", async () => {
    const dueno = await usuario("Dueño");
    const gestor = await usuario("Gestor");
    const emp = await usuario("Emp");
    const otro = await usuario("Otro");
    const tienda = await tiendaDe(dueno, "Almacén Gestor");
    await agregarMiembro(dueno, tienda.id, { email: gestor.email, rol: "encargado", permisos: ["usuarios", "vender", "stock"] });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });

    await expect(agregarMiembro(gestor, tienda.id, { email: otro.email, rol: "empleado", permisos: ["vender"] })).resolves.toBeTruthy();
    await expect(actualizarMiembro(gestor, tienda.id, emp.id, { permisos: ["precios"] })).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(actualizarMiembro(gestor, tienda.id, emp.id, { permisos: ["stock"] })).resolves.toMatchObject({ permisos: ["stock"] });
    await expect(actualizarMiembro(gestor, tienda.id, gestor.id, { permisos: PERMISOS.slice() })).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(agregarMiembro(emp, tienda.id, { email: dueno.email, rol: "empleado" })).rejects.toMatchObject({ code: "SIN_PERMISO" });
  });

  it("actualizar y quitar; cualquier miembro puede dejar la tienda", async () => {
    const dueno = await usuario("Dueño");
    const a = await usuario("Ana");
    const b = await usuario("Beto");
    const tienda = await tiendaDe(dueno, "Almacén Quitar");
    await agregarMiembro(dueno, tienda.id, { email: a.email, rol: "empleado" });
    await agregarMiembro(dueno, tienda.id, { email: b.email, rol: "empleado" });

    const ascendida = await actualizarMiembro(dueno, tienda.id, a.id, { rol: "encargado", permisos: ["vender", "balance"] });
    expect(ascendida).toMatchObject({ rol: "encargado", permisos: ["vender", "balance"] });
    await expect(actualizarMiembro(dueno, tienda.id, dueno.id, { rol: "empleado" })).rejects.toMatchObject({ code: "MIEMBRO_NO_ENCONTRADO" });

    expect(await quitarMiembro(dueno, tienda.id, a.id)).toEqual({ usuarioId: a.id });
    expect(await accesoATienda(a.id, tienda.id)).toBeNull();
    expect(await quitarMiembro(b, tienda.id, b.id)).toEqual({ usuarioId: b.id });
    await expect(quitarMiembro(dueno, tienda.id, b.id)).rejects.toMatchObject({ code: "MIEMBRO_NO_ENCONTRADO" });
  });
});

describe("varias tiendas", () => {
  it("un usuario crea varias tiendas; misTiendas lista las propias primero y después donde es miembro", async () => {
    const yo = await usuario("Yo");
    const otra = await usuario("Otra");
    const b = await tiendaDe(yo, "B Sucursal");
    const a = await tiendaDe(yo, "A Central");
    const ajena = await tiendaDe(otra, "Ajena");
    await agregarMiembro(otra, ajena.id, { email: yo.email, rol: "empleado" });

    const mias = await misTiendas(yo);
    expect(mias.map((m) => [m.tienda.id, m.rol])).toEqual([
      [a.id, "propietario"],
      [b.id, "propietario"],
      [ajena.id, "empleado"],
    ]);
    expect(mias[2].permisos).toEqual(["vender", "cobrar"]);
  });
});

describe("los módulos respetan los permisos", () => {
  it("un empleado vende y cobra (queda como vendidaPor), pero no cambia precios ni ve pedidos sin permiso", async () => {
    const dueno = await usuario("Dueño");
    const emp = await usuario("Emp");
    const tienda = await tiendaDe(dueno, "Almacén Permisos");
    const producto = await crearProducto(dueno, tienda.id, { nuevo: await nuevoDePrueba("Equipo"), precio: 100, stock: 10 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "empleado" });

    expect((await listarParaVenta(emp, tienda.id)).map((p) => p.id)).toContain(producto.id);
    const venta = await crearVentaPresencial(emp, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], cobrarAhora: false });
    expect(venta.vendidaPor).toEqual({ id: emp.id, nombre: "Emp" });
    await expect(transicionarVenta(emp, venta.id, "cobrar")).resolves.toMatchObject({ estado: "cobrada" });
    await expect(listarVentas(emp, { tiendaId: tienda.id })).resolves.toMatchObject({ total: 1 });

    await expect(actualizarProducto(emp, producto.id, { precio: 200 })).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(actualizarProducto(emp, producto.id, { favorito: true })).resolves.toMatchObject({ favorito: true });
    await expect(crearProducto(emp, tienda.id, { nuevo: await nuevoDePrueba("Equipo 2"), precio: 1, stock: 1 })).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(listarPedidos(emp, { tiendaId: tienda.id })).rejects.toMatchObject({ code: "SIN_PERMISO" });

    const venta2 = await crearVentaPresencial(emp, tienda.id, { items: [{ productoId: producto.id, cantidad: 1 }], cobrarAhora: false });
    await expect(transicionarVenta(emp, venta2.id, "anular")).rejects.toMatchObject({ code: "SIN_PERMISO" });

    await actualizarMiembro(dueno, tienda.id, emp.id, { permisos: ["precios", "stock", "pedidos"] });
    await expect(actualizarProducto(emp, producto.id, { precio: 200, stock: 4 })).resolves.toMatchObject({ precio: 200, stock: 4 });
    await expect(actualizarProducto(emp, producto.id, { disponible: false })).rejects.toMatchObject({ code: "SIN_PERMISO" });
    await expect(listarPedidos(emp, { tiendaId: tienda.id })).resolves.toMatchObject({ total: 0 });
  });
});
