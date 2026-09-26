import {
  distanciaHaversineKm,
  ordenarRecorrido,
  armarPlanes,
  motivoFaltante,
  type TiendaCandidata,
  type Oferta,
  type DiagnosticoItem,
} from "./planes";

// Tiendas sobre un mismo meridiano al norte del origen: 0,01° de latitud ≈ 1,112 km.
const ORIGEN = { lat: 0, lon: 0 };
function tienda(id: string, lat: number): TiendaCandidata {
  return {
    id,
    nombre: `Tienda ${id}`,
    direccion: "D",
    lat,
    lon: 0,
    distanciaKm: distanciaHaversineKm(ORIGEN, { lat, lon: 0 }),
    verificada: false,
    estadoApertura: { estado: "desconocido" },
  };
}
const C = tienda("C", 0.0045); // ~0,5 km
const A = tienda("A", 0.01); // ~1,1 km
const B = tienda("B", 0.02); // ~2,2 km

const ITEMS = [
  { catalogoId: "yerba", nombre: "Yerba", cantidad: 1 },
  { catalogoId: "fideos", nombre: "Fideos", cantidad: 2 },
  { catalogoId: "aceite", nombre: "Aceite", cantidad: 1 },
];

function oferta(tiendaId: string, catalogoId: string, precioUnitario: number): Oferta {
  return { tiendaId, catalogoId, productoId: `${tiendaId}-${catalogoId}`, precioUnitario };
}

// A cubre todo (400); B tiene yerba y fideos más baratos; C tiene el aceite más barato.
const OFERTAS: Oferta[] = [
  oferta("A", "yerba", 100),
  oferta("A", "fideos", 50),
  oferta("A", "aceite", 200),
  oferta("B", "yerba", 80),
  oferta("B", "fideos", 40),
  oferta("C", "aceite", 150),
];

describe("distanciaHaversineKm", () => {
  it("0,01° de latitud ≈ 1,112 km", () => {
    expect(distanciaHaversineKm({ lat: 0, lon: 0 }, { lat: 0.01, lon: 0 })).toBeCloseTo(1.112, 2);
  });
  it("distancia 0 al mismo punto", () => {
    expect(distanciaHaversineKm({ lat: -31.5, lon: -68.5 }, { lat: -31.5, lon: -68.5 })).toBe(0);
  });
});

describe("ordenarRecorrido (vecino más cercano desde el origen, sin volver)", () => {
  it("ordena por cercanía y suma los tramos", () => {
    const r = ordenarRecorrido(ORIGEN, [B, C, A]);
    expect(r.orden).toEqual(["C", "A", "B"]);
    expect(r.distanciaKm).toBeCloseTo(2.224, 2);
  });
  it("sin paradas: distancia 0", () => {
    expect(ordenarRecorrido(ORIGEN, [])).toEqual({ orden: [], distanciaKm: 0 });
  });
});

