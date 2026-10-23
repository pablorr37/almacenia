import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { sumarAlCatalogo } from "@/lib/catalogo/catalogo";
import { agregarMiembro } from "@/lib/equipo/equipo";
import { categoriaDePrueba } from "./test-helpers";

// 17-rubros-categorias.md, "Categorías creadas por usuarios (premium o mayor)"
describe("categorías creadas por usuarios premium o mayor", () => {
  const creados: string[] = [];
  let dueno: Usuario;
  let emp: Usuario;
  let tienda: Tienda;
  const SUF = `${Date.now()}`.slice(-6);
  const nombre = (base: string) => `${base} ${SUF}`;

  beforeEach(async () => {
    const s = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    dueno = await registrarUsuario({ email: `test-catus-d-${s}@almacenia.test`, password: "password123", nombre: "D" });
    emp = await registrarUsuario({ email: `test-catus-e-${s}@almacenia.test`, password: "password123", nombre: "E" });
    creados.push(dueno.id, emp.id);
    tienda = await crearTienda(dueno, { nombre: "Almacén Categorías", direccion: "D", lat: -31.5, lon: -68.5 });
    await agregarMiembro(dueno, tienda.id, { email: emp.email, rol: "encargado" });
  });

  afterEach(async () => {
    await prisma.producto.deleteMany({ where: { tiendaId: tienda.id } });
    await prisma.eventoPuntos.deleteMany({ where: { usuarioId: { in: creados } } });
    await prisma.productoCatalogo.deleteMany({ where: { categoria: { nombreNormalizado: { contains: SUF } } } });
    await prisma.categoriaProducto.deleteMany({ where: { nombreNormalizado: { contains: SUF } } });
    await prisma.tienda.deleteMany({ where: { id: tienda.id } });
    await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
    creados.length = 0;
  });

  const premium = () =>
    Promise.all([
      prisma.usuario.update({ where: { id: dueno.id }, data: { plan: "premium" } }),
      prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } }),
    ]);

  it("free: no puede crear categorías (PLAN_INSUFICIENTE) y no queda nada creado", async () => {
    await expect(
      crearProducto(dueno, tienda.id, { nuevo: { categoriaNueva: nombre("Kombucha") }, precio: 100, stock: 1 })
    ).rejects.toMatchObject({ code: "PLAN_INSUFICIENTE" });
    expect(await prisma.categoriaProducto.count({ where: { nombreNormalizado: `kombucha ${SUF}` } })).toBe(0);
  });

  it("premium: al guardar el producto se crea la categoría (con quién la creó) y el producto queda en ella", async () => {
    await premium();
    const p = await crearProducto(dueno, tienda.id, {
      nuevo: { categoriaNueva: `  ${nombre("Kombucha")}  `, marca: "Kombu" },
      precio: 1500,
      stock: 3,
    });
    const cat = await prisma.categoriaProducto.findUniqueOrThrow({ where: { nombreNormalizado: `kombucha ${SUF}` } });
    expect(cat).toMatchObject({ nombre: nombre("Kombucha"), creadaPorId: dueno.id });
    expect(p.categoria).toEqual({ id: cat.id, nombre: cat.nombre });
    expect(p.nombre).toBe(`${nombre("Kombucha")} Kombu`);
  });

  it("si la categoría ya existe (otra tilde o mayúsculas), usa esa", async () => {
    await premium();
    const existente = await categoriaDePrueba(nombre("Té helado"));
    const p = await crearProducto(dueno, tienda.id, { nuevo: { categoriaNueva: nombre("TE HELADO"), marca: "X" }, precio: 1, stock: 1 });
    expect(p.categoria?.id).toBe(existente);
    expect(await prisma.categoriaProducto.count({ where: { nombreNormalizado: `te helado ${SUF}` } })).toBe(1);
  });

  it("un empleado (plan free) de una tienda premium también puede", async () => {
    await premium();
    const p = await crearProducto(emp, tienda.id, { nuevo: { categoriaNueva: nombre("Mate cocido") }, precio: 1, stock: 1 });
    expect(p.categoria?.nombre).toBe(nombre("Mate cocido"));
  });

  it("si el alta falla por otro dato, la categoría nueva no queda creada; nombre inválido", async () => {
    await premium();
    await expect(
      crearProducto(dueno, tienda.id, {
        nuevo: { categoriaNueva: nombre("Soda"), contenido: -1, unidadContenido: "ml" },
        precio: 1,
        stock: 1,
      })
    ).rejects.toMatchObject({ code: "CONTENIDO_INVALIDO" });
    expect(await prisma.categoriaProducto.count({ where: { nombreNormalizado: `soda ${SUF}` } })).toBe(0);
    await expect(crearProducto(dueno, tienda.id, { nuevo: { categoriaNueva: "x" }, precio: 1, stock: 1 })).rejects.toMatchObject({
      code: "NOMBRE_INVALIDO",
    });
  });

  it("desde una lista (sumarAlCatalogo): según el plan del usuario", async () => {
    await expect(sumarAlCatalogo(emp, { categoriaNueva: nombre("Hongos") })).rejects.toMatchObject({ code: "PLAN_INSUFICIENTE" });
    await prisma.usuario.update({ where: { id: emp.id }, data: { plan: "plata" } });
    const { producto } = await sumarAlCatalogo(emp, { categoriaNueva: nombre("Hongos"), variante: "secos" });
    expect(producto.categoria.nombre).toBe(nombre("Hongos"));
  });
});
