// Seed de datos dummy para desarrollo/demo: usuarios (compradores y vendedores),
// tiendas con sabor sanjuanino y sus productos. Precios en ARS estimados para
// ago/sep 2026 — son una aproximación razonada (no hay forma de verificar precios
// reales de una fecha futura), no un dato de mercado real.
//
// Reutiliza las funciones ya testeadas de src/lib en vez de reimplementar los
// inserts a mano (geografía, transacciones, etc. quedan cubiertos por esa capa).
//
// Uso: npx prisma db seed (contra la base local, nunca contra producción sin
// pedido explícito). Variables (docs/deploy-coolify.md, "Seed de demo"):
//   SEED_TIENDAS=20        cantidad de tiendas
//   SEED_FUENTE=local|osm  osm: ubicaciones reales de OpenStreetMap con nombres de
//                          fantasía (src/lib/seed/tiendas-seed.ts); si falla, local
//   SEED_COMPRADORES=12    0 = sin compradores ni lista demo
//   SEED_FOTOS_WEB=1       busca fotos libres para el catálogo sin foto y las deja
//                          pendientes en el banco (16-banco-fotos.md)

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { registrarUsuario } from "../src/lib/auth/auth";
import { crearTienda, type HorarioTienda, type MedioPago } from "../src/lib/tiendas/tiendas";
import { crearProducto } from "../src/lib/productos/productos";
import { crearLista } from "../src/lib/listas/listas";
import { mejorFotoDelBanco, guardarFotoWeb } from "../src/lib/fotos/banco";
import { contieneGroseria } from "../src/lib/moderacion/moderacion";
import { buscarWeb, consultaWeb, palabrasClave } from "../src/lib/fotos/buscador-web";
import {
  consultarOverpass,
  seleccionarTiendas,
  tiendasLocales,
  type Rubro,
  type TiendaSeed,
} from "../src/lib/seed/tiendas-seed";
import { normalizarNombre } from "../src/lib/rubros-categorias/rubros-categorias";

const DOMINIO_SEED = "seed.almacenia.test";

// ---------------------------------------------------------------------------
// Horarios reutilizables
// ---------------------------------------------------------------------------

function horarioNormal(): HorarioTienda[] {
  // Lunes a sábado 09:00-21:00, domingo cerrado.
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    abre: diaSemana === 0 ? null : "09:00",
    cierra: diaSemana === 0 ? null : "21:00",
  }));
}

function horarioConDomingoMedioDia(): HorarioTienda[] {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    abre: diaSemana === 0 ? "09:00" : "08:00",
    cierra: diaSemana === 0 ? "13:00" : "20:00",
  }));
}

function horarioCierraTemprano(): HorarioTienda[] {
  // Lunes a viernes 09-19, sábado 09-13, domingo cerrado.
  return Array.from({ length: 7 }, (_, diaSemana) => {
    if (diaSemana === 0) return { diaSemana, abre: null, cierra: null };
    if (diaSemana === 6) return { diaSemana, abre: "09:00", cierra: "13:00" };
    return { diaSemana, abre: "09:00", cierra: "19:00" };
  });
}

function horarioPartido(): HorarioTienda[] {
  // Lunes a sábado 09:00-13:00 y 17:00-21:00 (siesta), domingo cerrado.
  return [
    { diaSemana: 0, abre: null, cierra: null },
    ...[1, 2, 3, 4, 5, 6].flatMap((diaSemana) => [
      { diaSemana, abre: "09:00", cierra: "13:00" },
      { diaSemana, abre: "17:00", cierra: "21:00" },
    ]),
  ];
}

function horario24hs(): HorarioTienda[] {
  // Los locales 24 hs se marcan con abierto24hs = true (02-tiendas.md), no con
  // horarios: no se cargan filas de horario.
  return [];
}

const HORARIOS = [horarioNormal, horarioConDomingoMedioDia, horarioPartido, horarioCierraTemprano, horario24hs];

// Solo los kioscos a los que les toca horario24hs son 24 hs; el resto de los rubros
// que caen en ese turno del ciclo usan el horario normal.
function es24hs(def: { rubro: string }, i: number): boolean {
  return def.rubro === "kiosco" && elegir(HORARIOS, i) === horario24hs;
}
function horarioDeTienda(i: number): () => HorarioTienda[] {
  const h = elegir(HORARIOS, i);
  return h === horario24hs ? horarioNormal : h;
}

