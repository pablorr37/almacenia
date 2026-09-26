// Tiendas del seed (docs/deploy-coolify.md, "Seed de demo"): ubicaciones reales de
// comercios de barrio del Gran San Juan publicadas en OpenStreetMap (© colaboradores
// de OpenStreetMap, ODbL), con un nombre de fantasía parecido al real — nunca el
// real. Si OSM no responde, se completan con tiendas generadas localmente.
// Funciones puras salvo consultarOverpass (fetch inyectable).
import { AppError } from "@/lib/errors";

export type Rubro = "almacen" | "verduleria" | "kiosco" | "panaderia" | "fiambreria";

export interface TiendaSeed {
  nombre: string;
  nombreReal: string | null; // solo para el log, no se guarda
  descripcion: string;
  rubro: Rubro;
  vendedorNombre: string;
  departamento: string;
  direccion: string;
  lat: number;
  lon: number;
}

export interface ElementoOsm {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Centro aproximado de cada departamento del Gran San Juan.
export const DEPARTAMENTOS: Record<string, { lat: number; lon: number }> = {
  Capital: { lat: -31.5375, lon: -68.5364 },
  Rivadavia: { lat: -31.525, lon: -68.585 },
  Chimbas: { lat: -31.4917, lon: -68.545 },
  Rawson: { lat: -31.585, lon: -68.535 },
  "Santa Lucía": { lat: -31.535, lon: -68.47 },
  Pocito: { lat: -31.67, lon: -68.585 },
  Concepción: { lat: -31.545, lon: -68.525 },
  Trinidad: { lat: -31.55, lon: -68.5 },
  Desamparados: { lat: -31.56, lon: -68.545 },
};

const RUBROS: Rubro[] = ["almacen", "kiosco", "verduleria", "panaderia", "fiambreria"];

const ETIQUETA_RUBRO: Record<Rubro, string> = {
  almacen: "Almacén",
  kiosco: "Kiosco",
  verduleria: "Verdulería",
  panaderia: "Panadería",
  fiambreria: "Fiambrería",
};

const DESCRIPCIONES: Record<Rubro, string[]> = {
  almacen: ["Almacén de barrio de toda la vida.", "Todo lo que necesitás, cerca de casa.", "Despensa familiar, atención de barrio."],
  kiosco: ["Golosinas, bebidas y lo que haga falta.", "Kiosco de esquina, siempre con hielo frío.", "Bebidas frías y cargas de celular."],
  verduleria: ["Verdura y fruta fresca todos los días.", "Directo del productor a tu mesa.", "Fruta de estación a buen precio."],
  panaderia: ["Pan casero y facturas recién horneadas.", "Pan de campo y tortas por encargue.", "Facturas, pan dulce y masas finas."],
  fiambreria: ["Fiambres y quesos, cortados al momento.", "Fiambres finos, atención personalizada.", "Picadas armadas y quesos de la zona."],
};

// Nombres cuyanos para cuando el real no tiene una parte propia transformable.
const FANTASIA = [
  "El Zonda", "La Ramada", "El Pedernal", "La Parral", "El Chañaral", "La Viña", "El Trapiche", "La Costanera",
  "El Bermejo", "La Superiora", "El Tamarisco", "Los Sauces", "El Algarrobo", "La Acequia", "El Retamo",
  "Las Moras", "El Jarillal", "La Tunita", "El Médano", "Los Olivos", "La Higuera", "El Aromo", "La Punta",
  "El Mogote", "Las Tapias", "El Molle", "La Tapera", "Los Berros", "El Villicum", "La Cañada",
];

const NOMBRES = [
  "José", "Herminia", "Aldo", "Encarnación", "Ramón", "Marisa", "Oscar", "Patricia", "Luis", "Silvia",
  "Roberto", "Gabriela", "Néstor", "Claudia", "Hugo", "Mónica", "Diego", "Andrea", "Carlos", "Beatriz",
];
const APELLIDOS = [
  "Quiroga", "Ávila", "Bazán", "Videla", "Funes", "Godoy", "Moya", "Achem", "Castro", "Salinas",
  "Vega", "Ontiveros", "Correa", "Guiñazú", "Páez", "Lucero", "Rearte", "Escudero", "Tello", "Balmaceda",
];

// Definiciones históricas del seed (las primeras 20 tiendas locales).
const HISTORICAS: Array<{ nombre: string; descripcion: string; rubro: Rubro; vendedorNombre: string; departamento: string }> = [
  { nombre: "Almacén Don Cuyano", descripcion: "Almacén de barrio de toda la vida.", rubro: "almacen", vendedorNombre: "José Quiroga", departamento: "Capital" },
  { nombre: "Despensa La Parral", descripcion: "Despensa familiar, productos frescos.", rubro: "almacen", vendedorNombre: "Herminia Ávila", departamento: "Rivadavia" },
  { nombre: "Kiosco El Zondino", descripcion: "Golosinas, bebidas y lo que haga falta.", rubro: "kiosco", vendedorNombre: "Aldo Bazán", departamento: "Chimbas" },
  { nombre: "Verdulería Bermejo", descripcion: "Verdura y fruta fresca todos los días.", rubro: "verduleria", vendedorNombre: "Encarnación Videla", departamento: "Rawson" },
  { nombre: "Panadería Doña Encarnación", descripcion: "Pan casero y facturas recién horneadas.", rubro: "panaderia", vendedorNombre: "Ramón Funes", departamento: "Santa Lucía" },
  { nombre: "Fiambrería Rivadavia", descripcion: "Fiambres y quesos, cortados al momento.", rubro: "fiambreria", vendedorNombre: "Marisa Godoy", departamento: "Rivadavia" },
  { nombre: "Almacén La Ramada", descripcion: "Almacén completo, ofertas todas las semanas.", rubro: "almacen", vendedorNombre: "Oscar Moya", departamento: "Pocito" },
  { nombre: "Kiosco 24hs San Martín", descripcion: "Abierto siempre, sobre la avenida.", rubro: "kiosco", vendedorNombre: "Patricia Achem", departamento: "Capital" },
  { nombre: "Verdulería El Pedernal", descripcion: "Directo del productor a tu mesa.", rubro: "verduleria", vendedorNombre: "Luis Castro", departamento: "Concepción" },
  { nombre: "Despensa Doña Herminia", descripcion: "La despensa de siempre, atención de barrio.", rubro: "almacen", vendedorNombre: "Silvia Salinas", departamento: "Trinidad" },
  { nombre: "Almacén El Chañaral", descripcion: "Todo lo que necesitás, cerca de casa.", rubro: "almacen", vendedorNombre: "Roberto Vega", departamento: "Desamparados" },
  { nombre: "Kiosco El Zonda", descripcion: "Kiosco de esquina, siempre con hielo frío.", rubro: "kiosco", vendedorNombre: "Gabriela Ontiveros", departamento: "Rawson" },
  { nombre: "Panadería El Trapiche", descripcion: "Pan de campo y tortas por encargue.", rubro: "panaderia", vendedorNombre: "Néstor Correa", departamento: "Pocito" },
  { nombre: "Fiambrería Don Aldo", descripcion: "Fiambres finos, atención personalizada.", rubro: "fiambreria", vendedorNombre: "Claudia Guiñazú", departamento: "Chimbas" },
  { nombre: "Almacén La Costanera", descripcion: "Almacén de ruta, parada obligada.", rubro: "almacen", vendedorNombre: "Hugo Páez", departamento: "Santa Lucía" },
  { nombre: "Verdulería Rawson", descripcion: "Verdura fresca, precios de mercado.", rubro: "verduleria", vendedorNombre: "Mónica Lucero", departamento: "Rawson" },
  { nombre: "Kiosco Punta de Rieles", descripcion: "El kiosco de la estación.", rubro: "kiosco", vendedorNombre: "Diego Rearte", departamento: "Trinidad" },
  { nombre: "Despensa La Viña", descripcion: "Despensa de campo, productos de la zona.", rubro: "almacen", vendedorNombre: "Andrea Escudero", departamento: "Concepción" },
  { nombre: "Almacén Calle Vieja", descripcion: "Almacén tradicional, fiado de confianza.", rubro: "almacen", vendedorNombre: "Carlos Tello", departamento: "Desamparados" },
  { nombre: "Panadería La Superiora", descripcion: "Facturas, pan dulce y masas finas.", rubro: "panaderia", vendedorNombre: "Beatriz Quiroga", departamento: "Capital" },
];

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

function elegir<T>(lista: T[], i: number): T {
  return lista[((i % lista.length) + lista.length) % lista.length];
}

// ---------------------------------------------------------------------------
// Nombre de fantasía
// ---------------------------------------------------------------------------

const PALABRAS_RUBRO = new Set([
  "almacen", "despensa", "kiosco", "kiosko", "maxikiosco", "maxi", "verduleria", "fruteria", "verduras",
  "panaderia", "fiambreria", "minimercado", "mini", "mercado", "minimarket", "autoservicio", "supermercado",
  "super", "polirrubro", "carniceria", "rotiseria", "panificadora", "granja", "fiambres", "quesos",
]);
const CONECTORES = new Set(["don", "dona", "la", "el", "los", "las", "de", "del", "san", "santa", "y", "lo"]);

// "KIOSCO" → "Kiosco"; respeta lo que ya viene en mayúscula/minúscula mixta.
function capitalizar(token: string): string {
  if (token.length > 1 && token === token.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(token)) {
    return token[0] + token.slice(1).toLowerCase();
  }
  return token;
}

// Diminutivo (o aumentativo si ya es diminutivo): parecido pero distinto.
function transformar(palabra: string): string {
  const sinTildes = palabra.replace(/[áéíóú]/g, (c) => "aeiou"["áéíóú".indexOf(c)]);
  const m = sinTildes.match(/^(.*)(itos|itas|ito|ita)$/i);
  if (m && m[1].length >= 1) {
    const aumentativo: Record<string, string> = { itos: "otes", itas: "onas", ito: "ote", ita: "ona" };
    return m[1] + aumentativo[m[2].toLowerCase()];
  }
  if (/os$/i.test(sinTildes)) return sinTildes.slice(0, -2) + "itos";
  if (/as$/i.test(sinTildes)) return sinTildes.slice(0, -2) + "itas";
  if (/es$/i.test(sinTildes)) return sinTildes.slice(0, -1) + "citos"; // Rieles → Rielecitos
  if (/i[ao]$/i.test(sinTildes)) return sinTildes.slice(0, -1) + "t" + sinTildes.slice(-1); // Rivadavia → Rivadavita
  if (/y$/i.test(sinTildes)) return sinTildes.slice(0, -1) + "ita"; // Mary → Marita
  if (/[oe]$/i.test(sinTildes)) return sinTildes.slice(0, -1) + "ito";
  if (/a$/i.test(sinTildes)) return sinTildes.slice(0, -1) + "ita";
  if (/[nrl]$/i.test(sinTildes)) return sinTildes + "cito";
  return sinTildes + "ito";
}

// Pura y determinística: conserva la palabra de rubro (o agrega la del rubro) y
// transforma la parte propia del nombre. Nunca devuelve el nombre real.
export function nombreFantasia(real: string, rubro: Rubro, semilla: number): string {
  const tokens = real.trim().split(/\s+/).filter(Boolean).map(capitalizar);
  let corte = 0;
  while (corte < tokens.length && PALABRAS_RUBRO.has(normalizar(tokens[corte]))) corte += 1;
  const prefijo = corte > 0 ? tokens.slice(0, corte) : [ETIQUETA_RUBRO[rubro]];
  const resto = tokens.slice(corte);

  const candidatos = resto
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => /^[a-záéíóúñü]{3,}$/i.test(t) && !CONECTORES.has(normalizar(t)));

