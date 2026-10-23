"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiGet, apiPost, apiPostForm, ApiError } from "@/lib/api-client";
import { useMisTiendas } from "@/lib/hooks/useMisTiendas";
import { puede } from "@/lib/equipo/permisos";
import { formatoPuntos } from "@/components/ui/PuntosChip";
import { Toast } from "@/components/ui/Toast";
import { ESPACIOS, ETIQUETA_ESPACIO, MEDIDAS_SUGERIDAS, TEXTO_MAXIMO, aceptaImagen, type EspacioAviso } from "@/lib/publicidad/reglas";

// Publicidad de la tienda (21-publicidad.md): crear campañas pagando con puntos o en
// pesos, pausarlas, finalizarlas y ver sus métricas. Sin anuncios en esta pantalla.

type TiendaPub = { id: string; nombre: string };
type Precio = { puntos: number; ars: number; unidad: "dia" | "envio" };
type Campania = {
  id: string;
  espacio: EspacioAviso;
  titulo: string;
  estado: "pendiente_pago" | "en_moderacion" | "activa" | "pausada" | "rechazada" | "finalizada";
  desde: string;
  dias: number;
  diasConsumidos: number;
  pago: "puntos" | "pesos";
  puntosPagados: number | null;
  orden: { codigo: string; montoArs: number; estado: string } | null;
  motivoRechazo: string | null;
  pieza: { tipo: "imagen" | "texto"; imagenUrl: string | null; texto: string | null } | null;
  metricas: { impresiones: number; clics: number };
};

const ESTADO: Record<Campania["estado"], { texto: string; clase: string }> = {
  pendiente_pago: { texto: "Esperando el pago", clase: "bg-estado-pendiente-bg text-estado-pendiente-text" },
  en_moderacion: { texto: "En revisión", clase: "bg-estado-pendiente-bg text-estado-pendiente-text" },
  activa: { texto: "Activa", clase: "bg-estado-entregado-bg text-estado-entregado-text" },
  pausada: { texto: "Pausada", clase: "bg-placeholder text-text-2" },
  rechazada: { texto: "Rechazada", clase: "bg-estado-rechazado-bg text-estado-rechazado-text" },
  finalizada: { texto: "Finalizada", clase: "bg-placeholder text-text-2" },
};

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const hoyLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(new Date());

