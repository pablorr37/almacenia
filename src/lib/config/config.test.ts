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
    expect(items.map((i) => i.clave).sort()).toEqual([
      "balance.umbral_stock_bajo",
      "canje.premium_dias",
      "canje.premium_puntos",
      "canje.publicidad_dia_puntos",
      "canje.publicidad_pin_dia_puntos",
      "canje.publicidad_push_puntos",
      "canje.reintegro_pct",
      "gamificacion.porcentaje_puntos_equipo",
      "gamificacion.umbral_items_compra_extra",
      "itinerario.costo_km",
      "notif.hora_fin",
      "notif.hora_inicio",
      "notif.publicidad_push_semana",
      "pagos.gracia_dias",
      "precio.premium_ars",
      "precio.publicidad_dia_ars",
      "precio.publicidad_pin_dia_ars",
      "precio.publicidad_push_ars",
      "publicidad.frecuencia_dia",
      "puntos.transferencia_max",
      "puntos.transferencia_mes_max",
    ]);
    expect(items.find((i) => i.clave === "itinerario.costo_km")?.valor).toBe(150.5);
    expect(items.every((i) => i.descripcion.length > 0)).toBe(true);
  });

  it("gamificacion.porcentaje_puntos_equipo: entero entre 0 y 100, default 50 (12-gamificacion.md)", async () => {
    expect((await listarConfig(admin)).find((i) => i.clave === "gamificacion.porcentaje_puntos_equipo")?.porDefecto).toBe(50);
    await expect(actualizarConfig(admin, "gamificacion.porcentaje_puntos_equipo", 101)).rejects.toMatchObject({ code: "VALOR_CONFIG_INVALIDO" });
    await expect(actualizarConfig(admin, "gamificacion.porcentaje_puntos_equipo", 40)).resolves.toMatchObject({ valor: 40 });
  });

  it("precios y topes de la ronda 4 y 5 con sus defaults (23-puntos-pagos.md, 22-notificaciones.md)", async () => {
    const porDefecto = Object.fromEntries((await listarConfig(admin)).map((i) => [i.clave, i.porDefecto]));
    expect(porDefecto).toMatchObject({
      "canje.premium_puntos": 1500,
      "canje.premium_dias": 30,
      "canje.publicidad_dia_puntos": 100,
      "canje.publicidad_pin_dia_puntos": 50,
      "canje.publicidad_push_puntos": 300,
      "canje.reintegro_pct": 100,
      "puntos.transferencia_max": 500,
      "puntos.transferencia_mes_max": 2000,
      "pagos.gracia_dias": 3,
      "publicidad.frecuencia_dia": 3,
      "notif.publicidad_push_semana": 2,
      "notif.hora_inicio": 8,
      "notif.hora_fin": 22,
    });
    await expect(actualizarConfig(admin, "canje.reintegro_pct", 101)).rejects.toMatchObject({ code: "VALOR_CONFIG_INVALIDO" });
    await expect(actualizarConfig(admin, "notif.hora_fin", 25)).rejects.toMatchObject({ code: "VALOR_CONFIG_INVALIDO" });
    await expect(actualizarConfig(admin, "publicidad.frecuencia_dia", 0)).rejects.toMatchObject({ code: "VALOR_CONFIG_INVALIDO" });
    await expect(actualizarConfig(admin, "canje.premium_dias", 0)).rejects.toMatchObject({ code: "VALOR_CONFIG_INVALIDO" });
    await expect(actualizarConfig(admin, "precio.premium_ars", 4999.5)).resolves.toMatchObject({ valor: 4999.5 });
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