  const conFantasia = (k: number) => [...prefijo, elegir(FANTASIA, semilla + k)].join(" ");
  if (candidatos.length === 0) {
    for (let k = 0; k < FANTASIA.length; k += 1) {
      const nombre = conFantasia(k);
      if (normalizar(nombre) !== normalizar(real)) return nombre;
    }
  }

  const { i } = candidatos[candidatos.length - 1];
  const nuevo = [...resto];
  nuevo[i] = transformar(resto[i]);
  const nombre = [...prefijo, ...nuevo].join(" ");
  return normalizar(nombre) !== normalizar(real) ? nombre : conFantasia(0);
}

// ---------------------------------------------------------------------------
// OSM
// ---------------------------------------------------------------------------

const SHOP_A_RUBRO: Record<string, Rubro> = {
  convenience: "almacen",
  general: "almacen",
  supermarket: "almacen",
  kiosk: "kiosco",
  greengrocer: "verduleria",
  bakery: "panaderia",
  deli: "fiambreria",
  cheese: "fiambreria",
};

// Cadenas de supermercados: la app es para comercios de barrio.
const CADENAS = /\b(carrefour|vea|disco|jumbo|chango\s*m[aá]s|d[ií]a|coto|walmart|makro|libertad|atomo|[áa]tomo|super\s*mami|la\s*an[oó]nima)\b/i;