function Contenido() {
  const { status } = useSession();
  const params = useSearchParams();
  const { lista, activa } = useMisTiendas<TiendaPub>(status === "authenticated", params.get("tienda"));
  const [campanias, setCampanias] = useState<Campania[] | null>(null);
  const [precios, setPrecios] = useState<Record<EspacioAviso, Precio> | null>(null);
  const [saldo, setSaldo] = useState<number | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [espacio, setEspacio] = useState<EspacioAviso>("inicio");
  const [titulo, setTitulo] = useState("");
  const [desde, setDesde] = useState(hoyLocal);
  const [dias, setDias] = useState(3);
  const [pago, setPago] = useState<"puntos" | "pesos">("puntos");
  const [texto, setTexto] = useState("");
  const [destino, setDestino] = useState("");
  const [radioKm, setRadioKm] = useState("");
  const [imagen, setImagen] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [instrucciones, setInstrucciones] = useState<string | null>(null);

  const tiendaId = activa?.tienda.id;
  const permitido = !!activa && puede(activa, "publicidad");

  const cargar = useCallback(() => {
    if (!tiendaId) return;
    apiGet<Campania[]>(`/api/tiendas/${tiendaId}/campanias`).then(setCampanias).catch(() => setCampanias([]));
    apiGet<{ saldo: number }>("/api/gamificacion/puntos").then((r) => setSaldo(r.saldo)).catch(() => {});
  }, [tiendaId]);

  useEffect(() => {
    if (!permitido) return;
    cargar();
    apiGet<{ publicidad: Record<EspacioAviso, Precio> }>("/api/puntos/precios").then((p) => setPrecios(p.publicidad)).catch(() => {});
  }, [permitido, cargar]);

  const unidades = espacio === "push" ? 1 : dias;
  const precio = precios?.[espacio];
  const costo = precio ? (pago === "puntos" ? precio.puntos : precio.ars) * unidades : null;

  async function crear(e: FormEvent) {
    e.preventDefault();
    if (!tiendaId) return;
    setEnviando(true);
    setError(null);
    setInstrucciones(null);
    const form = new FormData();
    form.set("espacio", espacio);
    form.set("titulo", titulo);
    form.set("desde", desde);
    form.set("dias", String(unidades));
    form.set("pago", pago);
    if (texto.trim()) form.set("texto", texto);
    if (destino.trim()) form.set("destino", destino);
    if (radioKm.trim()) form.set("radioKm", radioKm.replace(",", "."));
    if (imagen && aceptaImagen(espacio)) form.set("imagen", imagen);
    try {
      const r = await apiPostForm<{ orden?: { instrucciones: string } }>(`/api/tiendas/${tiendaId}/campanias`, form);
      if (r.orden) setInstrucciones(r.orden.instrucciones);
      setAviso(pago === "puntos" ? "Campaña creada: la revisamos y se publica." : "Campaña creada: falta el pago.");
      setTitulo("");
      setTexto("");
      setImagen(null);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la campaña.");
    } finally {
      setEnviando(false);
    }
  }

  async function accion(id: string, que: "pausar" | "reanudar" | "finalizar") {
    if (que === "finalizar" && !window.confirm("¿Finalizar la campaña? Si la pagaste con puntos, te devolvemos los días que no se usaron.")) return;
    try {
      await apiPost(`/api/campanias/${id}/${que}`);
      cargar();
    } catch (err) {
      setAviso(err instanceof ApiError ? err.message : "No se pudo.");
    }
  }

  if (status === "unauthenticated") {
    return (
      <p className="p-6 text-center text-text-2">
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciá sesión
        </Link>{" "}
        para publicitar tu tienda.
      </p>
    );
  }
  if (!lista) return <p className="p-6 text-text-2">Cargando...</p>;
  if (!activa) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
        <p className="text-text-2">Para publicitar, primero publicá tu tienda.</p>
        <Link href="/mi-tienda?nueva=1" className="font-semibold text-accent-text">
          Publicar mi tienda →
        </Link>
      </div>
    );
  }
  if (!permitido) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
        <Link href="/" className="text-[13px] font-semibold text-accent-text">
          ← Inicio
        </Link>
        <p className="text-text-2">No tenés permiso para manejar la publicidad de {activa.tienda.nombre}.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-bg px-5 py-5">
      <Link href="/" className="text-[13px] font-semibold text-accent-text">
        ← Inicio
      </Link>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[22px] font-bold text-primary-dark">Publicidad</h1>
        <p className="text-[13px] text-text-2">
          Campañas de <strong>{activa.tienda.nombre}</strong>. Las ven los usuarios del plan free.
          {saldo !== null && <> Tenés {formatoPuntos(saldo)} puntos.</>}
        </p>
      </div>

      <form onSubmit={crear} className="flex flex-col gap-3 rounded-card border border-dashed border-accent bg-surface p-3.5">
        <h2 className="text-[15px] font-bold">Nueva campaña</h2>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Dónde
          <select value={espacio} onChange={(e) => setEspacio(e.target.value as EspacioAviso)} className="h-11 rounded-control border border-border bg-surface px-2 text-[14px] font-normal text-text">
            {ESPACIOS.map((e) => (
              <option key={e} value={e}>
                {ETIQUETA_ESPACIO[e]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Nombre de la campaña (solo lo ves vos)
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={80} className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text" />
        </label>
        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[12px] font-semibold text-text-2">
            {espacio === "push" ? "Enviar desde" : "Desde"}
            <input type="date" value={desde} min={hoyLocal()} onChange={(e) => setDesde(e.target.value)} required className="h-11 rounded-control border border-border bg-surface px-2 text-[14px] font-normal text-text" />
          </label>
          {espacio !== "push" && (
            <label className="flex w-24 flex-col gap-1 text-[12px] font-semibold text-text-2">
              Días
              <input type="number" min={1} max={90} value={dias} onChange={(e) => setDias(Math.max(1, Math.min(90, Number(e.target.value) || 1)))} className="h-11 rounded-control border border-border bg-surface px-2 text-[14px] font-normal text-text" />
            </label>
          )}
        </div>

        {espacio !== "pin_mapa" && (
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            {espacio === "push" ? "Texto del push" : "Texto (o subí una imagen)"}
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={TEXTO_MAXIMO} rows={2} className="rounded-control border border-border bg-surface px-3 py-2 text-[14px] font-normal text-text" />
            <span className="self-end font-normal tabular-nums">
              {texto.length}/{TEXTO_MAXIMO}
            </span>
          </label>
        )}
        {aceptaImagen(espacio) && (
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            Imagen o GIF animado ({MEDIDAS_SUGERIDAS[espacio]}, hasta 1 MB)
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => setImagen(e.target.files?.[0] ?? null)} className="text-[13px] font-normal text-text" />
          </label>
        )}
        {espacio === "pin_mapa" && <p className="text-[12px] text-text-2">El nombre de tu tienda aparece junto a su pin en el mapa, con la etiqueta «Destacado».</p>}
        {espacio !== "pin_mapa" && (
          <details className="text-[12px] text-text-2">
            <summary className="cursor-pointer font-semibold">Opciones</summary>
            <div className="mt-2 flex flex-col gap-2">
              <label className="flex flex-col gap-1 font-semibold">
                Al tocarla lleva a (vacío = tu tienda)
                <input value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="https://..." className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text" />
              </label>
              {espacio !== "push" && (
                <label className="flex flex-col gap-1 font-semibold">
                  Mostrar solo a quien esté a menos de (km)
                  <input inputMode="decimal" value={radioKm} onChange={(e) => setRadioKm(e.target.value)} placeholder="Sin límite" className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] font-normal text-text" />
                </label>
              )}
            </div>
          </details>
        )}

        <fieldset className="flex gap-2">
          <legend className="mb-1 text-[12px] font-semibold text-text-2">Pagar con</legend>
          {(["puntos", "pesos"] as const).map((p) => (
            <label key={p} className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-control border text-[14px] font-semibold ${pago === p ? "border-primary bg-primary-soft text-primary-dark" : "border-border bg-surface text-text"}`}>
              <input type="radio" name="pago" value={p} checked={pago === p} onChange={() => setPago(p)} className="sr-only" />
              {p === "puntos" ? "Puntos" : "Pesos"}
            </label>
          ))}
        </fieldset>
        {costo !== null && precio && (
          <p className="text-[13px] text-text" data-testid="costo-campania">
            Total: <strong>{pago === "puntos" ? `${formatoPuntos(costo)} puntos` : pesos(costo)}</strong>
            <span className="text-text-2">
              {" "}
              ({pago === "puntos" ? formatoPuntos(precio.puntos) : pesos(precio.ars)} por {precio.unidad === "dia" ? "día" : "envío"})
            </span>
          </p>
        )}
        {error && (
          <p role="alert" className="text-[13px] text-estado-rechazado-text">
            {error}
          </p>
        )}
        {instrucciones && <p className="rounded-control bg-estado-pendiente-bg p-2.5 text-[13px] text-estado-pendiente-text">{instrucciones}</p>}
        <button type="submit" disabled={enviando} className="press h-12 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50">
          {enviando ? "Creando..." : "Crear campaña"}
        </button>
        <p className="text-[11px] text-text-2">Revisamos cada campaña antes de publicarla. Si la rechazamos, te devolvemos los puntos.</p>
      </form>

      <section className="flex flex-col gap-2.5" aria-label="Campañas">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-2">Campañas</h2>
        {campanias === null ? (
          <div className="h-24 animate-pulse rounded-card bg-placeholder" />
        ) : campanias.length === 0 ? (
          <p className="text-[13px] text-text-2">Todavía no creaste campañas.</p>
        ) : (
          campanias.map((c) => {
            const ctr = c.metricas.impresiones > 0 ? Math.round((c.metricas.clics / c.metricas.impresiones) * 1000) / 10 : 0;
            return (
              <article key={c.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5 shadow-card" data-testid="campania">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-semibold text-text">{c.titulo}</span>
                    <span className="text-[12px] text-text-2">
                      {ETIQUETA_ESPACIO[c.espacio]} · desde {c.desde.split("-").reverse().join("/")}
                      {c.espacio !== "push" ? ` · ${c.diasConsumidos} de ${c.dias} días` : ""}
                    </span>
                  </div>
                  <span className={`flex-shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-bold ${ESTADO[c.estado].clase}`}>{ESTADO[c.estado].texto}</span>
                </div>
                {c.pieza?.imagenUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de la pieza
                  <img src={c.pieza.imagenUrl} alt="" className="max-h-24 w-full rounded-control object-contain" />
                )}
                {c.pieza?.texto && <p className="text-[13px] text-text">{c.pieza.texto}</p>}
                {c.motivoRechazo && <p className="text-[12px] text-estado-rechazado-text">Motivo: {c.motivoRechazo}</p>}
                {c.estado === "pendiente_pago" && c.orden && (
                  <p className="text-[12px] text-text-2">
                    Orden {c.orden.codigo} por {pesos(c.orden.montoArs)}: pagala por transferencia o en efectivo indicando el código.
                  </p>
                )}
                <p className="text-[12px] text-text-2 tabular-nums">
                  {c.metricas.impresiones} impresiones · {c.metricas.clics} clics · {ctr} %
                  {c.pago === "puntos" && c.puntosPagados !== null ? ` · ${formatoPuntos(c.puntosPagados)} puntos` : ""}
                </p>
                <div className="flex gap-3 text-[13px] font-semibold">
                  {c.estado === "activa" && c.espacio !== "push" && (
                    <button type="button" onClick={() => accion(c.id, "pausar")} className="press min-h-11 text-primary-dark">
                      Pausar
                    </button>
                  )}
                  {c.estado === "pausada" && (
                    <button type="button" onClick={() => accion(c.id, "reanudar")} className="press min-h-11 text-primary-dark">
                      Reanudar
                    </button>
                  )}
                  {["pendiente_pago", "en_moderacion", "activa", "pausada"].includes(c.estado) && (
                    <button type="button" onClick={() => accion(c.id, "finalizar")} className="press min-h-11 text-estado-rechazado-text">
                      Finalizar
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
      <Toast mensaje={aviso} onCerrar={() => setAviso(null)} />
    </div>
  );
}

export default function PublicidadPage() {
  return (
    <Suspense fallback={<p className="p-6 text-text-2">Cargando...</p>}>
      <Contenido />
    </Suspense>
  );
}
