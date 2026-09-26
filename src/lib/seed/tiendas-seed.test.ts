import { AppError } from "@/lib/errors";
import {
  nombreFantasia,
  rubroDeTags,
  direccionDe,
  departamentoMasCercano,
  seleccionarTiendas,
  tiendasLocales,
  consultarOverpass,
  DEPARTAMENTOS,
  type ElementoOsm,
} from "./tiendas-seed";

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

describe("nombreFantasia", () => {
  it.each([
    ["Almacén Don Pepe", "Almacén Don Pepito"],
    ["Kiosco La Esquina", "Kiosco La Esquinita"],
    ["Verdulería Los Hermanos", "Verdulería Los Hermanitos"],
    ["Panadería Sol", "Panadería Solcito"],
    ["Fiambrería Rivadavia", "Fiambrería Rivadavita"],
    ["Despensa Mary", "Despensa Marita"],
    ["Kiosco Punta de Rieles", "Kiosco Punta de Rielecitos"],
  ])("%s → %s (parecido pero distinto)", (real, esperado) => {
    expect(nombreFantasia(real, "almacen", 0)).toBe(esperado);
  });

  it("si el nombre ya es diminutivo, usa aumentativo", () => {
    expect(nombreFantasia("Despensa Juancito", "almacen", 0)).toBe("Despensa Juancote");
  });

  it("agrega la palabra del rubro si el nombre real no la tiene", () => {
    expect(nombreFantasia("Don Pepe", "kiosco", 0)).toBe("Kiosco Don Pepito");
  });

  it("normaliza nombres en mayúsculas", () => {
    expect(nombreFantasia("KIOSCO LA ESQUINA", "kiosco", 0)).toBe("Kiosco La Esquinita");
  });

  it("sin parte propia (solo rubro y números) usa un nombre de la lista cuyana", () => {
    const n = nombreFantasia("Kiosco 24 hs", "kiosco", 3);
    expect(n.startsWith("Kiosco ")).toBe(true);
    expect(normalizar(n)).not.toBe(normalizar("Kiosco 24 hs"));
  });

  it("nunca coincide con el real (ignorando mayúsculas y tildes) y es determinístico", () => {
    const reales = [
      "Almacén Don Pepe", "Despensa Mary", "Kiosco", "Verdulería", "Maxikiosco El 10", "Minimercado Zonda",
      "Panadería La Espiga", "Fiambrería Tito", "Don Juan", "Autoservicio Rosita", "Kiosco Pepote",
    ];
    for (const [i, real] of reales.entries()) {
      const a = nombreFantasia(real, "almacen", i);
      expect(normalizar(a)).not.toBe(normalizar(real));
      expect(nombreFantasia(real, "almacen", i)).toBe(a);
    }
  });
});

describe("rubroDeTags", () => {
  it.each([
    [{ shop: "convenience" }, "almacen"],
    [{ shop: "general" }, "almacen"],
    [{ shop: "supermarket" }, "almacen"],
    [{ shop: "kiosk" }, "kiosco"],
    [{ shop: "greengrocer" }, "verduleria"],
    [{ shop: "bakery" }, "panaderia"],
    [{ shop: "deli" }, "fiambreria"],
    [{ shop: "cheese" }, "fiambreria"],
    [{ shop: "clothes" }, null],
    [{ amenity: "cafe" }, null],
  ])("%j → %s", (tags, rubro) => {
    expect(rubroDeTags(tags as Record<string, string>)).toBe(rubro);
  });

  it("excluye cadenas (brand) y supermercados con operator", () => {
    expect(rubroDeTags({ shop: "supermarket", brand: "Carrefour" })).toBeNull();
    expect(rubroDeTags({ shop: "convenience", "brand:wikidata": "Q1" })).toBeNull();
    expect(rubroDeTags({ shop: "supermarket", operator: "Cencosud" })).toBeNull();
    expect(rubroDeTags({ shop: "supermarket", name: "Supermercado Vea" })).toBeNull();
  });
});