describe("armarPlanes (15-itinerario.md, fase 1)", () => {
  const base = { origen: ORIGEN, items: ITEMS, tiendas: [A, B, C], ofertas: OFERTAS, maxTiendas: 3 };

  it("arma los tres planes: todo en un lugar, precio más bajo y mejor equilibrio", () => {
    const { planes } = armarPlanes({ ...base, costoKm: 100 });
    const porEtiqueta = (e: string) => planes.find((p) => p.etiquetas.includes(e as never))!;

    const una = porEtiqueta("una_tienda");
    expect(una.paradas.map((p) => p.tienda.id)).toEqual(["A"]);
    expect(una.subtotal).toBe(400);
    expect(una.faltantes).toEqual([]);
    expect(una.ahorroVsUnaTienda).toBe(0);

    const barato = porEtiqueta("mas_barato");
    expect(barato.paradas.map((p) => p.tienda.id)).toEqual(["C", "B"]);
    expect(barato.subtotal).toBe(310);
    expect(barato.distanciaKm).toBeCloseTo(2.22, 1);
    expect(barato.ahorroVsUnaTienda).toBe(90);
    expect(barato.paradas[1].items.map((i) => i.catalogoId).sort()).toEqual(["fideos", "yerba"]);
    expect(barato.paradas[1].subtotal).toBe(160);

    const equilibrado = porEtiqueta("equilibrado");
    expect(equilibrado.paradas.map((p) => p.tienda.id)).toEqual(["C", "A"]);
    expect(equilibrado.subtotal).toBe(350);
    expect(equilibrado.costoTotal).toBeCloseTo(350 + 111.2, 0);
    expect(equilibrado.ahorroVsUnaTienda).toBe(50);
  });

  it("si dos planes tienen las mismas paradas se devuelven como uno solo con ambas etiquetas", () => {
    // Con el km casi gratis, el más barato también es el mejor equilibrio.
    const { planes } = armarPlanes({ ...base, costoKm: 1 });
    expect(planes).toHaveLength(2);
    const combinado = planes.find((p) => p.etiquetas.includes("mas_barato"))!;
    expect(combinado.etiquetas).toEqual(["mas_barato", "equilibrado"]);
  });

  it("maxTiendas=1: un único plan de una tienda con las tres etiquetas", () => {
    const { planes } = armarPlanes({ ...base, costoKm: 100, maxTiendas: 1 });
    expect(planes).toHaveLength(1);
    expect(planes[0].etiquetas).toEqual(["una_tienda", "mas_barato", "equilibrado"]);
    expect(planes[0].paradas[0].tienda.id).toBe("A");
  });

  it("prioriza cubrir más ítems antes que el precio", () => {
    // D vende solo yerba, regalada: no puede ganarle a A como 'todo en un lugar'.
    const D = tienda("D", 0.001);
    const { planes } = armarPlanes({
      ...base,
      tiendas: [A, D],
      ofertas: [...OFERTAS.filter((o) => o.tiendaId === "A"), oferta("D", "yerba", 1)],
      costoKm: 100,
    });
    expect(planes.find((p) => p.etiquetas.includes("una_tienda"))!.paradas[0].tienda.id).toBe("A");
  });

  it("ítems sin ninguna oferta van a sinOfertas y a los faltantes de cada plan", () => {
    const { planes, sinOfertas } = armarPlanes({
      ...base,
      items: [...ITEMS, { catalogoId: "cafe", nombre: "Café", cantidad: 1 }],
      costoKm: 100,
    });
    expect(sinOfertas).toEqual(["cafe"]);
    expect(planes.every((p) => p.faltantes.some((f) => f.catalogoId === "cafe"))).toBe(true);
  });

  it("sin ofertas: sin planes y todo en sinOfertas", () => {
    const r = armarPlanes({ ...base, ofertas: [], costoKm: 100 });
    expect(r.planes).toEqual([]);
    expect(r.sinOfertas).toEqual(["yerba", "fideos", "aceite"]);
  });

  it("comparativa: por ítem, todas las ofertas ordenadas por precio", () => {
    const { comparativa } = armarPlanes({ ...base, costoKm: 100 });
    const fideos = comparativa.find((f) => f.catalogoId === "fideos")!;
    expect(fideos.ofertas).toEqual([
      { tiendaId: "B", precioUnitario: 40, subtotal: 80 },
      { tiendaId: "A", precioUnitario: 50, subtotal: 100 },
    ]);
  });

  it("si una tienda tiene dos productos del mismo catálogo, usa el más barato", () => {
    const { comparativa } = armarPlanes({
      ...base,
      ofertas: [...OFERTAS, { ...oferta("A", "yerba", 70), productoId: "A-yerba-2" }],
      costoKm: 100,
    });
    const yerbaA = comparativa.find((f) => f.catalogoId === "yerba")!.ofertas.filter((o) => o.tiendaId === "A");
    expect(yerbaA).toEqual([{ tiendaId: "A", precioUnitario: 70, subtotal: 70 }]);
  });
});

