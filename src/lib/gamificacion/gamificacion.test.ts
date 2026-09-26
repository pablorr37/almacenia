import { prisma } from "@/lib/prisma";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto, actualizarProducto, type Producto } from "@/lib/productos/productos";
import { crearVentaPresencial } from "@/lib/ventas/ventas";
import { actualizarConfig } from "@/lib/config/config";
import {
  registrarEvento,
  totalPuntos,
  historialPuntos,
  puntosVentaVendedor,
  compraPuntua,
  productosDistintos,
  puntosVisitaPagina,
  diaLocal,
  mesLocal,
  otorgarPorCheckIn,
  registrarVisitaPagina,
} from "./gamificacion";

let contador = 0;
async function crearUsuarioDePrueba(prefijo = "u"): Promise<Usuario> {
  contador += 1;
  return registrarUsuario({
    email: `test-gamificacion-${prefijo}-${Date.now()}-${contador}@almacenia.test`,
    password: "password123",
    nombre: `Usuario ${prefijo} ${contador}`,
  });
}

async function limpiarUsuarios(ids: string[]) {
  const catalogoIds = (
    await prisma.producto.findMany({ where: { tienda: { vendedorId: { in: ids } } }, select: { catalogoId: true } })
  ).map((p) => p.catalogoId);
  await prisma.itemVenta.deleteMany({ where: { venta: { tienda: { vendedorId: { in: ids } } } } });
  await prisma.venta.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
  await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
  await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  await prisma.productoCatalogo.deleteMany({ where: { id: { in: catalogoIds } } });
}

// ---------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------

