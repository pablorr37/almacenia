"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";
import { useMisTiendas } from "@/lib/hooks/useMisTiendas";
import { puede } from "@/lib/equipo/permisos";
import { ETIQUETA_ALICUOTA, type AlicuotaIva } from "@/lib/precios/precios";

// Balance de la tienda (19-equipo-tienda.md) por nivel de plan (20-precios-facturacion.md):
// básico (free), sólido (premium) y completo (plata). Las secciones de un nivel mayor se
// muestran bloqueadas, con la invitación al plan.

type Balance = {
  desde: string;
  hasta: string;
  cobradas: { cantidad: number; total: number };
  porCobrar: { cantidad: number; total: number };
  anuladas: { cantidad: number };
  porMedioPago: Array<{ medioPago: string; total: number; cantidad: number }>;
  porDia: Array<{ fecha: string; total: number; cantidad: number }>;
  porVendedor: Array<{ usuario: { id: string; nombre: string } | null; total: number; cantidad: number }>;
  nivel: "basico" | "solido" | "completo";
  masVendidos?: Array<{ productoId: string; nombre: string; cantidad: number; total: number }>;
  resultado?: { ingresosNetos: number; costoVendido: number; gananciaBruta: number; margenBruto: number | null; itemsSinCosto: number };
  porProducto?: Array<FilaRentabilidad>;
  porCategoria?: Array<FilaRentabilidad>;
  stock?: { valorCosto: number; valorVenta: number; productosSinCosto: number };
  comparativo?: { cobrado: number; cantidad: number; gananciaBruta: number; variacionCobrado: number | null; variacionGanancia: number | null };
  impuestos?: { ivaPorAlicuota: Array<{ alicuota: AlicuotaIva; neto: number; iva: number }>; internos: number };
  flujoCaja?: Array<{ fecha: string; porMedio: Record<string, number>; total: number }>;
  alertas?: { stockBajo: AlertaProducto[]; margenNegativo: AlertaProducto[]; sinCosto: AlertaProducto[] };
};

type FilaRentabilidad = { id: string; nombre: string; cantidad: number; ingresosNetos: number; costo: number | null; ganancia: number | null; margen: number | null };
type AlertaProducto = { id: string; nombre: string; stock: number; margen: number | null };
type Sucursal = { tienda: { id: string; nombre: string }; cobrado: number; cantidad: number; ingresosNetos: number; gananciaBruta: number };