describe("motivoFaltante (15-itinerario.md §7)", () => {
  const sinNada: DiagnosticoItem = { enRadio: [], masCercanaFueraKm: null };
  const opts = { tieneOfertaValida: false, soloAbiertas: false };

  it("limite_del_plan si el ítem tiene oferta válida en el radio", () => {
    expect(motivoFaltante(1, sinNada, { ...opts, tieneOfertaValida: true })).toEqual({ tipo: "limite_del_plan" });
  });

  it("stock_insuficiente con el stock máximo y la tienda", () => {
    const d: DiagnosticoItem = {
      enRadio: [
        { tiendaId: "a", tiendaNombre: "Almacén A", stock: 1, abierta: true },
        { tiendaId: "b", tiendaNombre: "Almacén B", stock: 2, abierta: true },
      ],
      masCercanaFueraKm: null,
    };
    expect(motivoFaltante(3, d, opts)).toEqual({ tipo: "stock_insuficiente", stockMaximo: 2, tiendaStockMaximo: "Almacén B" });
  });

  it("solo_cerradas: con soloAbiertas, solo lo tienen tiendas cerradas con stock", () => {
    const d: DiagnosticoItem = {
      enRadio: [
        { tiendaId: "a", tiendaNombre: "A", stock: 5, abierta: false },
        { tiendaId: "b", tiendaNombre: "B", stock: 9, abierta: false },
      ],
      masCercanaFueraKm: 8,
    };
    expect(motivoFaltante(1, d, { ...opts, soloAbiertas: true })).toEqual({ tipo: "solo_cerradas", cantidadTiendas: 2 });
  });

  it("stock_insuficiente gana a solo_cerradas si hay abiertas con poco stock", () => {
    const d: DiagnosticoItem = {
      enRadio: [
        { tiendaId: "a", tiendaNombre: "A", stock: 1, abierta: true },
        { tiendaId: "b", tiendaNombre: "B", stock: 9, abierta: false },
      ],
      masCercanaFueraKm: null,
    };
    expect(motivoFaltante(2, d, { ...opts, soloAbiertas: true })).toMatchObject({ tipo: "stock_insuficiente", stockMaximo: 1 });
  });

  it("fuera_de_radio con la distancia de la más cercana", () => {
    expect(motivoFaltante(1, { enRadio: [], masCercanaFueraKm: 5.6 }, opts)).toEqual({ tipo: "fuera_de_radio", masCercanaKm: 5.6 });
  });

  it("sin_oferta si nadie lo publica", () => {
    expect(motivoFaltante(1, sinNada, opts)).toEqual({ tipo: "sin_oferta" });
  });
});

describe("armarPlanes: cobertura y motivos", () => {
  const base = { origen: ORIGEN, tiendas: [A, B, C], ofertas: OFERTAS, maxTiendas: 3, costoKm: 100 };

  it("cada plan informa cubiertos/totalItems", () => {
    const { planes } = armarPlanes({ ...base, items: ITEMS });
    const una = planes.find((p) => p.etiquetas.includes("una_tienda"))!;
    expect(una).toMatchObject({ cubiertos: 3, totalItems: 3 });
  });

  it("faltante por el límite de paradas del plan -> limite_del_plan", () => {
    // Con 1 parada máx., el plan de A no puede incluir nada de B/C; con items que solo
    // tiene C, falta por el límite.
    const items = [...ITEMS, { catalogoId: "leche", nombre: "Leche", cantidad: 1 }];
    const ofertas = [...OFERTAS, oferta("C", "leche", 10)];
    const { planes } = armarPlanes({ ...base, items, ofertas, maxTiendas: 1 });
    const falta = planes[0].faltantes.find((f) => f.catalogoId === "leche")!;
    expect(falta.motivo).toEqual({ tipo: "limite_del_plan" });
    expect(planes[0]).toMatchObject({ cubiertos: 3, totalItems: 4 });
  });

  it("ítem sin ofertas: usa el diagnóstico (fuera_de_radio) en faltantes y en motivos", () => {
    const items = [...ITEMS, { catalogoId: "queso", nombre: "Queso", cantidad: 1 }];
    const r = armarPlanes({
      ...base,
      items,
      diagnosticos: { queso: { enRadio: [], masCercanaFueraKm: 5.6 } },
    });
    expect(r.motivos.queso).toEqual({ tipo: "fuera_de_radio", masCercanaKm: 5.6 });
    expect(r.planes[0].faltantes.find((f) => f.catalogoId === "queso")!.motivo).toEqual({
      tipo: "fuera_de_radio",
      masCercanaKm: 5.6,
    });
  });

  it("sin diagnóstico, un ítem sin ofertas es sin_oferta", () => {
    const r = armarPlanes({ ...base, items: [...ITEMS, { catalogoId: "cafe", nombre: "Café", cantidad: 1 }] });
    expect(r.motivos.cafe).toEqual({ tipo: "sin_oferta" });
  });
});
