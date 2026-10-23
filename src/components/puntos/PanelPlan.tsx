"use client";

import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, ApiError } from "@/lib/api-client";
import { ETIQUETA_PLAN, type PlanNombre } from "@/lib/planes/limites";
import { formatoPuntos } from "@/components/ui/PuntosChip";

type Orden = { id: string; codigo: string; montoArs: number; estado: string };
type EstadoPlan = { plan: PlanNombre; planVenceEn: string | null; renovacionAuto: "ninguna" | "puntos" | "pesos"; ordenPendiente: Orden | null };
type Precios = { premiumPuntos: number; premiumDias: number; premiumArs: number };

const pesos = (n: number) => n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 2 });
const fecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/San_Juan", day: "numeric", month: "long", year: "numeric" });

// Plan premium con puntos o en pesos, y renovación automática (23-puntos-pagos.md).
export function PanelPlan({ saldo, onCambio }: { saldo: number; onCambio: (mensaje: string) => void }) {
  const [estado, setEstado] = useState<EstadoPlan | null>(null);
  const [precios, setPrecios] = useState<Precios | null>(null);
  const [instrucciones, setInstrucciones] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(() => {
    apiGet<EstadoPlan>("/api/puntos/plan").then(setEstado).catch(() => setError("No pudimos cargar tu plan."));
    apiGet<Precios>("/api/puntos/precios").then(setPrecios).catch(() => {});
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(fn: () => Promise<unknown>, mensaje: string) {
    setOcupado(true);
    setError(null);
    try {
      await fn();
      cargar();
      onCambio(mensaje);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Algo salió mal. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (!estado || !precios) return null;
  const manual = estado.plan === "premium" && !estado.planVenceEn;
  const puedeComprar = estado.plan !== "plata" && !manual;
  const alcanza = saldo >= precios.premiumPuntos;

  return (
    <section aria-labelledby="titulo-plan" className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="titulo-plan" className="font-display text-[17px] font-bold text-text">
          Plan {ETIQUETA_PLAN[estado.plan]}
        </h2>
        {estado.planVenceEn && <span className="text-[13px] text-text-2">Vence el {fecha(estado.planVenceEn)}</span>}
      </div>

      {estado.plan === "plata" && <p className="text-[14px] text-text-2">Tu plan plata ya incluye todo lo de premium.</p>}
      {manual && <p className="text-[14px] text-text-2">Tu premium no vence.</p>}

      {puedeComprar && (
        <>
          <p className="text-[14px] text-text-2">
            Premium: alcance de 15 km, sin publicidad y más funciones para tu tienda. {precios.premiumDias} días por{" "}
            <strong className="text-text">{formatoPuntos(precios.premiumPuntos)} puntos</strong> o{" "}
            <strong className="text-text">{pesos(precios.premiumArs)}</strong>.
            {estado.plan === "premium" ? " Si lo renovás ahora, se suma desde el vencimiento." : ""}
          </p>
          <button
            type="button"
            disabled={ocupado || !alcanza}
            onClick={() => {
              if (window.confirm(`¿Canjear ${formatoPuntos(precios.premiumPuntos)} puntos por ${precios.premiumDias} días de premium?`)) {
                accion(() => apiPost("/api/puntos/canjes/premium"), "¡Listo! Ya tenés premium.");
              }
            }}
            className="press h-12 rounded-control bg-primary text-[15px] font-semibold text-white disabled:opacity-50"
          >
            Canjear con puntos
          </button>
          {!alcanza && (
            <p className="text-[13px] text-text-2">Te faltan {formatoPuntos(Math.round((precios.premiumPuntos - saldo) * 10) / 10)} puntos.</p>
          )}

          {estado.ordenPendiente ? (
            <div className="flex flex-col gap-2 rounded-control bg-bg p-3 text-[13px] text-text-2">
              <span>
                Orden <strong className="text-text">{estado.ordenPendiente.codigo}</strong> por {pesos(estado.ordenPendiente.montoArs)}, pendiente de pago.
              </span>
              {instrucciones && <span>{instrucciones}</span>}
              <button
                type="button"
                disabled={ocupado}
                onClick={() => accion(() => apiDelete(`/api/pagos/ordenes/${estado.ordenPendiente!.id}`), "Orden cancelada.")}
                className="press self-start font-semibold text-estado-rechazado-text"
              >
                Cancelar orden
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={ocupado}
              onClick={() =>
                accion(async () => {
                  const r = await apiPost<{ instrucciones: string }>("/api/pagos/ordenes", { concepto: "premium" });
                  setInstrucciones(r.instrucciones);
                }, "Creamos la orden de pago.")
              }
              className="press h-12 rounded-control border border-border bg-surface text-[15px] font-semibold text-text disabled:opacity-50"
            >
              Pagar en pesos
            </button>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-[13px] font-semibold text-text">Renovación automática</legend>
            {(
              [
                ["ninguna", "No renovar"],
                ["puntos", `Con puntos (${formatoPuntos(precios.premiumPuntos)})`],
                ["pesos", `En pesos (${pesos(precios.premiumArs)})`],
              ] as const
            ).map(([modo, texto]) => (
              <label key={modo} className="flex min-h-11 items-center gap-2.5 text-[14px] text-text">
                <input
                  type="radio"
                  name="renovacion"
                  checked={estado.renovacionAuto === modo}
                  disabled={ocupado}
                  onChange={() => accion(() => apiPut("/api/puntos/renovacion", { modo }), "Guardamos tu preferencia de renovación.")}
                  className="h-5 w-5 accent-primary"
                />
                {texto}
              </label>
            ))}
          </fieldset>
        </>
      )}

      {error && (
        <p role="alert" className="text-[13px] text-estado-rechazado-text">
          {error}
        </p>
      )}
    </section>
  );
}