const COMBOS_MEDIOS_DE_PAGO: MedioPago[][] = [
  ["efectivo"],
  ["efectivo", "transferencia"],
  ["efectivo", "transferencia", "mercado_pago"],
  ["efectivo", "debito", "qr"],
  ["efectivo", "transferencia", "mercado_pago", "debito", "qr"],
];

function elegir<T>(lista: T[], indice: number): T {
  return lista[indice % lista.length];
}

// ---------------------------------------------------------------------------
// Compradores
// ---------------------------------------------------------------------------

const NOMBRES_COMPRADORES = [
  "María González",
  "Juan Pérez",
  "Lucía Fernández",
  "Martín Rodríguez",
  "Sofía López",
  "Nicolás Martínez",
  "Valentina Díaz",
  "Franco Sánchez",
  "Camila Romero",
  "Agustín Torres",
  "Julieta Flores",
  "Tomás Ruiz",
];

// ---------------------------------------------------------------------------
// Productos por rubro (precios ARS estimados ago/sep 2026)
// ---------------------------------------------------------------------------

// Cada producto es una entrada del catálogo (06-catalogo.md): categoría + marca +
// variante + contenido; el nombre se compone solo ("Fideos tallarín 500 g").
interface ProductoSeed {
  categoria: string;
  marca?: string;
  variante?: string;
  contenido?: number;
  unidadContenido?: "g" | "kg" | "ml" | "l" | "u";
  unidad?: "unidad" | "kg"; // venta por peso (03-productos.md)
  precio: number;
  stock: number;
}

const PRODUCTOS_POR_RUBRO: Record<Rubro, ProductoSeed[]> = {
  almacen: [
    { categoria: "Fideos", variante: "tallarín", contenido: 500, unidadContenido: "g", precio: 2200, stock: 40 },
    { categoria: "Aceite", variante: "de girasol", contenido: 1.5, unidadContenido: "l", precio: 4200, stock: 25 },
    { categoria: "Yerba mate", contenido: 1, unidadContenido: "kg", precio: 5800, stock: 30 },
    { categoria: "Arroz", contenido: 1, unidadContenido: "kg", precio: 2100, stock: 35 },
    { categoria: "Azúcar", contenido: 1, unidadContenido: "kg", precio: 1800, stock: 30 },
    { categoria: "Harina", variante: "000", contenido: 1, unidadContenido: "kg", precio: 1500, stock: 40 },
  ],
  verduleria: [
    { categoria: "Tomate", variante: "perita", unidad: "kg", precio: 2800, stock: 20 },
    { categoria: "Lechuga", variante: "mantecosa", precio: 900, stock: 15 },
    { categoria: "Papa", unidad: "kg", precio: 1400, stock: 30 },
    { categoria: "Banana", unidad: "kg", precio: 2200, stock: 25 },
    { categoria: "Cebolla", unidad: "kg", precio: 1300, stock: 25 },
    { categoria: "Zanahoria", unidad: "kg", precio: 1100, stock: 20 },
  ],
  kiosco: [
    { categoria: "Gaseosa", marca: "Coca-Cola", contenido: 500, unidadContenido: "ml", precio: 2400, stock: 30 },
    { categoria: "Alfajor", marca: "Jorgito", precio: 1600, stock: 40 },
    { categoria: "Chicles", marca: "Beldent", precio: 800, stock: 50 },
    { categoria: "Papas fritas", marca: "Lays", precio: 3200, stock: 20 },
    { categoria: "Agua mineral", contenido: 500, unidadContenido: "ml", precio: 1200, stock: 40 },
    { categoria: "Chocolate", marca: "Águila", precio: 2900, stock: 25 },
  ],
  panaderia: [
    { categoria: "Pan", variante: "francés", unidad: "kg", precio: 3200, stock: 20 },
    { categoria: "Facturas", contenido: 12, unidadContenido: "u", precio: 6500, stock: 15 },
    { categoria: "Torta", variante: "de manzana", precio: 9800, stock: 5 },
    { categoria: "Pan", variante: "lactal", precio: 4200, stock: 15 },
    { categoria: "Medialunas", contenido: 12, unidadContenido: "u", precio: 7200, stock: 12 },
  ],
  fiambreria: [
    { categoria: "Jamón", variante: "cocido", unidad: "kg", precio: 14500, stock: 10 },
    { categoria: "Queso", variante: "cremoso", unidad: "kg", precio: 12800, stock: 10 },
    { categoria: "Salame", unidad: "kg", precio: 16500, stock: 8 },
    { categoria: "Mortadela", unidad: "kg", precio: 9800, stock: 10 },
  ],
};