describe("reglas puras", () => {
  it("productosDistintos agrupa líneas del mismo producto", () => {
    expect(productosDistintos([{ productoId: "a", cantidad: 1 }, { productoId: "a", cantidad: 2 }, { productoId: "b", cantidad: 1 }])).toBe(2);
  });

  describe("puntosVentaVendedor: 1 + 0,1·productos distintos + 0,1·unidades de líneas con más de 3", () => {
    it("arroz×1 + gaseosa×6 = 1,8", () => {
      expect(puntosVentaVendedor([{ productoId: "arroz", cantidad: 1 }, { productoId: "gaseosa", cantidad: 6 }])).toBe(1.8);
    });
    it("caramelo×1 = 1,1", () => {
      expect(puntosVentaVendedor([{ productoId: "caramelo", cantidad: 1 }])).toBe(1.1);
    });
    it("yerba×2 + azúcar×3 = 1,2 (ninguna línea supera 3)", () => {
      expect(puntosVentaVendedor([{ productoId: "yerba", cantidad: 2 }, { productoId: "azucar", cantidad: 3 }])).toBe(1.2);
    });
    it("líneas repetidas del mismo producto se suman antes de evaluar el umbral", () => {
      expect(puntosVentaVendedor([{ productoId: "a", cantidad: 2 }, { productoId: "a", cantidad: 2 }])).toBe(1.5);
    });
  });

  describe("compraPuntua: ≥2 productos distintos o alguna línea con más de 5 unidades", () => {
    it("1 caramelo no puntúa", () => {
      expect(compraPuntua([{ productoId: "caramelo", cantidad: 1 }])).toBe(false);
    });
    it("5 unidades de un solo producto no puntúa", () => {
      expect(compraPuntua([{ productoId: "a", cantidad: 5 }])).toBe(false);
    });
    it("6 unidades de un solo producto puntúa", () => {
      expect(compraPuntua([{ productoId: "a", cantidad: 6 }])).toBe(true);
    });
    it("2 productos distintos puntúa", () => {
      expect(compraPuntua([{ productoId: "a", cantidad: 1 }, { productoId: "b", cantidad: 1 }])).toBe(true);
    });
  });

  describe("puntosVisitaPagina", () => {
    it("primera visita: 5", () => {
      expect(puntosVisitaPagina(null, "2026-01")).toBe(5);
    });
    it("mismo mes: 0", () => {
      expect(puntosVisitaPagina({ ultimoMes: "2026-01", ultimoValor: 5 }, "2026-01")).toBe(0);
    });
    it("mes consecutivo: baja 0,5", () => {
      expect(puntosVisitaPagina({ ultimoMes: "2026-01", ultimoValor: 5 }, "2026-02")).toBe(4.5);
    });
    it("consecutivo con cambio de año", () => {
      expect(puntosVisitaPagina({ ultimoMes: "2025-12", ultimoValor: 3 }, "2026-01")).toBe(2.5);
    });
    it("piso de 0,5", () => {
      expect(puntosVisitaPagina({ ultimoMes: "2026-01", ultimoValor: 0.5 }, "2026-02")).toBe(0.5);
    });
    it("después de 2 meses sin entrar sube 0,5 por mes salteado", () => {
      // última en oct con 0,5; no entró nov ni dic; entra ene -> 0,5 + 2·0,5 = 1,5
      expect(puntosVisitaPagina({ ultimoMes: "2025-10", ultimoValor: 0.5 }, "2026-01")).toBe(1.5);
    });
    it("tope de 5", () => {
      expect(puntosVisitaPagina({ ultimoMes: "2024-01", ultimoValor: 4 }, "2026-01")).toBe(5);
    });
    it("secuencia del ejemplo de la spec", () => {
      let estado: { ultimoMes: string; ultimoValor: number } | null = null;
      const meses = ["2026-01", "2026-02", "2026-03"];
      const obtenidos = meses.map((mes) => {
        const p = puntosVisitaPagina(estado, mes);
        estado = { ultimoMes: mes, ultimoValor: p };
        return p;
      });
      expect(obtenidos).toEqual([5, 4.5, 4]);
    });
  });

  describe("día y mes locales (America/Argentina/San_Juan, UTC-3)", () => {
    it("02:00 UTC es todavía el día anterior en San Juan", () => {
      expect(diaLocal(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09-30");
      expect(mesLocal(new Date("2026-10-01T02:00:00Z"))).toBe("2026-09");
    });
  });
});

// ---------------------------------------------------------------------------
// registrarEvento / totalPuntos / historial
// ---------------------------------------------------------------------------

describe("registrarEvento", () => {
  let usuario: Usuario;
  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });
  afterEach(() => limpiarUsuarios([usuario.id]));

  it("crea el evento con el tipo, puntos (con decimales) y metadata dados", async () => {
    const evento = await registrarEvento(usuario.id, "compra_realizada", 1.5, { metadata: { pedidoId: "abc" } });

    expect(evento?.usuarioId).toBe(usuario.id);
    expect(evento?.tipo).toBe("compra_realizada");
    expect(evento?.puntos).toBe(1.5);
    expect(evento?.metadata).toEqual({ pedidoId: "abc" });
  });

  it("permite puntos negativos", async () => {
    const evento = await registrarEvento(usuario.id, "penalizacion", -5);
    expect(evento?.puntos).toBe(-5);
  });

  it("metadata es null si no se pasa", async () => {
    const evento = await registrarEvento(usuario.id, "primera_venta", 20);
    expect(evento?.metadata).toBeNull();
  });

  it("es idempotente por claveUnica: la segunda vez devuelve null y no suma", async () => {
    expect(await registrarEvento(usuario.id, "x", 1, { claveUnica: `test:${usuario.id}` })).not.toBeNull();
    expect(await registrarEvento(usuario.id, "x", 1, { claveUnica: `test:${usuario.id}` })).toBeNull();
    expect(await totalPuntos(usuario.id)).toBe(1);
  });
});

describe("totalPuntos", () => {
  let usuario: Usuario;
  beforeEach(async () => {
    usuario = await crearUsuarioDePrueba();
  });
  afterEach(() => limpiarUsuarios([usuario.id]));

  it("devuelve 0 sin eventos", async () => {
    expect(await totalPuntos(usuario.id)).toBe(0);
  });

  it("suma los puntos de todos los eventos del usuario", async () => {
    await registrarEvento(usuario.id, "compra_realizada", 10);
    await registrarEvento(usuario.id, "visita_pagina", 4.5);
    await registrarEvento(usuario.id, "penalizacion", -3);

    expect(await totalPuntos(usuario.id)).toBe(11.5);
  });
});

// ---------------------------------------------------------------------------
// Disparadores integrados con otros módulos
// ---------------------------------------------------------------------------

