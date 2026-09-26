// Seed de datos dummy para desarrollo/demo: usuarios (compradores y vendedores),
// tiendas con sabor sanjuanino y sus productos. Precios en ARS estimados para
// ago/sep 2026 — son una aproximación razonada (no hay forma de verificar precios
// reales de una fecha futura), no un dato de mercado real.
//
// Reutiliza las funciones ya testeadas de src/lib en vez de reimplementar los
// inserts a mano (geografía, transacciones, etc. quedan cubiertos por esa capa).
//
// Uso: npx prisma db seed (contra la base local, nunca contra producción sin
// pedido explícito).

import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { registrarUsuario } from "../src/lib/auth/auth";
import { crearTienda, actualizarTienda, type HorarioTienda, type MedioPago } from "../src/lib/tiendas/tiendas";
import { crearProducto } from "../src/lib/productos/productos";
import { crearLista } from "../src/lib/listas/listas";
import type { Categoria } from "../src/generated-prisma/client";

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

function horario24hs(): HorarioTienda[] {
  // Convención documentada en la spec: abre/cierra null también representa
  // "abierto siempre" para un kiosco 24hs — se distingue en la UI, no en el dato.
  return Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, abre: null, cierra: null }));
}

const HORARIOS = [horarioNormal, horarioConDomingoMedioDia, horarioCierraTemprano, horario24hs];

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
// Tiendas: nombre, rubro, vendedor, departamento (con coordenadas reales del
// Gran San Juan) y variantes de horario/medios de pago.
// ---------------------------------------------------------------------------

type Rubro = "almacen" | "verduleria" | "kiosco" | "panaderia" | "fiambreria";

interface DefinicionTienda {
  nombre: string;
  descripcion: string;
  rubro: Rubro;
  vendedorNombre: string;
  departamento: string;
  lat: number;
  lon: number;
}