const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })} %`);
const variacionTexto = (n: number | null) => (n === null ? "sin datos del período anterior" : `${n > 0 ? "+" : ""}${pct(n)} vs. período anterior`);

function Seccion({ titulo, children, testId }: { titulo: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5" data-testid={testId}>
      <h2 className="text-[14px] font-bold">{titulo}</h2>
      {children}
    </section>
  );
}

function Bloqueado({ plan, que }: { plan: "Premium" | "Plata"; que: string }) {
  return (
    <section className="flex flex-col gap-1 rounded-card border border-dashed border-accent/60 bg-surface p-3.5" data-testid={`bloqueado-${plan.toLowerCase()}`}>
      <span className="text-[13px] font-bold text-accent-text">Disponible en {plan}</span>
      <span className="text-[12px] text-text-2">{que}</span>
    </section>
  );
}

function TablaRentabilidad({ filas }: { filas: FilaRentabilidad[] }) {
  if (filas.length === 0) return <p className="text-[13px] text-text-2">Sin ventas cobradas en el período.</p>;
  return (
    <table className="w-full text-left text-[13px] tabular-nums">
      <thead className="text-[11px] text-text-2">
        <tr>
          <th className="py-1 font-semibold"></th>
          <th className="py-1 text-right font-semibold">Neto</th>
          <th className="py-1 text-right font-semibold">Ganancia</th>
          <th className="py-1 text-right font-semibold">Margen</th>
        </tr>
      </thead>
      <tbody>
        {filas.slice(0, 15).map((f) => (
          <tr key={f.id} className="border-t border-border/60">
            <td className="max-w-[120px] truncate py-1.5 pr-2">{f.nombre}</td>
            <td className="py-1.5 text-right">{formatoARS(f.ingresosNetos)}</td>
            <td className="py-1.5 text-right">{f.ganancia === null ? "sin costo" : formatoARS(f.ganancia)}</td>
            <td className={`py-1.5 text-right ${f.margen !== null && f.margen < 0 ? "text-estado-rechazado-text" : ""}`}>{pct(f.margen)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

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
  const [sucursales, setSucursales] = useState<Sucursal[] | null>(null);
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);
  const tiendaId = activa?.tienda.id;
  const esPropietario = activa?.rol === "propietario";
  const habilitado = !!activa && puede(activa, "balance");

  useEffect(() => {
    if (!tiendaId || !habilitado) return;
    const hasta = fechaLocal(new Date());
    const desde = fechaLocal(new Date(Date.now() - (dias - 1) * 24 * 3600_000));
    apiGet<Balance>(`/api/tiendas/${tiendaId}/balance?desde=${desde}&hasta=${hasta}`)
      .then((b) => {
        setBalance(b);
        setRango({ desde, hasta });
        setError(null);
        // Plata: rentabilidad de todas las tiendas propias.
        if (b.nivel === "completo" && esPropietario) {
          apiGet<Sucursal[]>(`/api/balance/sucursales?desde=${desde}&hasta=${hasta}`)
            .then(setSucursales)
            .catch(() => setSucursales(null));
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el balance."));
  }, [tiendaId, habilitado, dias, esPropietario]);

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

          {balance.masVendidos && balance.masVendidos.length > 0 && (
            <Seccion titulo="Más vendidos" testId="mas-vendidos">
              {balance.masVendidos.map((m) => (
                <div key={m.productoId} className="flex items-center justify-between gap-2 text-[14px]">
                  <span className="min-w-0 truncate">
                    {m.nombre} <span className="text-[12px] text-text-2">({m.cantidad.toLocaleString("es-AR")})</span>
                  </span>
                  <span className="flex-shrink-0 font-semibold tabular-nums">{formatoARS(m.total)}</span>
                </div>
              ))}
            </Seccion>
          )}

          {/* Sólido (premium) */}
          {balance.resultado ? (
            <>
              <div className="grid grid-cols-2 gap-2.5" data-testid="balance-resultado">
                <Tarjeta
                  titulo="Ganancia bruta"
                  valor={formatoARS(balance.resultado.gananciaBruta)}
                  detalle={`Margen ${pct(balance.resultado.margenBruto)}`}
                  destacado
                />
                <Tarjeta titulo="Costo de lo vendido" valor={formatoARS(balance.resultado.costoVendido)} detalle={`Neto vendido ${formatoARS(balance.resultado.ingresosNetos)}`} />
              </div>
              {balance.resultado.itemsSinCosto > 0 && (
                <p className="text-[12px] text-text-2">
                  {balance.resultado.itemsSinCosto} {balance.resultado.itemsSinCosto === 1 ? "línea vendida no tiene" : "líneas vendidas no tienen"} costo cargado: no cuentan en la ganancia.
                </p>
              )}
              {balance.comparativo && (
                <Seccion titulo="Comparado con el período anterior">
                  <p className="text-[13px]">Cobrado: {variacionTexto(balance.comparativo.variacionCobrado)}</p>
                  <p className="text-[13px]">Ganancia: {variacionTexto(balance.comparativo.variacionGanancia)}</p>
                </Seccion>
              )}
              <Seccion titulo="Rentabilidad por producto">
                <TablaRentabilidad filas={balance.porProducto ?? []} />
              </Seccion>
              <Seccion titulo="Rentabilidad por categoría">
                <TablaRentabilidad filas={balance.porCategoria ?? []} />
              </Seccion>
              {balance.stock && (
                <Seccion titulo="Valor del stock (hoy)" testId="valor-stock">
                  <div className="flex justify-between text-[14px]"><span>A costo</span><span className="font-semibold tabular-nums">{formatoARS(balance.stock.valorCosto)}</span></div>
                  <div className="flex justify-between text-[14px]"><span>A precio de venta</span><span className="font-semibold tabular-nums">{formatoARS(balance.stock.valorVenta)}</span></div>
                  {balance.stock.productosSinCosto > 0 && <p className="text-[12px] text-text-2">{balance.stock.productosSinCosto} productos sin costo cargado.</p>}
                </Seccion>
              )}
            </>
          ) : (
            <Bloqueado plan="Premium" que="Costo de lo vendido, ganancia y margen por producto y categoría, valor del stock y comparativos." />
          )}

          {/* Completo (plata) */}
          {balance.impuestos ? (
            <>
              <Seccion titulo="IVA débito" testId="iva-debito">
                {balance.impuestos.ivaPorAlicuota.length === 0 ? (
                  <p className="text-[13px] text-text-2">La tienda no discrimina IVA (monotributo o exenta).</p>
                ) : (
                  balance.impuestos.ivaPorAlicuota.map((a) => (
                    <div key={a.alicuota} className="flex justify-between text-[14px]">
                      <span>{ETIQUETA_ALICUOTA[a.alicuota]} <span className="text-[12px] text-text-2">(neto {formatoARS(a.neto)})</span></span>
                      <span className="font-semibold tabular-nums">{formatoARS(a.iva)}</span>
                    </div>
                  ))
                )}
                {balance.impuestos.internos > 0 && (
                  <div className="flex justify-between text-[14px]"><span>Impuestos internos</span><span className="font-semibold tabular-nums">{formatoARS(balance.impuestos.internos)}</span></div>
                )}
              </Seccion>
              {balance.alertas && (
                <Seccion titulo="Alertas" testId="alertas">
                  {balance.alertas.stockBajo.length + balance.alertas.margenNegativo.length + balance.alertas.sinCosto.length === 0 && (
                    <p className="text-[13px] text-text-2">Todo en orden.</p>
                  )}
                  {balance.alertas.stockBajo.map((p) => (
                    <p key={`s-${p.id}`} className="text-[13px]">⚠️ Stock bajo: <strong>{p.nombre}</strong> ({p.stock.toLocaleString("es-AR")})</p>
                  ))}
                  {balance.alertas.margenNegativo.map((p) => (
                    <p key={`m-${p.id}`} className="text-[13px] text-estado-rechazado-text">⚠️ Vendés por debajo del costo: <strong>{p.nombre}</strong> ({pct(p.margen)})</p>
                  ))}
                  {balance.alertas.sinCosto.length > 0 && (
                    <p className="text-[13px] text-text-2">Sin costo cargado: {balance.alertas.sinCosto.map((p) => p.nombre).join(", ")}</p>
                  )}
                </Seccion>
              )}
              {rango && (
                <a
                  href={`/api/tiendas/${tiendaId}/balance/libro.csv?desde=${rango.desde}&hasta=${rango.hasta}`}
                  className="press flex h-11 items-center justify-center rounded-control border border-border bg-surface text-[14px] font-semibold text-text"
                  download
                >
                  Exportar libro de ventas (CSV)
                </a>
              )}
              {sucursales && sucursales.length > 1 && (
                <Seccion titulo="Todas mis sucursales" testId="sucursales">
                  {sucursales.map((x) => (
                    <div key={x.tienda.id} className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="min-w-0 truncate">{x.tienda.nombre} <span className="text-[12px] text-text-2">({x.cantidad})</span></span>
                      <span className="flex-shrink-0 text-right tabular-nums">
                        <span className="font-semibold">{formatoARS(x.cobrado)}</span>
                        <span className="block text-[11px] text-text-2">ganancia {formatoARS(x.gananciaBruta)}</span>
                      </span>
                    </div>
                  ))}
                </Seccion>
              )}
            </>
          ) : (
            <Bloqueado plan="Plata" que="IVA débito por alícuota, alertas de stock y margen, libro de ventas en CSV y rentabilidad de todas tus sucursales." />
          )}
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