describe("puntos del vendedor", () => {
  let vendedor: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    vendedor = await crearUsuarioDePrueba("vendedor");
    tienda = await crearTienda(vendedor, { nombre: "Almacén Test", direccion: "D", lat: -31.53, lon: -68.52 });
  });
  afterEach(() => limpiarUsuarios([vendedor.id]));

  it("producto_cargado: +1 al crear un producto, una sola vez por producto de catálogo", async () => {
    const p = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Yerba" }, precio: 10, stock: 1 });
    await crearProducto(vendedor, tienda.id, { catalogoId: p.catalogoId, precio: 12, stock: 1 });

    const eventos = await prisma.eventoPuntos.findMany({ where: { usuarioId: vendedor.id, tipo: "producto_cargado" } });
    expect(eventos).toHaveLength(1);
    expect(Number(eventos[0].puntos)).toBe(1);
    expect(eventos[0].tiendaId).toBe(tienda.id);
  });

  it("foto_cargada: +1 al poner la primera foto propia (premium), una vez por producto", async () => {
    await prisma.tienda.update({ where: { id: tienda.id }, data: { plan: "premium" } });
    const p = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Queso" }, precio: 10, stock: 1 });
    await actualizarProducto(vendedor, p.id, { imagenUrl: "http://s3/a.jpg" });
    await actualizarProducto(vendedor, p.id, { imagenUrl: "http://s3/b.jpg" });

    expect(await prisma.eventoPuntos.count({ where: { usuarioId: vendedor.id, tipo: "foto_cargada" } })).toBe(1);
  });
});

describe("puntos por venta / compra", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;
  let arroz: Producto;
  let gaseosa: Producto;

  beforeEach(async () => {
    vendedor = await crearUsuarioDePrueba("vendedor");
    comprador = await crearUsuarioDePrueba("comprador");
    tienda = await crearTienda(vendedor, { nombre: "Almacén Ventas", direccion: "D", lat: -31.53, lon: -68.52 });
    arroz = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Arroz" }, precio: 10, stock: 100 });
    gaseosa = await crearProducto(vendedor, tienda.id, { nuevo: { nombre: "Gaseosa" }, precio: 10, stock: 100 });
  });
  afterEach(async () => {
    await prisma.configuracionSistema.deleteMany({});
    await limpiarUsuarios([vendedor.id, comprador.id]);
  });

  async function puntos(usuarioId: string, tipo: string) {
    const eventos = await prisma.eventoPuntos.findMany({ where: { usuarioId, tipo } });
    return eventos.reduce((s, e) => s + Number(e.puntos), 0);
  }

  it("venta_realizada para el vendedor con la fórmula 1 + 0,1·D + 0,1·U", async () => {
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: arroz.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 6 }],
    });
    expect(await puntos(vendedor.id, "venta_realizada")).toBe(1.8);
  });

  it("venta sin comprador identificado: puntos al vendedor, nada al comprador", async () => {
    await crearVentaPresencial(vendedor, tienda.id, { items: [{ productoId: arroz.id, cantidad: 1 }] });
    expect(await puntos(vendedor.id, "venta_realizada")).toBe(1.1);
    expect(await totalPuntos(comprador.id)).toBe(0);
  });

  it("compra_realizada: +1 si la compra tiene ≥2 productos; 1 caramelo no suma", async () => {
    await crearVentaPresencial(vendedor, tienda.id, { compradorId: comprador.id, items: [{ productoId: arroz.id, cantidad: 1 }] });
    expect(await puntos(comprador.id, "compra_realizada")).toBe(0);

    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: arroz.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }],
    });
    expect(await puntos(comprador.id, "compra_realizada")).toBe(1);
  });

  it("visita_compra requiere check-in GPS el mismo día", async () => {
    await crearVentaPresencial(vendedor, tienda.id, { compradorId: comprador.id, items: [{ productoId: arroz.id, cantidad: 1 }] });
    expect(await puntos(comprador.id, "visita_compra")).toBe(0);
  });

  it("check-in después de la compra acredita la visita retroactivamente (y el check-in suma aparte)", async () => {
    await crearVentaPresencial(vendedor, tienda.id, { compradorId: comprador.id, items: [{ productoId: arroz.id, cantidad: 1 }] });
    await prisma.checkInTienda.create({ data: { compradorId: comprador.id, tiendaId: tienda.id, distanciaM: 10 } });
    const otorgados = await otorgarPorCheckIn(comprador.id, tienda.id, new Date());

    expect(otorgados).toBe(2);
    expect(await puntos(comprador.id, "checkin_gps")).toBe(1);
    expect(await puntos(comprador.id, "visita_compra")).toBe(1);
  });

  it("check-in: una vez por día por tienda", async () => {
    await prisma.checkInTienda.create({ data: { compradorId: comprador.id, tiendaId: tienda.id, distanciaM: 10 } });
    expect(await otorgarPorCheckIn(comprador.id, tienda.id, new Date())).toBe(1);
    expect(await otorgarPorCheckIn(comprador.id, tienda.id, new Date())).toBe(0);
  });

  it("2ª compra del día en la misma tienda: visita solo si supera N productos distintos (config)", async () => {
    await actualizarConfig({ ...vendedor, esAdmin: true }, "gamificacion.umbral_items_compra_extra", 1);
    await prisma.checkInTienda.create({ data: { compradorId: comprador.id, tiendaId: tienda.id, distanciaM: 10 } });
    await otorgarPorCheckIn(comprador.id, tienda.id, new Date());

    // 1ª compra: siempre suma
    await crearVentaPresencial(vendedor, tienda.id, { compradorId: comprador.id, items: [{ productoId: arroz.id, cantidad: 1 }] });
    // 2ª: 1 producto distinto, no supera N=1
    await crearVentaPresencial(vendedor, tienda.id, { compradorId: comprador.id, items: [{ productoId: arroz.id, cantidad: 1 }] });
    // 3ª: 2 productos distintos, supera N=1
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: arroz.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }],
    });

    expect(await puntos(comprador.id, "visita_compra")).toBe(2);
  });

  it("historialPuntos muestra tienda, contraparte y descripción", async () => {
    await crearVentaPresencial(vendedor, tienda.id, {
      compradorId: comprador.id,
      items: [{ productoId: arroz.id, cantidad: 1 }, { productoId: gaseosa.id, cantidad: 1 }],
    });

    const hv = await historialPuntos(vendedor, {});
    const venta = hv.data.find((m) => m.tipo === "venta_realizada");
    expect(venta).toMatchObject({ tienda: { id: tienda.id, nombre: "Almacén Ventas" }, contraparte: { id: comprador.id } });
    expect(venta?.descripcion).toBeTruthy();

    const hc = await historialPuntos(comprador, { page: 1, pageSize: 10 });
    expect(hc.total).toBe(1);
    expect(hc.data[0]).toMatchObject({ tipo: "compra_realizada", puntos: 1, tienda: { nombre: "Almacén Ventas" } });
  });
});