// Coordenadas aproximadas de cada departamento del Gran San Juan (centro).
const DEPARTAMENTOS: Record<string, { lat: number; lon: number }> = {
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

// Jitter chico para que no queden todas las tiendas de un mismo departamento
// exactamente en el mismo punto.
function conJitter(base: { lat: number; lon: number }, semilla: number) {
  const delta = ((semilla % 7) - 3) * 0.004;
  return { lat: base.lat + delta, lon: base.lon - delta * 0.6 };
}

const DEFINICIONES: Omit<DefinicionTienda, "lat" | "lon">[] = [
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

const DEFINICIONES_TIENDA: DefinicionTienda[] = DEFINICIONES.map((def, i) => {
  const base = DEPARTAMENTOS[def.departamento];
  const { lat, lon } = conJitter(base, i);
  return { ...def, lat, lon };
});

// ---------------------------------------------------------------------------
// Productos por rubro (precios ARS estimados ago/sep 2026)
// ---------------------------------------------------------------------------

const PRODUCTOS_POR_RUBRO: Record<Rubro, Array<{ nombre: string; precio: number; stock: number }>> = {
  almacen: [
    { nombre: "Fideos tallarín 500g", precio: 2200, stock: 40 },
    { nombre: "Aceite de girasol 1.5L", precio: 4200, stock: 25 },
    { nombre: "Yerba mate 1kg", precio: 5800, stock: 30 },
    { nombre: "Arroz 1kg", precio: 2100, stock: 35 },
    { nombre: "Azúcar 1kg", precio: 1800, stock: 30 },
    { nombre: "Harina 000 1kg", precio: 1500, stock: 40 },
  ],
  verduleria: [
    { nombre: "Tomate perita (kg)", precio: 2800, stock: 20 },
    { nombre: "Lechuga mantecosa (unidad)", precio: 900, stock: 15 },
    { nombre: "Papa (kg)", precio: 1400, stock: 30 },
    { nombre: "Banana (kg)", precio: 2200, stock: 25 },
    { nombre: "Cebolla (kg)", precio: 1300, stock: 25 },
    { nombre: "Zanahoria (kg)", precio: 1100, stock: 20 },
  ],
  kiosco: [
    { nombre: "Coca-Cola 500ml", precio: 2400, stock: 30 },
    { nombre: "Alfajor Jorgito", precio: 1600, stock: 40 },
    { nombre: "Chicles Beldent", precio: 800, stock: 50 },
    { nombre: "Papas fritas Lays", precio: 3200, stock: 20 },
    { nombre: "Agua mineral 500ml", precio: 1200, stock: 40 },
    { nombre: "Chocolate Águila", precio: 2900, stock: 25 },
  ],
  panaderia: [
    { nombre: "Pan francés (kg)", precio: 3200, stock: 20 },
    { nombre: "Facturas (docena)", precio: 6500, stock: 15 },
    { nombre: "Torta de manzana", precio: 9800, stock: 5 },
    { nombre: "Pan lactal", precio: 4200, stock: 15 },
    { nombre: "Medialunas (docena)", precio: 7200, stock: 12 },
  ],
  fiambreria: [
    { nombre: "Jamón cocido (kg)", precio: 14500, stock: 10 },
    { nombre: "Queso cremoso (kg)", precio: 12800, stock: 10 },
    { nombre: "Salame (kg)", precio: 16500, stock: 8 },
    { nombre: "Mortadela (kg)", precio: 9800, stock: 10 },
  ],
};

// ---------------------------------------------------------------------------
// Limpieza (idempotencia): borra solo lo que este script haya creado antes,
// identificado por el dominio de email @seed.almacenia.test.
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

  await prisma.resena.deleteMany({ where: { OR: [{ compradorId: { in: ids } }, { tiendaId: { in: tiendaIds } }] } });
  await prisma.solicitudVerificacion.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.itemVenta.deleteMany({ where: { venta: { tiendaId: { in: tiendaIds } } } });
  await prisma.venta.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.itemPedido.deleteMany({ where: { pedido: { tiendaId: { in: tiendaIds } } } });
  await prisma.pedido.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.horarioTienda.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.producto.deleteMany({ where: { tiendaId: { in: tiendaIds } } });
  await prisma.tienda.deleteMany({ where: { id: { in: tiendaIds } } });
  await prisma.usuario.deleteMany({ where: { id: { in: ids } } });
  // Entradas de catálogo que este mismo seed da de alta (ver PRODUCTOS_POR_RUBRO) —
  // se recrean en cada corrida, identificadas por nombre fijo. No se tocan entradas
  // de catálogo creadas por vendedores reales fuera del seed.
  const nombresSeed = Object.values(PRODUCTOS_POR_RUBRO).flat().map((p) => p.nombre);
  await prisma.productoCatalogo.deleteMany({ where: { nombre: { in: nombresSeed } } });

  console.log(`Limpieza: se borraron ${ids.length} usuarios de un seed anterior.`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// El rubro del seed coincide 1:1 con los valores del enum Categoria compartido por
// tiendas y catálogo (ver 02-tiendas.md / 06-catalogo.md).
function aCategoria(rubro: Rubro): Categoria {
  return rubro as Categoria;
}

function imagenPlaceholder(nombre: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(slug(nombre))}/400/300`;
}

async function main() {
  await limpiarSeedAnterior();

  console.log(`Creando ${NOMBRES_COMPRADORES.length} compradores...`);
  for (const [i, nombre] of NOMBRES_COMPRADORES.entries()) {
    const email = `comprador${i + 1}.${slug(nombre)}@${DOMINIO_SEED}`;
    await registrarUsuario({ email, password: "password123", nombre });
  }

  console.log(`Creando ${DEFINICIONES_TIENDA.length} tiendas...`);
  // Catálogo compartido entre vendedores (06-catalogo.md): la primera tienda que
  // carga un producto lo da de alta en productos_catalogo; las siguientes tiendas
  // del mismo rubro adoptan ese mismo catalogoId con su propio precio/stock, en vez
  // de duplicar la carga (ítem 2 del pedido del usuario).
  const catalogoIdPorNombre = new Map<string, string>();

  for (const [i, def] of DEFINICIONES_TIENDA.entries()) {
    const email = `vendedor${i + 1}.${slug(def.vendedorNombre)}@${DOMINIO_SEED}`;
    const vendedor = await registrarUsuario({
      email,
      password: "password123",
      nombre: def.vendedorNombre,
    });

    const tiendaCreada = await crearTienda(vendedor, {
      nombre: def.nombre,
      descripcion: def.descripcion,
      direccion: `${def.departamento}, San Juan`,
      lat: def.lat,
      lon: def.lon,
      mediosDePago: elegir(COMBOS_MEDIOS_DE_PAGO, i),
      horarios: elegir(HORARIOS, i)(),
    });

    // rubro/imagenUrl no son parte del alta (CrearTiendaInput), se completan con
    // el mismo PATCH que usaría el vendedor desde el panel (02-tiendas.md).
    await actualizarTienda(vendedor, tiendaCreada.id, {
      rubro: aCategoria(def.rubro),
      imagenUrl: imagenPlaceholder(def.nombre),
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
    for (const producto of productos) {
      const catalogoIdExistente = catalogoIdPorNombre.get(producto.nombre);
      // Pequeña variación de precio por tienda para que el mismo producto de
      // catálogo se vea con precios distintos según dónde se compre (la regla de
      // negocio: catálogo comparte identidad, nunca precio).
      const variacion = 1 + (((i * 7 + producto.nombre.length) % 5) - 2) * 0.03;
      const precioTienda = Math.round((producto.precio * variacion) / 10) * 10;

      const productoCreado = catalogoIdExistente
        ? await crearProducto(vendedor, tiendaCreada.id, {
            catalogoId: catalogoIdExistente,
            precio: precioTienda,
            stock: producto.stock,
          })
        : await crearProducto(vendedor, tiendaCreada.id, {
            nuevo: {
              nombre: producto.nombre,
              categoria: aCategoria(def.rubro),
            },
            precio: precioTienda,
            stock: producto.stock,
          });

      if (!catalogoIdExistente) {
        catalogoIdPorNombre.set(producto.nombre, productoCreado.catalogoId);
        // La foto es del producto de catálogo, compartida por todas las tiendas
        // (06-catalogo.md). El seed la carga directo, como lo haría un admin:
        // por la regla de fotos, una tienda free no puede subirla.
        await prisma.productoCatalogo.update({
          where: { id: productoCreado.catalogoId },
          data: { imagenUrl: imagenPlaceholder(producto.nombre) },
        });
      }

      // Algunos productos quedan en oferta, para poblar el tab "ofertas" del
      // storefront (03-productos.md).
      if ((i + producto.nombre.length) % 6 === 0) {
        await prisma.producto.update({
          where: { id: productoCreado.id },
          data: { precioOferta: Math.round((precioTienda * 0.85) / 10) * 10 },
        });
      }
    }
  }

  // Lista de compras de ejemplo para el primer comprador (14-listas-compras.md),
  // con productos que venden varias tiendas para que "Buscar y comparar" tenga
  // qué comparar.
  const comprador = await prisma.usuario.findFirstOrThrow({
    where: { email: { startsWith: "comprador1.", endsWith: `@${DOMINIO_SEED}` } },
  });
  const paraLista = [...catalogoIdPorNombre.entries()].slice(0, 5);
  await crearLista(comprador, {
    nombre: "Compra de la semana",
    items: paraLista.map(([, catalogoId], i) => ({ catalogoId, cantidad: (i % 3) + 1 })),
  });

  console.log("Seed completo.");
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
