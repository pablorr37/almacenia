"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { EstadoAperturaPill } from "@/components/ui/EstadoAperturaPill";
import { Toast } from "@/components/ui/Toast";
import { formatoPuntos } from "@/components/ui/PuntosChip";
import { estadoApertura, type HorarioTienda } from "@/lib/tiendas/horarios";
import { useAhora } from "@/lib/hooks/useAhora";

type Tienda = {
  id: string;
  nombre: string;
  direccion: string;
  verificada: boolean;
  horarios: HorarioTienda[];
};

type Categoria =
  | "almacen"
  | "bebidas"
  | "lacteos"
  | "panaderia"
  | "limpieza"
  | "kiosco"
  | "verduleria"
  | "fiambreria"
  | "otros";

type Producto = {
  id: string;
  nombre: string;
  imagenEfectiva: string | null;
  categoria: Categoria | null;
  precio: number;
  precioOferta: number | null;
  stock: number;
};

type Sort = "precio_asc" | "precio_desc" | "alfabetico" | "mas_vendidos" | "rating";
type Tab = "todos" | "ofertas" | "nuevos" | "destacados";

const CATEGORIAS: Array<{ valor: Categoria; etiqueta: string }> = [
  { valor: "almacen", etiqueta: "Almacén" },
  { valor: "bebidas", etiqueta: "Bebidas" },
  { valor: "lacteos", etiqueta: "Lácteos" },
  { valor: "panaderia", etiqueta: "Panadería" },
  { valor: "limpieza", etiqueta: "Limpieza" },
  { valor: "kiosco", etiqueta: "Kiosco" },
  { valor: "verduleria", etiqueta: "Verdulería" },
  { valor: "fiambreria", etiqueta: "Fiambrería" },
  { valor: "otros", etiqueta: "Otros" },
];

const TABS: Array<{ valor: Tab; etiqueta: string }> = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "ofertas", etiqueta: "Ofertas" },
  { valor: "nuevos", etiqueta: "Nuevos" },
  { valor: "destacados", etiqueta: "Destacados" },
];