describe("direccionDe / departamentoMasCercano", () => {
  it("usa calle y altura si existen; si no, el departamento", () => {
    expect(direccionDe({ "addr:street": "Av. Libertador", "addr:housenumber": "1200" }, "Capital")).toBe(
      "Av. Libertador 1200, Capital, San Juan"
    );
    expect(direccionDe({ "addr:street": "Mendoza" }, "Rawson")).toBe("Mendoza, Rawson, San Juan");
    expect(direccionDe({}, "Chimbas")).toBe("Chimbas, San Juan");
  });

  it("elige el departamento más cercano", () => {
    expect(departamentoMasCercano(DEPARTAMENTOS.Pocito.lat + 0.001, DEPARTAMENTOS.Pocito.lon)).toBe("Pocito");
    expect(departamentoMasCercano(DEPARTAMENTOS.Capital.lat, DEPARTAMENTOS.Capital.lon)).toBe("Capital");
  });
});

function nodo(id: number, tags: Record<string, string>, lat = -31.53 - id * 0.001, lon = -68.53): ElementoOsm {
  return { type: "node", id, lat, lon, tags };
}

describe("seleccionarTiendas", () => {
  it("filtra, prioriza con nombre, deduplica y balancea rubros", () => {
    const elementos: ElementoOsm[] = [
      nodo(1, { shop: "convenience", name: "Almacén Don Pepe" }),
      nodo(2, { shop: "convenience", name: "Almacén Don Pepe" }, -31.53 - 0.0011, -68.53), // duplicado a ~10 m
      nodo(3, { shop: "convenience" }), // sin nombre
      nodo(4, { shop: "kiosk", name: "Kiosco La Esquina" }),
      nodo(5, { shop: "greengrocer", name: "Verdulería Los Hermanos" }),
      nodo(6, { shop: "supermarket", brand: "Carrefour", name: "Carrefour" }),
      nodo(7, { shop: "clothes", name: "Ropa" }),
      { type: "way", id: 8, center: { lat: -31.6, lon: -68.5 }, tags: { shop: "bakery", name: "Panadería Sol" } },
      nodo(9, { shop: "convenience", name: "Despensa Mary" }),
    ];

    const tiendas = seleccionarTiendas(elementos, 4);
    expect(tiendas).toHaveLength(4);
    // Round-robin por rubro: un almacén, un kiosco, una verdulería, una panadería.
    expect(tiendas.map((t) => t.rubro).sort()).toEqual(["almacen", "kiosco", "panaderia", "verduleria"]);
    expect(tiendas.every((t) => t.nombreReal !== null)).toBe(true);
    const panaderia = tiendas.find((t) => t.rubro === "panaderia")!;
    expect(panaderia).toMatchObject({ lat: -31.6, lon: -68.5, nombre: "Panadería Solcito" });

    const todas = seleccionarTiendas(elementos, 100);
    // 1, 3, 4, 5, 8, 9 (el 2 es duplicado; 6 cadena; 7 no es rubro).
    expect(todas).toHaveLength(6);
    expect(todas.at(-1)!.nombreReal).toBeNull(); // los sin nombre van al final
    expect(new Set(todas.map((t) => normalizar(t.nombre))).size).toBe(6);
  });
});

describe("tiendasLocales", () => {
  it("genera la cantidad pedida con nombres únicos y coordenadas del Gran San Juan", () => {
    const tiendas = tiendasLocales(100);
    expect(tiendas).toHaveLength(100);
    expect(new Set(tiendas.map((t) => normalizar(t.nombre))).size).toBe(100);
    expect(new Set(tiendas.map((t) => t.vendedorNombre)).size).toBe(100);
    for (const t of tiendas) {
      expect(t.lat).toBeGreaterThan(-31.8);
      expect(t.lat).toBeLessThan(-31.4);
    }
  });

  it("las primeras 20 son las definiciones históricas del seed", () => {
    expect(tiendasLocales(1)[0].nombre).toBe("Almacén Don Cuyano");
  });
});

describe("consultarOverpass", () => {
  it("hace POST a Overpass con los tags de comercio y devuelve los elementos", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ elements: [nodo(1, { shop: "kiosk" })] })));
    const elementos = await consultarOverpass({ fetch: fetchMock as unknown as typeof fetch });
    expect(elementos).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/overpass/);
    expect(init.method).toBe("POST");
    expect(String(init.body)).toMatch(/greengrocer/);
  });

  it("lanza FUENTE_EXTERNA_NO_DISPONIBLE si falla", async () => {
    const caida = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(consultarOverpass({ fetch: caida as unknown as typeof fetch })).rejects.toMatchObject<Partial<AppError>>({
      code: "FUENTE_EXTERNA_NO_DISPONIBLE",
    });
  });
});