export function rubroDeTags(tags: Record<string, string>): Rubro | null {
  const rubro = SHOP_A_RUBRO[tags.shop ?? ""];
  if (!rubro) return null;
  if (tags.brand || tags["brand:wikidata"]) return null;
  if (tags.shop === "supermarket" && tags.operator) return null;
  if (tags.name && CADENAS.test(tags.name)) return null;
  return rubro;
}

export function direccionDe(tags: Record<string, string>, departamento: string): string {
  const calle = tags["addr:street"]?.trim();
  if (!calle) return `${departamento}, San Juan`;
  const altura = tags["addr:housenumber"]?.trim();
  return `${altura ? `${calle} ${altura}` : calle}, ${departamento}, San Juan`;
}

export function departamentoMasCercano(lat: number, lon: number): string {
  let mejor = "Capital";
  let mejorDist = Infinity;
  for (const [nombre, c] of Object.entries(DEPARTAMENTOS)) {
    const d = (c.lat - lat) ** 2 + (c.lon - lon) ** 2;
    if (d < mejorDist) {
      mejor = nombre;
      mejorDist = d;
    }
  }
  return mejor;
}

function metros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

// Nombre de vendedor determinístico y único para los primeros 400 índices.
function nombreVendedor(i: number): string {
  const nombre = elegir(NOMBRES, i);
  const apellido = elegir(APELLIDOS, i * 7 + Math.floor(i / NOMBRES.length));
  return `${nombre} ${apellido}`;
}

