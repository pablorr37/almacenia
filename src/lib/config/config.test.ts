import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { obtenerConfig, listarConfig, actualizarConfig } from "./config";

describe("configuración del sistema (11-admin.md)", () => {
  let admin: Usuario;
  let comun: Usuario;

  beforeEach(async () => {
    await prisma.configuracionSistema.deleteMany({});
    admin = await registrarUsuario({ email: `test-config-a-${Date.now()}@almacenia.test`, password: "password123", nombre: "Admin" });
    await prisma.usuario.update({ where: { id: admin.id }, data: { esAdmin: true } });
    admin = { ...admin, esAdmin: true };
    comun = await registrarUsuario({ email: `test-config-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "Común" });
  });

  afterEach(async () => {
    await prisma.configuracionSistema.deleteMany({});
    await prisma.usuario.deleteMany({ where: { id: { in: [admin.id, comun.id] } } });
  });

  it("obtenerConfig devuelve el default si no hay valor guardado", async () => {
    expect(await obtenerConfig("gamificacion.umbral_items_compra_extra")).toBe(5);
    expect(await obtenerConfig("itinerario.costo_km")).toBe(300);
  });

  it("actualizarConfig guarda y obtenerConfig lo devuelve", async () => {
    const item = await actualizarConfig(admin, "gamificacion.umbral_items_compra_extra", 3);
    expect(item).toMatchObject({ clave: "gamificacion.umbral_items_compra_extra", valor: 3, porDefecto: 5 });
    expect(await obtenerConfig("gamificacion.umbral_items_compra_extra")).toBe(3);
  });

  it("listarConfig devuelve todas las claves con valor, default y descripción", async () => {
    await actualizarConfig(admin, "itinerario.costo_km", 150.5);
    const items = await listarConfig(admin);
    expect(items.map((i) => i.clave).sort()).toEqual(["gamificacion.umbral_items_compra_extra", "itinerario.costo_km"]);
    expect(items.find((i) => i.clave === "itinerario.costo_km")?.valor).toBe(150.5);
    expect(items.every((i) => i.descripcion.length > 0)).toBe(true);
  });

  it("FORBIDDEN si no es admin", async () => {
    await expect(actualizarConfig(comun, "itinerario.costo_km", 1)).rejects.toMatchObject<Partial<AppError>>({ code: "FORBIDDEN" });
    await expect(listarConfig(comun)).rejects.toMatchObject<Partial<AppError>>({ code: "FORBIDDEN" });
  });

  it("CLAVE_CONFIG_INVALIDA con una clave desconocida", async () => {
    await expect(actualizarConfig(admin, "no.existe", 1)).rejects.toMatchObject<Partial<AppError>>({ code: "CLAVE_CONFIG_INVALIDA" });
  });

  it("VALOR_CONFIG_INVALIDO con negativos, no numéricos o decimales en claves enteras", async () => {
    for (const [clave, valor] of [
      ["itinerario.costo_km", -1],
      ["itinerario.costo_km", "10"],
      ["gamificacion.umbral_items_compra_extra", 2.5],
    ] as const) {
      await expect(actualizarConfig(admin, clave, valor as unknown as number)).rejects.toMatchObject<Partial<AppError>>({
        code: "VALOR_CONFIG_INVALIDO",
      });
    }
  });
});
