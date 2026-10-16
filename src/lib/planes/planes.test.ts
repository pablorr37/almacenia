import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda } from "@/lib/tiendas/tiendas";
import { cambiarPlanUsuario } from "@/lib/admin/usuarios";
import { tienePermiso, exigirFeature } from "./planes";
import { MAX_TIENDAS } from "./limites";

let contador = 0;
const creados: string[] = [];
async function usuario(): Promise<Usuario> {
  contador += 1;
  const u = await registrarUsuario({ email: `test-planes-${Date.now()}-${contador}@almacenia.test`, password: "password123", nombre: "Vendedor" });
  creados.push(u.id);
  return u;
}
const nuevaTienda = (u: Usuario, n: number) => crearTienda(u, { nombre: `Tienda planes ${n}`, direccion: "D", lat: -34.6, lon: -58.38 });

afterEach(async () => {
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: creados } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creados } } });
  creados.length = 0;
});

// 10-planes.md / 20-precios-facturacion.md
describe("tienePermiso: cada feature declara su plan mínimo", () => {
  it("free no tiene features pagas", () => {
    for (const f of ["fotos_personalizadas", "destacado_prioritario", "balance_solido", "balance_completo", "exportar_libro_ventas"] as const) {
      expect(tienePermiso({ plan: "free" }, f)).toBe(false);
    }
  });

  it("premium: fotos, destacado y balance sólido; no el completo ni el libro", () => {
    expect(tienePermiso({ plan: "premium" }, "fotos_personalizadas")).toBe(true);
    expect(tienePermiso({ plan: "premium" }, "destacado_prioritario")).toBe(true);
    expect(tienePermiso({ plan: "premium" }, "balance_solido")).toBe(true);
    expect(tienePermiso({ plan: "premium" }, "balance_completo")).toBe(false);
    expect(tienePermiso({ plan: "premium" }, "exportar_libro_ventas")).toBe(false);
  });

  it("plata tiene todo", () => {
    for (const f of ["fotos_personalizadas", "destacado_prioritario", "balance_solido", "balance_completo", "exportar_libro_ventas"] as const) {
      expect(tienePermiso({ plan: "plata" }, f)).toBe(true);
    }
  });

  it("exigirFeature lanza PLAN_INSUFICIENTE", () => {
    expect(() => exigirFeature({ plan: "premium" }, "balance_completo")).toThrow(expect.objectContaining({ code: "PLAN_INSUFICIENTE" }));
    expect(() => exigirFeature({ plan: "plata" }, "balance_completo")).not.toThrow();
  });
});

describe("plan de la tienda = plan del dueño", () => {
  it("la tienda nueva copia el plan del dueño y cambiar el plan del usuario cambia todas sus tiendas", async () => {
    const admin = await usuario();
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    const dueno = await usuario();
    await prisma.usuario.update({ where: { id: dueno.id }, data: { plan: "premium" } });
    const a = await nuevaTienda(dueno, 1);
    const b = await nuevaTienda(dueno, 2);
    expect([a.plan, b.plan]).toEqual(["premium", "premium"]);

    await cambiarPlanUsuario({ ...admin, esAdmin: true }, dueno.id, "plata");
    const planes = await prisma.tienda.findMany({ where: { vendedorId: dueno.id }, select: { plan: true } });
    expect(planes.map((t) => t.plan)).toEqual(["plata", "plata"]);
  });
});

describe("tope de tiendas por plan", () => {
  it("free: 1 tienda, premium: 3, plata: 4", async () => {
    expect(MAX_TIENDAS).toEqual({ free: 1, premium: 3, plata: 4 });
    const dueno = await usuario();
    await nuevaTienda(dueno, 1);
    await expect(nuevaTienda(dueno, 2)).rejects.toMatchObject({ code: "LIMITE_TIENDAS_PLAN" });

    await prisma.usuario.update({ where: { id: dueno.id }, data: { plan: "premium" } });
    await nuevaTienda(dueno, 2);
    await nuevaTienda(dueno, 3);
    await expect(nuevaTienda(dueno, 4)).rejects.toMatchObject({ code: "LIMITE_TIENDAS_PLAN" });
  });
});