// Rubro del seed → rubro de la tabla (17-rubros-categorias.md).
const NOMBRE_RUBRO: Record<Rubro, string> = {
  almacen: "Almacén",
  verduleria: "Verdulería",
  kiosco: "Kiosco",
  panaderia: "Panadería",
  fiambreria: "Fiambrería",
};

// Rubros y categorías los mantiene el admin; el seed solo se asegura de que existan
// los que usa (idempotente por nombre normalizado).
async function asegurarRubro(nombre: string): Promise<string> {
  const nombreNormalizado = normalizarNombre(nombre);
  return (await prisma.rubro.upsert({ where: { nombreNormalizado }, update: {}, create: { nombre, nombreNormalizado } })).id;
}

async function asegurarCategoria(nombre: string): Promise<string> {
  const nombreNormalizado = normalizarNombre(nombre);
  return (
    await prisma.categoriaProducto.upsert({ where: { nombreNormalizado }, update: {}, create: { nombre, nombreNormalizado } })
  ).id;
}

// ---------------------------------------------------------------------------
// Limpieza (idempotencia): borra solo lo que este script haya creado antes,
// identificado por el dominio de email @seed.almacenia.test. No toca el catálogo
// (lo pueden usar tiendas reales: se reutiliza por nombre), ni fotos_banco, ni
// cuentas fuera del dominio seed.
// ---------------------------------------------------------------------------

