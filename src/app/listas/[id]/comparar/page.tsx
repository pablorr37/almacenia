"use client";

import { use, useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { apiGet, apiPatch, apiPost, ApiError } from "@/lib/api-client";
import { BotonVolver } from "@/components/ui/BotonVolver";
import { EstadoAperturaPill } from "@/components/ui/EstadoAperturaPill";
import type { ResultadoComparacion } from "@/lib/itinerario/itinerario";
import type { PlanCompra, TipoPlan } from "@/lib/itinerario/planes";
import { formatearCantidad } from "@/lib/productos/unidades";
import { Faltantes, AccionMotivo, textoMotivo, RADIOS_KM, type AccionesFaltante } from "@/components/listas/Faltantes";

const MAX_TIENDAS = 3;

// "Todo en un lugar" solo si ese plan cubre toda la lista (15-itinerario.md).
function tituloPlan(p: PlanCompra): string {
  return p.etiquetas
    .map((e) => (e === "una_tienda" && p.cubiertos < p.totalItems ? "Una sola parada" : TITULO_PLAN[e].titulo))
    .join(" · ");
}

type Lista = { nombre: string; items: Array<{ catalogoId: string; cantidad: number }> };

const MapaPlan = dynamic(() => import("@/components/listas/MapaPlan").then((m) => m.MapaPlan), { ssr: false });

const TITULO_PLAN: Record<TipoPlan, { titulo: string; bajada: string }> = {
  una_tienda: { titulo: "Todo en un lugar", bajada: "Una sola parada" },
  mas_barato: { titulo: "Precio más bajo", bajada: "Lo más barato, hasta 3 tiendas" },
  equilibrado: { titulo: "Mejor equilibrio", bajada: "Precio + distancia" },
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoKm = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);

// Resultado de "Buscar y comparar" (15-itinerario.md, fase 1).
export default function CompararPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [nombreLista, setNombreLista] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [origen, setOrigen] = useState<{ lat: number; lon: number } | null>(null);
  const [radioKm, setRadioKm] = useState(5);
  const [soloAbiertas, setSoloAbiertas] = useState(false);
  const [resultado, setResultado] = useState<ResultadoComparacion | null>(null);
  const [seleccionado, setSeleccionado] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Lista>(`/api/listas/${id}`)
      .then((l) => {
        setNombreLista(l.nombre);
        setLista(l);
      })
      .catch(() => {});
    if (!navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sin API de geolocalización no hay nada que esperar
      setError("Tu navegador no permite usar la ubicación.");
      setCargando(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigen({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => {
        setError("Necesitamos tu ubicación para buscar tiendas cercanas.");
        setCargando(false);
      }
    );
  }, [id]);

  const comparar = useCallback(async () => {
    if (!origen) return;
    setCargando(true);
    setError(null);
    try {
      const r = await apiPost<ResultadoComparacion>(`/api/listas/${id}/comparar`, { ...origen, radioKm, soloAbiertas });
      setResultado(r);
      setSeleccionado(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No pudimos comparar precios.");
    } finally {
      setCargando(false);
    }
  }, [id, origen, radioKm, soloAbiertas]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- dispara la comparación al cambiar filtros/ubicación
    comparar();
  }, [comparar]);

  const plan: PlanCompra | undefined = resultado?.planes[seleccionado];
  const nombreTienda = (tiendaId: string) => resultado?.tiendas.find((t) => t.id === tiendaId)?.nombre ?? "";

  const acciones: AccionesFaltante = {
    radioKm,
    maxTiendas: MAX_TIENDAS,
    ampliarRadio: (km) => setRadioKm(km),
    incluirCerradas: () => setSoloAbiertas(false),
    ajustarCantidad: async (catalogoId, cantidad) => {
      if (!lista) return;
      const items = lista.items.map((i) => (i.catalogoId === catalogoId ? { catalogoId, cantidad } : { catalogoId: i.catalogoId, cantidad: i.cantidad }));
      const actualizada = await apiPatch<Lista>(`/api/listas/${id}`, { items });
      setLista(actualizada);
      await comparar();
    },
  };
  const ningunoCompleto = resultado ? resultado.planes.every((p) => p.cubiertos < p.totalItems) : false;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 bg-bg px-5 pb-10 pt-5">
      <div className="flex items-center gap-2">
        <BotonVolver href={`/listas/${id}`} etiqueta="Volver a la lista" />
        <div className="flex min-w-0 flex-col">
          <h1 className="font-display text-[20px] font-bold leading-tight text-primary-dark">Planes de compra</h1>
          <span className="truncate text-[13px] text-text-2">{nombreLista}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex h-10 items-center gap-2 rounded-pill border border-border bg-surface px-3 text-[13px] font-semibold">
          Radio
          <select value={radioKm} onChange={(e) => setRadioKm(Number(e.target.value))} className="bg-transparent">
            {RADIOS_KM.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={soloAbiertas}
          onClick={() => setSoloAbiertas((v) => !v)}
          className={`press flex h-10 items-center rounded-pill px-3.5 text-[13px] font-semibold ${
            soloAbiertas ? "bg-primary text-white" : "border border-border bg-surface text-text"
          }`}
        >
          Solo abiertas ahora
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-card bg-estado-rechazado-bg p-3 text-[13px] text-estado-rechazado-text">
          {error}
        </p>
      )}

      {cargando && (
        <div className="flex flex-col gap-3" aria-live="polite">
          <span className="text-[13px] text-text-2">Comparando precios en tiendas cercanas...</span>
          <div className="h-12 animate-pulse rounded-card bg-placeholder" />
          <div className="h-56 animate-pulse rounded-card bg-placeholder" />
        </div>
      )}

      {!cargando && resultado && resultado.planes.length === 0 && (
        <div className="flex animate-fade-up flex-col gap-2 rounded-card border border-border bg-surface p-5 text-center">
          <span className="text-[15px] font-semibold">No encontramos estos productos cerca</span>
          <ul className="flex flex-col gap-2 text-left">
            {resultado.sinOfertas.map((cid) => {
              const fila = resultado.comparativa.find((f) => f.catalogoId === cid);
              const motivo = resultado.motivos[cid];
              return (
                <li key={cid} className="flex flex-col gap-1.5 text-[13px]">
                  <span>
                    <strong>{fila?.nombre}:</strong> {motivo ? textoMotivo(motivo, radioKm, MAX_TIENDAS, fila?.unidad) : ""}
                  </span>
                  {motivo && (
                    <span className="self-start">
                      <AccionMotivo catalogoId={cid} motivo={motivo} acciones={acciones} unidad={fila?.unidad} />
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!cargando && resultado && plan && origen && (
        <>
          {ningunoCompleto && (
            <p role="status" className="rounded-card border border-estado-pendiente-text/30 bg-estado-pendiente-bg p-3 text-[13px] text-estado-pendiente-text">
              <strong>Ningún plan cubre toda la lista.</strong> Abajo te explicamos por qué falta cada producto.
            </p>
          )}

          <div role="tablist" aria-label="Planes" className="flex gap-2 overflow-x-auto pb-1">
            {resultado.planes.map((p, i) => (
              <button
                key={p.etiquetas.join("-")}
                role="tab"
                aria-selected={i === seleccionado}
                onClick={() => setSeleccionado(i)}
                className={`press flex min-w-[140px] flex-col items-start rounded-card border px-3.5 py-2.5 text-left ${
                  i === seleccionado ? "border-primary bg-primary text-white shadow-cta" : "border-border bg-surface text-text"
                }`}
              >
                <span className="text-[13px] font-bold">{tituloPlan(p)}</span>
                <span className="text-[15px] font-bold tabular-nums">{formatoARS(p.subtotal)}</span>
                <span className={`text-[11px] ${i === seleccionado ? "text-primary-soft" : "text-text-2"}`}>
                  {p.paradas.length} {p.paradas.length === 1 ? "parada" : "paradas"} · {formatoKm(p.distanciaKm)}
                </span>
                <span
                  className={`mt-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${
                    p.cubiertos === p.totalItems
                      ? i === seleccionado
                        ? "bg-white/20 text-white"
                        : "bg-estado-entregado-bg text-estado-entregado-text"
                      : i === seleccionado
                        ? "bg-white/20 text-white"
                        : "bg-estado-pendiente-bg text-estado-pendiente-text"
                  }`}
                >
                  {p.cubiertos === p.totalItems ? "Lista completa" : `${p.cubiertos} de ${p.totalItems} productos`}
                </span>
              </button>
            ))}
          </div>

          <section key={seleccionado} className="flex animate-fade-up flex-col gap-3" aria-live="polite">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-card border border-border bg-surface p-2.5">
                <div className="text-[11px] text-text-2">Productos</div>
                <div className="text-[15px] font-bold tabular-nums">{formatoARS(plan.subtotal)}</div>
              </div>
              <div className="rounded-card border border-border bg-surface p-2.5">
                <div className="text-[11px] text-text-2">Recorrido</div>
                <div className="text-[15px] font-bold tabular-nums">{formatoKm(plan.distanciaKm)}</div>
              </div>
              <div className="rounded-card border border-border bg-surface p-2.5">
                <div className="text-[11px] text-text-2">Ahorro</div>
                <div className="text-[15px] font-bold text-estado-entregado-text tabular-nums">
                  {plan.ahorroVsUnaTienda && plan.ahorroVsUnaTienda > 0 ? formatoARS(plan.ahorroVsUnaTienda) : "—"}
                </div>
              </div>
            </div>

            <Faltantes faltantes={plan.faltantes} acciones={acciones} />

            <div className="h-56 overflow-hidden rounded-card border border-border">
              <MapaPlan origen={origen} paradas={plan.paradas} />
            </div>

            <ol className="flex flex-col gap-2">
              {plan.paradas.map((p) => (
                <li key={p.tienda.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5 shadow-card">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-pill bg-primary text-[14px] font-bold text-white">
                      {p.orden}
                    </span>
                    <Link href={`/tiendas/${p.tienda.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-display text-[16px] font-bold text-text">{p.tienda.nombre}</span>
                      <span className="text-[12px] text-text-2 tabular-nums">
                        {p.tienda.direccion} · a {formatoKm(p.tienda.distanciaKm)}
                      </span>
                      <EstadoAperturaPill estado={p.tienda.estadoApertura} className="self-start" />
                    </Link>
                    <span className="text-[15px] font-bold tabular-nums">{formatoARS(p.subtotal)}</span>
                  </div>
                  <ul className="flex flex-col gap-1 border-t border-border pt-2">
                    {p.items.map((it) => (
                      <li key={it.catalogoId} className="flex justify-between gap-2 text-[13px]">
                        <span className="min-w-0 truncate">
                          {formatearCantidad(it.unidad, it.cantidad)} · {it.nombre}
                        </span>
                        <span className="flex-shrink-0 text-text-2 tabular-nums">{formatoARS(it.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>

          <details className="rounded-card border border-border bg-surface p-3.5">
            <summary className="cursor-pointer text-[14px] font-semibold">Comparar precios por producto</summary>
            <div className="mt-3 flex flex-col gap-3">
              {resultado.comparativa.map((f) => (
                <div key={f.catalogoId} className="flex flex-col gap-1">
                  <span className="text-[13px] font-semibold">
                    {formatearCantidad(f.unidad, f.cantidad)} · {f.nombre}
                  </span>
                  {f.ofertas.length === 0 ? (
                    <span className="text-[12px] text-text-2">
                      {resultado.motivos[f.catalogoId]
                        ? textoMotivo(resultado.motivos[f.catalogoId], radioKm, MAX_TIENDAS, f.unidad)
                        : "Sin ofertas cerca"}
                    </span>
                  ) : (
                    f.ofertas.map((o, i) => (
                      <div key={o.tiendaId} className="flex justify-between text-[12px] tabular-nums">
                        <span className={i === 0 ? "font-semibold text-estado-entregado-text" : "text-text-2"}>
                          {nombreTienda(o.tiendaId)}
                        </span>
                        <span className={i === 0 ? "font-semibold" : "text-text-2"}>{formatoARS(o.subtotal)}</span>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </details>

          <p className="text-[11px] leading-relaxed text-text-2">
            Distancias en línea recta desde tu ubicación. Pronto vamos a sumar recorridos por calle, promociones y tus
            horarios para recomendarte cuándo y dónde te conviene comprar.
          </p>
        </>
      )}
    </div>
  );
}
