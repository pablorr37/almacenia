import { AppError } from "@/lib/errors";
import { palabrasClave, consultaWeb, normalizarResultados, buscarWeb } from "./buscador-web";

// Respuesta de Openverse (GET /v1/images/) armada a mano con la forma real de la API.
function resultado(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Foto ${id}`,
    foreign_landing_url: `https://www.flickr.com/photos/x/${id}`,
    url: `https://live.staticflickr.com/${id}.jpg`,
    thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`,
    creator: "Autor",
    license: "cc0",
    width: 1200,
    height: 800,
    filetype: "jpg",
    ...extra,
  };
}

describe("palabrasClave", () => {
  it("normaliza a minúsculas sin tildes y descarta medidas y envases", () => {
    expect(palabrasClave("Tomate perita (kg)")).toEqual(["tomate", "perita"]);
    expect(palabrasClave("Aceite de girasol 1.5L")).toEqual(["aceite", "girasol"]);
    expect(palabrasClave("Facturas (docena)")).toEqual(["facturas"]);
    expect(palabrasClave("Azúcar 1kg")).toEqual(["azucar"]);
  });
});

describe("consultaWeb", () => {
  it("traduce al inglés las palabras del diccionario", () => {
    expect(consultaWeb("Tomate perita (kg)")).toBe("tomato");
    expect(consultaWeb("Queso cremoso (kg)")).toBe("cheese");
    expect(consultaWeb("Aceite de girasol 1.5L")).toBe("sunflower oil");
  });

  it("mantiene los términos que no se traducen (yerba mate)", () => {
    expect(consultaWeb("Yerba mate 1kg")).toBe("yerba mate");
  });

  it("si ninguna palabra está en el diccionario, busca el texto normalizado", () => {
    expect(consultaWeb("Mantecol clásico")).toBe("mantecol clasico");
  });

  it("sin palabras útiles devuelve cadena vacía", () => {
    expect(consultaWeb("  1kg (unidad) ")).toBe("");
  });
});

describe("normalizarResultados", () => {
  it("mapea la respuesta de Openverse a ResultadoWeb", () => {
    const [r] = normalizarResultados({ results: [resultado("a1")] });
    expect(r).toEqual({
      origenUrl: "https://www.flickr.com/photos/x/a1",
      imagenUrl: "https://live.staticflickr.com/a1.jpg",
      miniaturaUrl: "https://api.openverse.org/v1/images/a1/thumb/",
      ancho: 1200,
      alto: 800,
      titulo: "Foto a1",
      autor: "Autor",
      licencia: "cc0",
    });
  });

  it("descarta menos de 600 px, sin URL o con licencia que no es cc0/pdm", () => {
    const rs = normalizarResultados({
      results: [
        resultado("chica", { width: 500 }),
        resultado("sinurl", { url: null }),
        resultado("ccby", { license: "by" }),
        resultado("ok"),
      ],
    });
    expect(rs.map((r) => r.origenUrl)).toEqual(["https://www.flickr.com/photos/x/ok"]);
  });

  it("ordena primero proporciones entre 1:1 y 16:9, después por ancho", () => {
    const rs = normalizarResultados({
      results: [
        resultado("vertical", { width: 2000, height: 3000 }),
        resultado("chica", { width: 800, height: 600 }),
        resultado("grande", { width: 1600, height: 1000 }),
        resultado("panoramica", { width: 3000, height: 1000 }),
      ],
    });
    expect(rs.map((r) => r.titulo)).toEqual(["Foto grande", "Foto chica", "Foto panoramica", "Foto vertical"]);
  });

  it("devuelve como máximo 20 y tolera una respuesta sin results", () => {
    const muchos = Array.from({ length: 30 }, (_, i) => resultado(`r${i}`));
    expect(normalizarResultados({ results: muchos })).toHaveLength(20);
    expect(normalizarResultados({})).toEqual([]);
    expect(normalizarResultados(null)).toEqual([]);
  });
});

describe("buscarWeb", () => {
  it("consulta Openverse con licencias libres y la consulta traducida", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ results: [resultado("t1")] })));
    const rs = await buscarWeb("Tomate perita (kg)", { fetch: fetchMock as unknown as typeof fetch });

    expect(rs).toHaveLength(1);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe("https://api.openverse.org/v1/images/");
    expect(url.searchParams.get("q")).toBe("tomato");
    expect(url.searchParams.get("license")).toBe("cc0,pdm");
    expect(url.searchParams.get("extension")).toBe("jpg,png");
  });

  it("consulta vacía devuelve [] sin llamar a la red", async () => {
    const fetchMock = vi.fn();
    expect(await buscarWeb("1kg", { fetch: fetchMock as unknown as typeof fetch })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lanza FUENTE_EXTERNA_NO_DISPONIBLE si la red falla o responde error", async () => {
    const caida = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(buscarWeb("tomate", { fetch: caida as unknown as typeof fetch })).rejects.toMatchObject<Partial<AppError>>({
      code: "FUENTE_EXTERNA_NO_DISPONIBLE",
    });
    const error500 = vi.fn(async () => new Response("x", { status: 503 }));
    await expect(buscarWeb("tomate", { fetch: error500 as unknown as typeof fetch })).rejects.toMatchObject<Partial<AppError>>({
      code: "FUENTE_EXTERNA_NO_DISPONIBLE",
    });
  });
});