describe("registrarVisitaPagina", () => {
  let vendedor: Usuario;
  let comprador: Usuario;
  let tienda: Tienda;

  beforeEach(async () => {
    vendedor = await crearUsuarioDePrueba("vendedor");
    comprador = await crearUsuarioDePrueba("comprador");
    tienda = await crearTienda(vendedor, { nombre: "Almacén Visitas", direccion: "D", lat: -31.53, lon: -68.52 });
  });
  afterEach(() => limpiarUsuarios([vendedor.id, comprador.id]));

  it("5 la primera vez del mes, 0 si repite en el mes, 4,5 el mes siguiente", async () => {
    expect(await registrarVisitaPagina(comprador, tienda.id, new Date("2026-01-10T15:00:00Z"))).toBe(5);
    expect(await registrarVisitaPagina(comprador, tienda.id, new Date("2026-01-20T15:00:00Z"))).toBe(0);
    expect(await registrarVisitaPagina(comprador, tienda.id, new Date("2026-02-02T15:00:00Z"))).toBe(4.5);
    expect(await totalPuntos(comprador.id)).toBe(9.5);
  });

  it("el dueño no suma puntos visitando su propia tienda", async () => {
    expect(await registrarVisitaPagina(vendedor, tienda.id, new Date("2026-01-10T15:00:00Z"))).toBe(0);
  });

  it("TIENDA_NO_ENCONTRADA con una tienda inexistente", async () => {
    await expect(registrarVisitaPagina(comprador, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      code: "TIENDA_NO_ENCONTRADA",
    });
  });
});