async function limpiarSeedAnterior() {
  const usuariosSeed = await prisma.usuario.findMany({
    where: { email: { endsWith: `@${DOMINIO_SEED}` } },
    select: { id: true },
  });
  const ids = usuariosSeed.map((u) => u.id);
  if (ids.length === 0) return;

  const tiendas = await prisma.tienda.findMany({ where: { vendedorId: { in: ids } }, select: { id: true } });
  const tiendaIds = tiendas.map((t) => t.id);
  const deSeed = { OR: [{ compradorId: { in: ids } }, { tiendaId: { in: tiendaIds } }] };

  await prisma.resena.deleteMany({ where: deSeed });
  await prisma.valoracionCliente.deleteMany({ where: deSeed });
  await prisma.solicitudVerificacion.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.itemVenta.deleteMany({ where: { venta: deSeed } });
  await prisma.venta.deleteMany({ where: deSeed });
  await prisma.itemPedido.deleteMany({ where: { pedido: deSeed } });
  await prisma.pedido.deleteMany({ where: deSeed });
  // Ítems de ventas/pedidos de otros que apunten a productos de tiendas seed.
  await prisma.itemVenta.deleteMany({ where: { producto: { tiendaId: { in: tiendaIds } } } });
  await prisma.itemPedido.deleteMany({ where: { producto: { tiendaId: { in: tiendaIds } } } });
  await prisma.horarioTienda.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.producto.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  // Eventos de puntos, visitas, check-ins y listas se borran en cascada.
  await prisma.tienda.deleteMany({ where: { id: { in: tiendaIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });

  console.log(`Limpieza: se borraron ${ids.length} usuarios y ${tiendaIds.length} tiendas de un seed anterior.`);
}

// Fotos al azar de versiones viejas del seed: se sacan (mejor sin foto que una
// foto que no corresponde al producto).
async function quitarFotosAlAzar() {
  const catalogo = await prisma.productoCatalogo.updateMany({
    where: { imagenUrl: { contains: "picsum.photos" } },
    data: { imagenUrl: null },
  });
  const tiendas = await prisma.tienda.updateMany({
    where: { imagenUrl: { contains: "picsum.photos" } },
    data: { imagenUrl: null },
  });
  if (catalogo.count + tiendas.count > 0) {
    console.log(`Fotos al azar quitadas: ${catalogo.count} de catálogo, ${tiendas.count} de tiendas.`);
  }
}

function entero(nombre: string, porDefecto: number): number {
  const valor = Number(process.env[nombre]);
  return Number.isInteger(valor) && valor >= 0 ? valor : porDefecto;
}

async function definirTiendas(cantidad: number): Promise<TiendaSeed[]> {
  if (process.env.SEED_FUENTE !== "osm") return tiendasLocales(cantidad);
  try {
    const elementos = await consultarOverpass();
    const deOsm = seleccionarTiendas(elementos, cantidad);
    const faltan = cantidad - deOsm.length;
    console.log(
      `OpenStreetMap: ${elementos.length} comercios encontrados, ${deOsm.length} usados` +
        (faltan > 0 ? `; se generan ${faltan} localmente.` : ".")
    );
    const nombres = new Set(deOsm.map((t) => t.nombre));
    const locales = faltan > 0 ? tiendasLocales(faltan + deOsm.length).filter((t) => !nombres.has(t.nombre)) : [];
    return [...deOsm, ...locales.slice(0, faltan)];
  } catch (error) {
    console.warn(`OpenStreetMap no disponible (${(error as Error).message}); se usan ${cantidad} tiendas locales.`);
    return tiendasLocales(cantidad);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  await limpiarSeedAnterior();
  await quitarFotosAlAzar();

  const cantidadCompradores = Math.min(entero("SEED_COMPRADORES", NOMBRES_COMPRADORES.length), NOMBRES_COMPRADORES.length);
  console.log(`Creando ${cantidadCompradores} compradores...`);
  for (const [i, nombre] of NOMBRES_COMPRADORES.slice(0, cantidadCompradores).entries()) {
    const email = `comprador${i + 1}.${slug(nombre)}@${DOMINIO_SEED}`;
    await registrarUsuario({ email, password: "password123", nombre });
  }

  // Un nombre de fantasía que caiga en el filtro de groserías no se usa (crearTienda lo rechazaría).
  const definiciones = (await definirTiendas(entero("SEED_TIENDAS", 20))).filter((d) => !contieneGroseria(d.nombre));
  console.log(`Creando ${definiciones.length} tiendas...`);
  // Catálogo compartido entre vendedores (06-catalogo.md): crearProducto con `nuevo`
  // reutiliza la entrada si ya existe (regla "Sin duplicados"), así que la primera
  // tienda la da de alta y las siguientes la adoptan.
  const rubroIdPor = new Map<Rubro, string>();
  for (const rubro of Object.keys(NOMBRE_RUBRO) as Rubro[]) rubroIdPor.set(rubro, await asegurarRubro(NOMBRE_RUBRO[rubro]));
  const categoriaIdPor = new Map<string, string>();
  for (const p of Object.values(PRODUCTOS_POR_RUBRO).flat()) {
    if (!categoriaIdPor.has(p.categoria)) categoriaIdPor.set(p.categoria, await asegurarCategoria(p.categoria));
  }
  const catalogoIds = new Set<string>();

  for (const [i, def] of definiciones.entries()) {
    const email = `vendedor${i + 1}.${slug(def.vendedorNombre)}@${DOMINIO_SEED}`;
    const vendedor = await registrarUsuario({
      email,
      password: "password123",
      nombre: def.vendedorNombre,
    });

    const tiendaCreada = await crearTienda(vendedor, {
      nombre: def.nombre,
      descripcion: def.descripcion,
      direccion: def.direccion,
      lat: def.lat,
      lon: def.lon,
      mediosDePago: elegir(COMBOS_MEDIOS_DE_PAGO, i),
      horarios: es24hs(def, i) ? undefined : horarioDeTienda(i)(),
      abierto24hs: es24hs(def, i),
      rubroId: rubroIdPor.get(def.rubro),
    });

    // ~30% de las tiendas nacen verificadas y un par en plan premium, para tener
    // datos de ejemplo de ambos casos en el panel admin (11-admin.md) y en los
    // tabs de destacados del storefront (10-planes.md) sin pasar por el flujo
    // completo de solicitud/aprobación en cada corrida del seed.
    await prisma.tienda.update({
      where: { id: tiendaCreada.id },
      data: {
        verificada: i % 3 === 0,
        plan: i % 7 === 0 ? "premium" : "free",
      },
    });

    const productos = PRODUCTOS_POR_RUBRO[def.rubro];
    for (const [j, producto] of productos.entries()) {
      // Pequeña variación de precio por tienda para que el mismo producto de
      // catálogo se vea con precios distintos según dónde se compre (la regla de
      // negocio: catálogo comparte identidad, nunca precio).
      const variacion = 1 + (((i * 7 + producto.categoria.length + j) % 5) - 2) * 0.03;
      const precioTienda = Math.round((producto.precio * variacion) / 10) * 10;
      const productoCreado = await crearProducto(vendedor, tiendaCreada.id, {
        nuevo: {
          categoriaId: categoriaIdPor.get(producto.categoria)!,
          marca: producto.marca,
          variante: producto.variante,
          contenido: producto.contenido,
          unidadContenido: producto.unidadContenido,
          unidad: producto.unidad,
        },
        precio: precioTienda,
        stock: producto.stock,
      });
      catalogoIds.add(productoCreado.catalogoId);

      // Algunos productos quedan en oferta, para poblar el tab "ofertas" del
      // storefront (03-productos.md).
      if ((i + producto.categoria.length + j) % 6 === 0) {
        await prisma.producto.update({
          where: { id: productoCreado.id },
          data: { precioOferta: Math.round((precioTienda * 0.85) / 10) * 10 },
        });
      }
    }
  }

  await fotosDelCatalogo([...catalogoIds]);

  // Lista de compras de ejemplo para el primer comprador (14-listas-compras.md),
  // con productos que venden varias tiendas para que "Buscar y comparar" tenga
  // qué comparar.
  if (cantidadCompradores > 0) {
    const comprador = await prisma.usuario.findFirstOrThrow({
      where: { email: { startsWith: "comprador1.", endsWith: `@${DOMINIO_SEED}` } },
    });
    const paraLista = [...catalogoIds].slice(0, 5);
    await crearLista(comprador, {
      nombre: "Compra de la semana",
      items: paraLista.map((catalogoId, i) => ({ catalogoId, cantidad: (i % 3) + 1 })),
    });
  }

  console.log("Seed completo.");
}

// Fotos del catálogo desde el banco curado (16-banco-fotos.md), con la misma
// búsqueda que usa la app. Nunca una foto al azar: sin coincidencia, sin foto.
// Con SEED_FOTOS_WEB=1 además busca en la web y deja la primera foto libre de
// cada producto sin foto como pendiente, para que un curador la revise.
async function fotosDelCatalogo(catalogoIds: string[]) {
  const sinFoto = await prisma.productoCatalogo.findMany({
    where: { id: { in: catalogoIds }, imagenUrl: null },
    select: { id: true, nombre: true },
  });
  let desdeBanco = 0;
  let pendientes = 0;
  for (const entrada of sinFoto) {
    const foto = await mejorFotoDelBanco(entrada.nombre);
    if (foto) {
      await prisma.productoCatalogo.update({ where: { id: entrada.id }, data: { imagenUrl: foto.url } });
      desdeBanco += 1;
      continue;
    }
    if (process.env.SEED_FOTOS_WEB === "1") {
      try {
        const [primero] = await buscarWeb(entrada.nombre);
        if (primero) {
          const etiquetas = [...palabrasClave(entrada.nombre), consultaWeb(entrada.nombre)].filter(Boolean);
          await guardarFotoWeb(primero, etiquetas, { estado: "pendiente" });
          pendientes += 1;
        }
      } catch (error) {
        console.warn(`Foto web para "${entrada.nombre}": ${(error as Error).message}`);
      }
    }
  }
  console.log(
    `Fotos del catálogo: ${desdeBanco} desde el banco, ${sinFoto.length - desdeBanco} sin foto` +
      (process.env.SEED_FOTOS_WEB === "1" ? `, ${pendientes} fotos web pendientes de revisión en /admin/fotos.` : ".")
  );
}

function slug(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