const SORTS: Array<{ valor: Sort | ""; etiqueta: string }> = [
  { valor: "", etiqueta: "Más recientes" },
  { valor: "precio_asc", etiqueta: "Precio: menor a mayor" },
  { valor: "precio_desc", etiqueta: "Precio: mayor a menor" },
  { valor: "alfabetico", etiqueta: "Nombre (A-Z)" },
  { valor: "mas_vendidos", etiqueta: "Más vendidos" },
  { valor: "rating", etiqueta: "Mejor valorados" },
];

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TiendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tienda, setTienda] = useState<Tienda | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  // Carrito: cantidad + precio al agregar, así el total no depende de los filtros
  // activos (auditoría UI/UX, T1).
  const [cart, setCart] = useState<Record<string, number>>({});
  const [preciosCart, setPreciosCart] = useState<Record<string, number>>({});
  const { status } = useSession();
  const ahora = useAhora();
  const [aviso, setAviso] = useState<string | null>(null);
  const [haciendoCheckIn, setHaciendoCheckIn] = useState(false);
  const cerrarAviso = useCallback(() => setAviso(null), []);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<Categoria | "">("");
  const [precioMin, setPrecioMin] = useState("");
  const [precioMax, setPrecioMax] = useState("");
  const [sort, setSort] = useState<Sort | "">("");
  const [tab, setTab] = useState<Tab>("todos");

  useEffect(() => {
    apiGet<Tienda>(`/api/tiendas/${id}`).then(setTienda).catch(() => {});
  }, [id]);

  // Visita a la página (12-gamificacion.md): 1 vez por mes por tienda.
  useEffect(() => {
    if (status !== "authenticated") return;
    apiPost<{ puntosOtorgados: number }>(`/api/tiendas/${id}/visita`)
      .then((r) => {
        if (r.puntosOtorgados > 0) setAviso(`+${formatoPuntos(r.puntosOtorgados)} puntos por visitar la tienda`);
      })
      .catch(() => {});
  }, [id, status]);

  function hacerCheckIn() {
    if (!navigator.geolocation) {
      setAviso("Tu navegador no permite usar la ubicación.");
      return;
    }
    setHaciendoCheckIn(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const r = await apiPost<{ puntosOtorgados: number }>(`/api/tiendas/${id}/checkin`, {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          setAviso(
            r.puntosOtorgados > 0
              ? `¡Check-in hecho! +${formatoPuntos(r.puntosOtorgados)} puntos`
              : "Check-in registrado (hoy ya sumaste puntos acá)."
          );
        } catch (err) {
          setAviso(err instanceof ApiError ? err.message : "No se pudo hacer el check-in.");
        } finally {
          setHaciendoCheckIn(false);
        }
      },
      () => {
        setAviso("Necesitamos tu ubicación para confirmar que estás en la tienda.");
        setHaciendoCheckIn(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  useEffect(() => {
    const sp = new URLSearchParams({ soloDisponibles: "true" });
    if (q.trim()) sp.set("q", q.trim());
    if (categoria) sp.set("categoria", categoria);
    if (precioMin) sp.set("precioMin", precioMin);
    if (precioMax) sp.set("precioMax", precioMax);
    if (sort) sp.set("sort", sort);
    if (tab !== "todos") sp.set("tab", tab);

    apiGet<Producto[]>(`/api/tiendas/${id}/productos?${sp.toString()}`)
      .then(setProductos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar el catálogo."));
  }, [id, q, categoria, precioMin, precioMax, sort, tab]);

  const cantidadItems = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((sum, [productoId, cantidad]) => sum + cantidad * (preciosCart[productoId] ?? 0), 0);

  function agregar(p: Producto) {
    const actual = cart[p.id] ?? 0;
    if (actual >= p.stock) return;
    setCart({ ...cart, [p.id]: actual + 1 });
    setPreciosCart({ ...preciosCart, [p.id]: p.precioOferta ?? p.precio });
  }

  function quitar(p: Producto) {
    const actual = cart[p.id] ?? 0;
    setCart({ ...cart, [p.id]: Math.max(0, actual - 1) });
  }

  async function confirmarPedido() {
    setError(null);
    setEnviando(true);
    try {
      const items = Object.entries(cart)
        .filter(([, cantidad]) => cantidad > 0)
        .map(([productoId, cantidad]) => ({ productoId, cantidad }));
      const pedido = await apiPost<{ id: string }>("/api/pedidos", { tiendaId: id, items });
      router.push(`/pedidos/${pedido.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar el pedido.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-screen max-w-md flex-col bg-bg">
      <div className="flex items-center gap-3 px-5 pb-1 pt-5">
        <Link href="/" aria-label="Volver al mapa" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex min-w-0 flex-1 animate-fade-in-down flex-col gap-1">
          <div className="font-display text-[20px] font-bold leading-tight text-primary-dark">
            {tienda?.nombre ?? "Cargando..."}
            {tienda?.verificada && (
              <span className="ml-1.5 align-middle text-[11px] font-semibold text-primary">✓ Verificada</span>
            )}
          </div>
          <div className="truncate text-[13px] text-text-2">{tienda?.direccion}</div>
          {tienda && <EstadoAperturaPill estado={estadoApertura(tienda.horarios, ahora)} className="self-start" />}
        </div>
        {/* El backend rechaza el check-in del dueño (CHECKIN_TIENDA_PROPIA). */}
        {tienda && status === "authenticated" && (
          <button
            type="button"
            onClick={hacerCheckIn}
            disabled={haciendoCheckIn}
            className="press flex h-11 flex-shrink-0 items-center gap-1.5 rounded-pill border border-primary bg-primary-soft px-3 text-[12px] font-semibold text-primary-dark disabled:opacity-60"
            aria-label="Hacer check-in: estoy en la tienda"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
              <circle cx="12" cy="9.5" r="2.5" />
            </svg>
            {haciendoCheckIn ? "..." : "Estoy acá"}
          </button>
        )}
      </div>
      <Toast mensaje={aviso} onCerrar={cerrarAviso} />

      <div className="flex flex-col gap-2.5 px-5 pt-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar producto..."
          className="rounded-control border border-border bg-surface px-3.5 py-2.5 text-[14px] placeholder:text-text-2 focus:outline-none focus:border-primary"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.valor}
              onClick={() => setTab(t.valor)}
              className={`flex-shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-semibold ${
                tab === t.valor ? "bg-primary text-white" : "border border-border bg-surface text-text"
              }`}
            >
              {t.etiqueta}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as Categoria | "")}
            className="min-w-0 flex-grow rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
          >
            <option value="">Todas las categorías</option>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort | "")}
            className="min-w-0 flex-grow rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
          >
            {SORTS.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <input
            value={precioMin}
            onChange={(e) => setPrecioMin(e.target.value)}
            type="number"
            min="0"
            placeholder="Precio mín."
            className="w-full min-w-0 rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
          />
          <input
            value={precioMax}
            onChange={(e) => setPrecioMax(e.target.value)}
            type="number"
            min="0"
            placeholder="Precio máx."
            className="w-full min-w-0 rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
          />
        </div>
      </div>

      <div className="flex flex-grow flex-col gap-2.5 overflow-y-auto px-5 py-4">
        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        {productos.length === 0 && !error && (
          <p className="py-6 text-center text-[13px] text-text-2">No encontramos productos con estos filtros.</p>
        )}
        {productos.map((p, i) => {
          const qty = cart[p.id] ?? 0;
          const precioMostrado = p.precioOferta ?? p.precio;
          return (
            <div
              key={p.id}
              style={{ "--i": i } as React.CSSProperties}
              className="stagger flex animate-fade-up items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card"
            >
              {p.imagenEfectiva ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imagenEfectiva}
                  alt=""
                  style={{ width: 52, height: 52 }}
                  className="flex-shrink-0 rounded-control object-cover"
                />
              ) : (
                <div className="flex-shrink-0 rounded-control bg-placeholder" style={{ width: 52, height: 52 }} />
              )}
              <div className="flex min-w-0 flex-grow flex-col gap-0.5">
                <div className="text-[15px] font-semibold">{p.nombre}</div>
                <div className="text-[13px] text-text-2">
                  {p.precioOferta !== null && (
                    <span className="mr-1.5 text-text-2 line-through">{formatoARS(p.precio)}</span>
                  )}
                  {formatoARS(precioMostrado)} · {p.stock} disponibles
                </div>
              </div>
              {qty > 0 ? (
                <div className="flex flex-shrink-0 animate-scale-in items-center gap-2">
                  <button
                    onClick={() => quitar(p)}
                    aria-label="Quitar uno"
                    className="press flex h-10 w-10 items-center justify-center rounded-control border border-border bg-surface text-base leading-none"
                  >
                    –
                  </button>
                  <span className="min-w-[14px] text-center text-sm font-semibold">{qty}</span>
                  <button
                    onClick={() => agregar(p)}
                    aria-label="Agregar uno"
                    className="press flex h-10 w-10 items-center justify-center rounded-control bg-primary text-white"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M7 1V13M1 7H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => agregar(p)}
                  aria-label="Agregar al pedido"
                  className="press flex h-11 w-11 flex-shrink-0 animate-scale-in items-center justify-center rounded-control bg-primary text-white"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 1V15M1 8H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {cantidadItems > 0 && (
        <div className="sticky bottom-0 animate-slide-up border-t border-border bg-surface px-5 pb-6 pt-3.5">
          <button
            onClick={confirmarPedido}
            disabled={enviando}
            className="flex w-full items-center justify-between rounded-control bg-primary px-5 py-4 text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(14,107,92,0.25)] disabled:opacity-60"
          >
            <span>{enviando ? "Enviando..." : `Confirmar pedido (${cantidadItems})`}</span>
            <span>{formatoARS(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
