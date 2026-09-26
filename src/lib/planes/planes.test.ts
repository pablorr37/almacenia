import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { tienePermiso, cambiarPlan } from "./planes";

let contador = 0;
async function crearVendedorConTienda(): Promise<{ vendedor: Usuario; tienda: Tienda }> {
  contador += 1;
  const vendedor = await registrarUsuario({
    email: `test-planes-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: "Vendedor de prueba",
  });
  const tienda = await crearTienda(vendedor, {
    nombre: `Tienda de prueba ${contador}`,
    direccion: "Dirección",
    lat: -34.6037,
    lon: -58.3816,
  });
  return { vendedor, tienda };
}

async function limpiar(usuarioIds: string[]) {
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: usuarioIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: usuarioIds } } });
}

describe("tienePermiso", () => {
  it("free no tiene fotos_personalizadas ni destacado_prioritario", () => {
    expect(tienePermiso({ plan: "free" }, "fotos_personalizadas")).toBe(false);
    expect(tienePermiso({ plan: "free" }, "destacado_prioritario")).toBe(false);
  });

  it("premium tiene todas las features", () => {
    expect(tienePermiso({ plan: "premium" }, "fotos_personalizadas")).toBe(true);
    expect(tienePermiso({ plan: "premium" }, "destacado_prioritario")).toBe(true);
  });
});

describe("cambiarPlan", () => {
  let admin: Usuario;
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    ({ vendedor, tienda } = await crearVendedorConTienda());
    admin = await registrarUsuario({
      email: `test-planes-admin-${Date.now()}-${contador}@almacenia.test`,
      password: "password123",
      nombre: "Admin",
    });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };
  });

  afterEach(() => limpiar([vendedor.id, admin.id]));

  it("cambia el plan de la tienda", async () => {
    const resultado = await cambiarPlan(admin, tienda.id, "premium");
    expect(resultado.plan).toBe("premium");
  });

  it("lanza FORBIDDEN si el usuario no es admin", async () => {
    await expect(cambiarPlan(vendedor, tienda.id, "premium")).rejects.toMatchObject<Partial<AppError>>({
      code: "FORBIDDEN",
    });
  });

  it("lanza TIENDA_NO_ENCONTRADA si la tienda no existe", async () => {
    await expect(
      cambiarPlan(admin, "00000000-0000-0000-0000-000000000000", "premium")
    ).rejects.toMatchObject<Partial<AppError>>({ code: "TIENDA_NO_ENCONTRADA" });
  });
});
