import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/errors";
import { registrarUsuario, type Usuario } from "@/lib/auth/auth";
import { crearTienda, type Tienda } from "@/lib/tiendas/tiendas";
import { crearProducto } from "@/lib/productos/productos";
import { crearLista } from "@/lib/listas/listas";
import { compararItems, compararLista } from "./itinerario";

// Zona inventada en el medio del océano para no chocar con tiendas de otros tests/seed.
const LAT = -40.123;
const LON = -20.456;

const cerradaSiempre: Array<{ diaSemana: number; abre: string | null; cierra: string | null }> = Array.from(
  { length: 7 },
  (_, diaSemana) => ({ diaSemana, abre: null, cierra: null })
);
const abiertaSiempre = Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, abre: "00:00", cierra: "23:59" }));

describe("compararItems / compararLista (15-itinerario.md)", () => {
  const usuarios: string[] = [];
  let a: { vendedor: Usuario; tienda: Tienda };
  let b: { vendedor: Usuario; tienda: Tienda };
  let comprador: Usuario;
  let yerba: string;
  let fideos: string;

  async function vendedorConTienda(nombre: string, lat: number, horarios?: typeof cerradaSiempre) {
    const vendedor = await registrarUsuario({
      email: `test-itinerario-${nombre.replace(/\W/g, "")}-${Date.now()}@almacenia.test`,
      password: "password123",
      nombre,
    });
    usuarios.push(vendedor.id);
    const tienda = await crearTienda(vendedor, { nombre, direccion: "D", lat, lon: LON, horarios });
    return { vendedor, tienda };
  }

  beforeEach(async () => {
    a = await vendedorConTienda("Almacén A", LAT + 0.005, abiertaSiempre);
    b = await vendedorConTienda("Almacén B", LAT + 0.01, cerradaSiempre);
    comprador = await registrarUsuario({ email: `test-itinerario-c-${Date.now()}@almacenia.test`, password: "password123", nombre: "C" });
    usuarios.push(comprador.id);

    const pYerbaA = await crearProducto(a.vendedor, a.tienda.id, { nuevo: { nombre: "Yerba itinerario" }, precio: 100, stock: 10 });
    yerba = pYerbaA.catalogoId;
    const pFideosA = await crearProducto(a.vendedor, a.tienda.id, { nuevo: { nombre: "Fideos itinerario" }, precio: 50, stock: 10 });
    fideos = pFideosA.catalogoId;
    // B: yerba en oferta más barata; fideos sin stock suficiente para 2.
    const pYerbaB = await crearProducto(b.vendedor, b.tienda.id, { catalogoId: yerba, precio: 90, stock: 10 });
    await prisma.producto.update({ where: { id: pYerbaB.id }, data: { precioOferta: 70 } });
    await crearProducto(b.vendedor, b.tienda.id, { catalogoId: fideos, precio: 10, stock: 1 });
  });

  afterEach(async () => {
    const ids = usuarios.splice(0);
    await prisma.producto.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
    await prisma.horarioTienda.deleteMany({ where: { tienda: { vendedorId: { in: ids } } } });
    await prisma.tienda.deleteMany({ where: { vendedorId: { in: ids } } });
    await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
    await prisma.productoCatalogo.deleteMany({ where: { id: { in: [yerba, fideos].filter(Boolean) } } });
    await prisma.configuracionSistema.deleteMany({});
  });

  const ITEMS = () => [
    { catalogoId: yerba, cantidad: 1 },
    { catalogoId: fideos, cantidad: 2 },
  ];

  it("usa precioOferta, respeta el stock y arma planes con nombres del catálogo", async () => {
    const r = await compararItems({ items: ITEMS(), lat: LAT, lon: LON, radioKm: 5 });

    const filaYerba = r.comparativa.find((f) => f.catalogoId === yerba)!;
    expect(filaYerba.nombre).toBe("Yerba itinerario");
    expect(filaYerba.ofertas[0]).toMatchObject({ tiendaId: b.tienda.id, precioUnitario: 70 });

    // Fideos de B tiene stock 1 < 2: no cuenta como oferta.
    const filaFideos = r.comparativa.find((f) => f.catalogoId === fideos)!;
    expect(filaFideos.ofertas.map((o) => o.tiendaId)).toEqual([a.tienda.id]);

    const una = r.planes.find((p) => p.etiquetas.includes("una_tienda"))!;
    expect(una.paradas[0].tienda.id).toBe(a.tienda.id);
    expect(una.subtotal).toBe(200);
    expect(r.tiendas.map((t) => t.id).sort()).toEqual([a.tienda.id, b.tienda.id].sort());
    expect(r.tiendas.find((t) => t.id === b.tienda.id)!.estadoApertura.estado).toBe("cerrada");
  });

  // Una tienda sin horario cargado (estado "desconocido") tampoco cuenta como abierta.
  it("soloAbiertas descarta tiendas cerradas", async () => {
    const r = await compararItems({ items: ITEMS(), lat: LAT, lon: LON, soloAbiertas: true });
    expect(r.tiendas.map((t) => t.id)).toEqual([a.tienda.id]);
  });

  it("soloAbiertas incluye tiendas 24 hs aunque no tengan horarios", async () => {
    await prisma.tienda.update({ where: { id: b.tienda.id }, data: { abierto24hs: true } });
    const r = await compararItems({ items: ITEMS(), lat: LAT, lon: LON, soloAbiertas: true });
    expect(r.tiendas.map((t) => t.id).sort()).toEqual([a.tienda.id, b.tienda.id].sort());
    expect(r.tiendas.find((t) => t.id === b.tienda.id)!.estadoApertura).toEqual({ estado: "abierta", cierraA: null });
  });

  describe("motivos de faltantes (15-itinerario.md §7)", () => {
    const extras: string[] = [];
    afterEach(async () => {
      const ids = extras.splice(0);
      await prisma.producto.deleteMany({ where: { catalogoId: { in: ids } } });
      await prisma.productoCatalogo.deleteMany({ where: { id: { in: ids } } });
    });

    it("stock_insuficiente con el máximo disponible y la tienda", async () => {
      const r = await compararItems({ items: [{ catalogoId: fideos, cantidad: 20 }], lat: LAT, lon: LON });
      expect(r.motivos[fideos]).toEqual({ tipo: "stock_insuficiente", stockMaximo: 10, tiendaStockMaximo: "Almacén A" });
    });

    it("solo_cerradas: con soloAbiertas, un producto que solo vende una tienda cerrada", async () => {
      const queso = await crearProducto(b.vendedor, b.tienda.id, { nuevo: { nombre: "Queso itinerario" }, precio: 10, stock: 5 });
      extras.push(queso.catalogoId);
      const r = await compararItems({
        items: [{ catalogoId: yerba, cantidad: 1 }, { catalogoId: queso.catalogoId, cantidad: 1 }],
        lat: LAT,
        lon: LON,
        soloAbiertas: true,
      });
      expect(r.motivos[queso.catalogoId]).toEqual({ tipo: "solo_cerradas", cantidadTiendas: 1 });
      expect(r.planes[0].faltantes[0]).toMatchObject({ catalogoId: queso.catalogoId, motivo: { tipo: "solo_cerradas" } });
    });

    it("fuera_de_radio: lo vende una tienda a ~11 km y el radio es 5 km", async () => {
      const lejos = await vendedorConTienda("Fiambrería Lejos", LAT + 0.1, abiertaSiempre);
      const salame = await crearProducto(lejos.vendedor, lejos.tienda.id, { nuevo: { nombre: "Salame itinerario" }, precio: 10, stock: 5 });
      extras.push(salame.catalogoId);
      const r = await compararItems({
        items: [{ catalogoId: yerba, cantidad: 1 }, { catalogoId: salame.catalogoId, cantidad: 1 }],
        lat: LAT,
        lon: LON,
        radioKm: 5,
      });
      const motivo = r.motivos[salame.catalogoId];
      expect(motivo.tipo).toBe("fuera_de_radio");
      expect(motivo.tipo === "fuera_de_radio" && motivo.masCercanaKm).toBeCloseTo(11.1, 0);
    });

    it("sin_oferta si nadie lo publica", async () => {
      const cafe = await prisma.productoCatalogo.create({ data: { nombre: "Café itinerario" } });
      extras.push(cafe.id);
      const r = await compararItems({ items: [{ catalogoId: cafe.id, cantidad: 1 }], lat: LAT, lon: LON });
      expect(r.motivos[cafe.id]).toEqual({ tipo: "sin_oferta" });
      expect(r.planes).toEqual([]);
    });
  });

  it("usa el costo por km de la configuración", async () => {
    await prisma.configuracionSistema.create({ data: { clave: "itinerario.costo_km", valor: 0 } });
    const r = await compararItems({ items: ITEMS(), lat: LAT, lon: LON });
    expect(r.planes.every((p) => p.costoDistancia === 0)).toBe(true);
  });

  it("errores de validación", async () => {
    await expect(compararItems({ items: [], lat: LAT, lon: LON })).rejects.toMatchObject<Partial<AppError>>({
      code: "ITEMS_LISTA_INVALIDOS",
    });
    await expect(compararItems({ items: ITEMS(), lat: 999, lon: LON })).rejects.toMatchObject<Partial<AppError>>({
      code: "UBICACION_INVALIDA",
    });
    await expect(compararItems({ items: ITEMS(), lat: LAT, lon: LON, radioKm: 80 })).rejects.toMatchObject<
      Partial<AppError>
    >({ code: "RADIO_INVALIDO" });
    await expect(compararItems({ items: ITEMS(), lat: LAT, lon: LON, maxTiendas: 4 })).rejects.toMatchObject<
      Partial<AppError>
    >({ code: "MAX_TIENDAS_INVALIDO" });
  });

  it("compararLista compara una lista guardada del comprador; ajena = LISTA_NO_ENCONTRADA", async () => {
    const lista = await crearLista(comprador, { nombre: "Semana", items: ITEMS() });
    const r = await compararLista(comprador, lista.id, { lat: LAT, lon: LON });
    expect(r.planes.length).toBeGreaterThan(0);

    await expect(compararLista(a.vendedor, lista.id, { lat: LAT, lon: LON })).rejects.toMatchObject<Partial<AppError>>({
      code: "LISTA_NO_ENCONTRADA",
    });
  });
});
