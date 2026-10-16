"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";
import { useMisTiendas } from "@/lib/hooks/useMisTiendas";
import { puede } from "@/lib/equipo/permisos";

// Balance básico de la tienda (19-equipo-tienda.md). La ronda 3 suma costo, ganancia
// e impuestos (docs/rondas/ronda-3-precios-balance.md).

type Balance = {
  desde: string;
  hasta: string;
  cobradas: { cantidad: number; total: number };
  porCobrar: { cantidad: number; total: number };
  anuladas: { cantidad: number };
  porMedioPago: Array<{ medioPago: string; total: number; cantidad: number }>;
  porDia: Array<{ fecha: string; total: number; cantidad: number }>;
  porVendedor: Array<{ usuario: { id: string; nombre: string } | null; total: number; cantidad: number }>;
};

const ETIQUETA_MEDIO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mercado_pago: "Mercado Pago",
  debito: "Débito",
  qr: "QR",
  sin_medio: "Sin medio",
};

const RANGOS = [
  { dias: 1, etiqueta: "Hoy" },
  { dias: 7, etiqueta: "7 días" },
  { dias: 30, etiqueta: "30 días" },
] as const;

const formatoARS = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaLocal = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/San_Juan" }).format(d);
const diaCorto = (fecha: string) =>
  new Date(`${fecha}T12:00:00-03:00`).toLocaleDateString("es-AR", { weekday: "short", day: "numeric", timeZone: "America/Argentina/San_Juan" });

function Tarjeta({ titulo, valor, detalle, destacado = false }: { titulo: string; valor: string; detalle: string; destacado?: boolean }) {
  return (
    <div className={`flex flex-col gap-0.5 rounded-card p-3.5 shadow-card ${destacado ? "bg-primary text-white" : "border border-border bg-surface"}`}>
      <span className={`text-[12px] font-semibold ${destacado ? "text-white/80" : "text-text-2"}`}>{titulo}</span>
      <span className="font-display text-[20px] font-bold tabular-nums">{valor}</span>
      <span className={`text-[12px] ${destacado ? "text-white/80" : "text-text-2"}`}>{detalle}</span>
    </div>
  );
}

function BalanceContenido() {
  const { status } = useSession();
  const params = useSearchParams();
  const { lista, activa } = useMisTiendas<{ id: string; nombre: string }>(status === "authenticated", params.get("tienda"));
  const [dias, setDias] = useState<number>(7);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tiendaId = activa?.tienda.id;
  const habilitado = !!activa && puede(activa, "balance");

  useEffect(() => {
    if (!tiendaId || !habilitado) return;
    const hasta = fechaLocal(new Date());
    const desde = fechaLocal(new Date(Date.now() - (dias - 1) * 24 * 3600_000));
    apiGet<Balance>(`/api/tiendas/${tiendaId}/balance?desde=${desde}&hasta=${hasta}`)
      .then((b) => {
        setBalance(b);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el balance."));
  }, [tiendaId, habilitado, dias]);

  if (!lista) return <p className="p-6 text-text-2">Cargando...</p>;
  if (!activa) return <p className="p-6 text-text-2">Todavía no tenés una tienda.</p>;
  if (!habilitado) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 p-6">
        <Link href="/" className="text-[13px] font-semibold text-accent-text">
          ← Inicio
        </Link>
        <p className="text-text-2">No tenés permiso para ver el balance de {activa.tienda.nombre}.</p>
      </div>
    );
  }

  const maximo = Math.max(1, ...(balance?.porDia.map((d) => d.total) ?? [0]));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-bg px-5 py-5">
      <Link href="/" className="text-[13px] font-semibold text-accent-text">
        ← Inicio
      </Link>
      <div className="flex flex-col gap-0.5">
        <h1 className="font-display text-[22px] font-bold text-primary-dark">Balance</h1>
        <p className="text-[13px] text-text-2">{activa.tienda.nombre}</p>
      </div>

      <div className="flex gap-1.5" role="group" aria-label="Período">
        {RANGOS.map((r) => (
          <button
            key={r.dias}
            type="button"
            aria-pressed={dias === r.dias}
            onClick={() => setDias(r.dias)}
            className={`flex-1 rounded-control px-2 py-2.5 text-[13px] font-semibold ${
              dias === r.dias ? "bg-primary text-white" : "border border-border bg-surface text-text"
            }`}
          >
            {r.etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
      {balance && (
        <>
          <div className="grid grid-cols-2 gap-2.5" data-testid="balance-resumen">
            <div className="col-span-2">
              <Tarjeta
                titulo="Cobrado"
                valor={formatoARS(balance.cobradas.total)}
                detalle={`${balance.cobradas.cantidad} ${balance.cobradas.cantidad === 1 ? "venta" : "ventas"}`}
                destacado
              />
            </div>
            <Tarjeta titulo="Por cobrar" valor={formatoARS(balance.porCobrar.total)} detalle={`${balance.porCobrar.cantidad} pendientes`} />
            <Tarjeta titulo="Anuladas" valor={String(balance.anuladas.cantidad)} detalle="ventas" />
          </div>

          {balance.porDia.length > 1 && (
            <section className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
              <h2 className="text-[14px] font-bold">Cobrado por día</h2>
              <div className="flex h-32 items-end gap-1" role="img" aria-label="Gráfico de lo cobrado por día">
                {balance.porDia.map((d) => (
                  <div key={d.fecha} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${d.fecha}: ${formatoARS(d.total)}`}>
                    <div className="w-full rounded-t bg-primary" style={{ height: `${Math.max(2, (d.total / maximo) * 100)}%`, opacity: d.total ? 1 : 0.2 }} />
                    {balance.porDia.length <= 7 && <span className="truncate text-[10px] text-text-2">{diaCorto(d.fecha)}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5">
            <h2 className="text-[14px] font-bold">Por medio de pago</h2>
            {balance.porMedioPago.length === 0 && <p className="text-[13px] text-text-2">Sin ventas cobradas en el período.</p>}
            {balance.porMedioPago.map((m) => (
              <div key={m.medioPago} className="flex items-center justify-between text-[14px]">
                <span>
                  {ETIQUETA_MEDIO[m.medioPago] ?? m.medioPago} <span className="text-[12px] text-text-2">({m.cantidad})</span>
                </span>
                <span className="font-semibold tabular-nums">{formatoARS(m.total)}</span>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5">
            <h2 className="text-[14px] font-bold">Por quién vendió</h2>
            {balance.porVendedor.length === 0 && <p className="text-[13px] text-text-2">Sin ventas cobradas en el período.</p>}
            {balance.porVendedor.map((v) => (
              <div key={v.usuario?.id ?? "pedidos"} className="flex items-center justify-between text-[14px]">
                <span>
                  {v.usuario?.nombre ?? "Pedidos y ventas anteriores"} <span className="text-[12px] text-text-2">({v.cantidad})</span>
                </span>
                <span className="font-semibold tabular-nums">{formatoARS(v.total)}</span>
              </div>
            ))}
          </section>

          <p className="text-[12px] text-text-2">
            Próximamente: costo, ganancia e impuestos de cada venta.
          </p>
        </>
      )}
    </div>
  );
}

export default function BalancePage() {
  return (
    <Suspense fallback={<p className="p-6 text-text-2">Cargando...</p>}>
      <BalanceContenido />
    </Suspense>
  );
}