// Garantiza nombres únicos (el seed crea una tienda por nombre).
function unico(nombre: string, usados: Set<string>, alternativas: () => string[]): string {
  for (const candidato of [nombre, ...alternativas()]) {
    if (!usados.has(normalizar(candidato))) {
      usados.add(normalizar(candidato));
      return candidato;
    }
  }
  let n = 2;
  while (usados.has(normalizar(`${nombre} ${n}`))) n += 1;
  usados.add(normalizar(`${nombre} ${n}`));
  return `${nombre} ${n}`;
}

// Filtra comercios de barrio, prioriza los que tienen nombre, deduplica (mismo
// punto o mismo nombre cerca) y mezcla rubros por turnos hasta `cantidad`.
export function seleccionarTiendas(elementos: ElementoOsm[], cantidad: number): TiendaSeed[] {
  type Candidato = { rubro: Rubro; lat: number; lon: number; tags: Record<string, string>; nombreReal: string | null };
  const candidatos: Candidato[] = [];
  for (const e of elementos) {
    const tags = e.tags ?? {};
    const rubro = rubroDeTags(tags);
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!rubro || lat === undefined || lon === undefined) continue;
    candidatos.push({ rubro, lat, lon, tags, nombreReal: tags.name?.trim() || null });
  }
  candidatos.sort((a, b) => Number(b.nombreReal !== null) - Number(a.nombreReal !== null));

  const aceptados: Candidato[] = [];
  for (const c of candidatos) {
    const duplicado = aceptados.some(
      (a) =>
        metros(a, c) < 30 ||
        (c.nombreReal !== null && a.nombreReal !== null && normalizar(a.nombreReal) === normalizar(c.nombreReal) && metros(a, c) < 300)
    );
    if (!duplicado) aceptados.push(c);
  }

  // Por turnos entre rubros: primero los que tienen nombre, después los sin nombre.
  const elegidos: Candidato[] = [];
  for (const conNombre of [true, false]) {
    const colas = RUBROS.map((r) => aceptados.filter((c) => c.rubro === r && (c.nombreReal !== null) === conNombre));
    while (elegidos.length < cantidad && colas.some((q) => q.length > 0)) {
      for (const cola of colas) {
        const c = cola.shift();
        if (c && elegidos.length < cantidad) elegidos.push(c);
      }
    }
  }

  const usados = new Set<string>();
  return elegidos.map((c, i) => {
    const departamento = departamentoMasCercano(c.lat, c.lon);
    const base = c.nombreReal
      ? nombreFantasia(c.nombreReal, c.rubro, i)
      : `${ETIQUETA_RUBRO[c.rubro]} ${elegir(FANTASIA, i)}`;
    const nombre = unico(base, usados, () => [
      ...FANTASIA.map((_, k) => `${ETIQUETA_RUBRO[c.rubro]} ${elegir(FANTASIA, i + k + 1)}`),
    ]);
    return {
      nombre,
      nombreReal: c.nombreReal,
      descripcion: elegir(DESCRIPCIONES[c.rubro], i),
      rubro: c.rubro,
      vendedorNombre: nombreVendedor(i),
      departamento,
      direccion: direccionDe(c.tags, departamento),
      lat: c.lat,
      lon: c.lon,
    };
  });
}

// Tiendas generadas sin red: las 20 históricas y, después, variantes repartidas
// en espiral alrededor de cada departamento.
export function tiendasLocales(cantidad: number, desde = 0): TiendaSeed[] {
  const deptos = Object.keys(DEPARTAMENTOS);
  const usados = new Set<string>();
  const vendedores = new Set<string>();
  const tiendas: TiendaSeed[] = [];
  for (let i = desde; i < desde + cantidad; i += 1) {
    const historica = i < HISTORICAS.length ? HISTORICAS[i] : null;
    const def = historica ?? elegir(HISTORICAS, i);
    const departamento = historica ? historica.departamento : elegir(deptos, i);
    const centro = DEPARTAMENTOS[departamento];
    const angulo = i * 2.39996;
    const radio = historica ? ((i % 7) - 3) * 0.004 : 0.004 + (i % 9) * 0.003;
    const lat = historica ? centro.lat + radio : centro.lat + radio * Math.sin(angulo);
    const lon = historica ? centro.lon - radio * 0.6 : centro.lon + radio * Math.cos(angulo);

    const base = historica ? historica.nombre : nombreFantasia(def.nombre, def.rubro, i);
    const nombre = unico(base, usados, () => FANTASIA.map((_, k) => `${ETIQUETA_RUBRO[def.rubro]} ${elegir(FANTASIA, i + k)}`));
    let vendedor = historica ? historica.vendedorNombre : nombreVendedor(i);
    for (let k = 1; vendedores.has(vendedor); k += 1) vendedor = nombreVendedor(i + k * 20);
    vendedores.add(vendedor);

    tiendas.push({
      nombre,
      nombreReal: null,
      descripcion: historica ? historica.descripcion : elegir(DESCRIPCIONES[def.rubro], i),
      rubro: def.rubro,
      vendedorNombre: vendedor,
      departamento,
      direccion: `${departamento}, San Juan`,
      lat,
      lon,
    });
  }
  return tiendas;
}

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

export async function consultarOverpass(
  opciones: { fetch?: typeof fetch; centro?: { lat: number; lon: number }; radioKm?: number } = {}
): Promise<ElementoOsm[]> {
  const { lat, lon } = opciones.centro ?? DEPARTAMENTOS.Capital;
  const radio = Math.round((opciones.radioKm ?? 15) * 1000);
  const consulta = `[out:json][timeout:50];
nwr["shop"~"^(convenience|general|supermarket|kiosk|greengrocer|bakery|deli|cheese)$"](around:${radio},${lat},${lon});
out center tags;`;

  const hacerFetch = opciones.fetch ?? fetch;
  const noDisponible = () =>
    new AppError("FUENTE_EXTERNA_NO_DISPONIBLE", "No se pudo consultar OpenStreetMap (Overpass).");
  let respuesta: Response;
  try {
    respuesta = await hacerFetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Almacenia/1.0 (seed)" },
      body: `data=${encodeURIComponent(consulta)}`,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw noDisponible();
  }
  if (!respuesta.ok) throw noDisponible();
  const json = (await respuesta.json().catch(() => null)) as { elements?: ElementoOsm[] } | null;
  if (!json || !Array.isArray(json.elements)) throw noDisponible();
  return json.elements;
}
