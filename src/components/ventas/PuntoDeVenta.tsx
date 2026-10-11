"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGetPaginado, apiPost, ApiError } from "@/lib/api-client";
import { formatearCantidad, type UnidadMedida } from "@/lib/productos/unidades";
import { SelectorCantidad } from "@/components/ui/SelectorCantidad";
import { Toast } from "@/components/ui/Toast";

// Punto de venta de mostrador (05-ventas.md): el vendedor arma el ticket con lo que
// le pide el cliente, lo cobra en el acto o lo deja "por cobrar" hasta que llega la
// plata. El stock se descuenta al cerrar; anular lo devuelve.

export type MedioPago = "efectivo" | "transferencia" | "mercado_pago" | "debito" | "qr";

export interface ProductoVendible {
  id: string;
  nombre: string;
  precio: number;
  precioOferta?: number | null;
  stock: number;
  unidad: UnidadMedida;
  disponible: boolean;
  imagenEfectiva: string | null;
}

interface Venta {
  id: string;
  estado: "por_cobrar" | "cobrada" | "anulada";
  medioPago: MedioPago | null;
  nota: string | null;
  total: number;
  items: Array<{ id: string; nombre: string; unidad: UnidadMedida; cantidad: number; precioUnitario: number }>;
  comprador: { nombre: string; email: string } | null;
  creadaEn: string;
  cobradaEn: string | null;
}

const ETIQUETA_MEDIO: Record<MedioPago, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  mercado_pago: "Mercado Pago",
  debito: "Débito",
  qr: "QR",
};
const TODOS_LOS_MEDIOS = Object.keys(ETIQUETA_MEDIO) as MedioPago[];

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/San_Juan" });
const precioDe = (p: ProductoVendible) => p.precioOferta ?? p.precio;

function inicioDelDia(): string {
  // Medianoche de hoy en San Juan (UTC-3, sin horario de verano).
  const ahora = new Date();
  const local = new Date(ahora.getTime() - 3 * 3600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + 3 * 3600_000).toISOString();
}

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof ApiError ? err.message : porDefecto;
}

export function PuntoDeVenta({
  tiendaId,
  mediosDePago,
  productos,
  onStockCambiado,
}: {
  tiendaId: string;
  mediosDePago: MedioPago[];
  productos: ProductoVendible[];
  onStockCambiado: () => void;
}) {
  const medios = mediosDePago.length > 0 ? mediosDePago : TODOS_LOS_MEDIOS;
  const [busqueda, setBusqueda] = useState("");
  const [ticket, setTicket] = useState<Record<string, number>>({});
  const [medio, setMedio] = useState<MedioPago>(medios.includes("efectivo") ? "efectivo" : medios[0]);
  const [nota, setNota] = useState("");
  const [emailCliente, setEmailCliente] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [porCobrar, setPorCobrar] = useState<Venta[]>([]);
  const [deHoy, setDeHoy] = useState<Venta[]>([]);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargarVentas = useCallback(async () => {
    try {
      const [pendientes, hoy] = await Promise.all([
        apiGetPaginado<Venta>(`/api/tiendas/${tiendaId}/ventas?estado=por_cobrar&pageSize=50`),
        apiGetPaginado<Venta>(
          `/api/tiendas/${tiendaId}/ventas?estado=cobrada&desde=${encodeURIComponent(inicioDelDia())}&pageSize=100`
        ),
      ]);
      setPorCobrar(pendientes.data);
      setDeHoy(hoy.data);
    } catch {
      // Las listas son informativas: si fallan, el punto de venta sigue usable.
    }
  }, [tiendaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la API (el setState ocurre después del fetch)
    cargarVentas();
  }, [cargarVentas]);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const lineas = Object.entries(ticket)
    .filter(([, cantidad]) => cantidad > 0)
    .map(([id, cantidad]) => ({ producto: porId.get(id)!, cantidad }))
    .filter((l) => l.producto);
  const total = Math.round(lineas.reduce((s, l) => s + l.cantidad * precioDe(l.producto), 0) * 100) / 100;

  const termino = busqueda.trim().toLowerCase();
  const visibles = productos
    .filter((p) => p.disponible && p.stock > 0)
    .filter((p) => !termino || p.nombre.toLowerCase().includes(termino))
    .slice(0, termino ? 30 : 12);

  function fijar(id: string, cantidad: number) {
    setTicket((prev) => ({ ...prev, [id]: cantidad }));
  }

  async function cerrar(cobrarAhora: boolean) {
    if (lineas.length === 0) return;
    setEnviando(true);
    setError(null);
    try {
      await apiPost<Venta>(`/api/tiendas/${tiendaId}/ventas`, {
        items: lineas.map((l) => ({ productoId: l.producto.id, cantidad: l.cantidad })),
        medioPago: medio,
        cobrarAhora,
        nota: nota.trim() || undefined,
        compradorEmail: emailCliente.trim() || undefined,
      });
      setTicket({});
      setNota("");
      setEmailCliente("");
      setToast(cobrarAhora ? `Venta cobrada: ${formatoARS(total)}` : `Venta por cobrar: ${formatoARS(total)}`);
      onStockCambiado();
      cargarVentas();
    } catch (err) {
      setError(mensajeDe(err, "No se pudo registrar la venta."));
    } finally {
      setEnviando(false);
    }
  }

  async function transicionar(venta: Venta, accion: "cobrar" | "anular") {
    if (accion === "anular" && !window.confirm(`¿Anular la venta de ${formatoARS(venta.total)}? El stock vuelve a la tienda.`)) {
      return;
    }
    setProcesando(venta.id);
    setError(null);
    try {
      await apiPost(`/api/ventas/${venta.id}/transicion`, { accion });
      setToast(accion === "cobrar" ? "Pago registrado" : "Venta anulada, el stock volvió");
      if (accion === "anular") onStockCambiado();
      cargarVentas();
    } catch (err) {
      setError(mensajeDe(err, "No se pudo actualizar la venta."));
    } finally {
      setProcesando(null);
    }
  }

  const totalHoy = deHoy.reduce((s, v) => s + v.total, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Buscador de productos */}
      <section className="flex flex-col gap-2.5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto para vender"
          aria-label="Buscar producto para vender"
          className="h-12 rounded-control border border-border bg-surface px-4 text-[15px] focus:border-primary focus:outline-none"
        />
        {productos.length === 0 ? (
          <p className="text-[13px] text-text-2">Todavía no cargaste productos. Agregalos en la pestaña Productos.</p>
        ) : visibles.length === 0 ? (
          <p className="text-[13px] text-text-2">No hay productos con stock que coincidan.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibles.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-card border border-border bg-surface p-2.5">
                {p.imagenEfectiva ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imagenEfectiva} alt="" className="h-11 w-11 flex-shrink-0 rounded-control object-cover" />
                ) : (
                  <div className="h-11 w-11 flex-shrink-0 rounded-control bg-placeholder" />
                )}
                <div className="flex min-w-0 flex-grow flex-col">
                  <span className="truncate text-[14px] font-semibold">{p.nombre}</span>
                  <span className="text-[12px] text-text-2">
                    {formatoARS(precioDe(p))}
                    {p.unidad === "kg" ? " / kg" : ""} · stock {formatearCantidad(p.unidad, p.stock)}
                  </span>
                </div>
                <SelectorCantidad
                  unidad={p.unidad}
                  valor={ticket[p.id] ?? 0}
                  max={p.stock}
                  nombre={p.nombre}
                  onChange={(v) => fijar(p.id, v)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Ticket */}
      <section aria-label="Ticket" className="flex flex-col gap-3 rounded-card border-2 border-primary/30 bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[18px] font-bold text-primary-dark">Ticket</h2>
          <span className="text-[22px] font-bold" data-testid="total-ticket">
            {formatoARS(total)}
          </span>
        </div>

        {lineas.length === 0 ? (
          <p className="text-[13px] text-text-2">Agregá productos con el botón +.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lineas.map(({ producto, cantidad }) => (
              <li key={producto.id} className="flex items-center justify-between gap-2 text-[14px]">
                <span className="min-w-0 truncate">
                  {formatearCantidad(producto.unidad, cantidad)} · {producto.nombre}
                </span>
                <span className="flex flex-shrink-0 items-center gap-2">
                  {formatoARS(cantidad * precioDe(producto))}
                  <button
                    type="button"
                    onClick={() => fijar(producto.id, 0)}
                    aria-label={`Quitar ${producto.nombre}`}
                    className="press h-7 w-7 rounded-pill text-text-2"
                  >
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-text-2">Medio de pago</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Medio de pago">
            {medios.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={medio === m}
                onClick={() => setMedio(m)}
                className={`press rounded-pill px-3 py-1.5 text-[13px] font-semibold ${
                  medio === m ? "bg-primary text-white" : "border border-border bg-surface text-text"
                }`}
              >
                {ETIQUETA_MEDIO[m]}
              </button>
            ))}
          </div>
        </div>

        <input
          value={emailCliente}
          onChange={(e) => setEmailCliente(e.target.value)}
          type="email"
          placeholder="Email del cliente (opcional, si tiene cuenta)"
          aria-label="Email del cliente"
          className="h-11 rounded-control border border-border bg-surface px-3.5 text-[14px] focus:border-primary focus:outline-none"
        />
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          maxLength={200}
          placeholder="Nota (opcional, ej. Juan paga el viernes)"
          aria-label="Nota de la venta"
          className="h-11 rounded-control border border-border bg-surface px-3.5 text-[14px] focus:border-primary focus:outline-none"
        />

        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={lineas.length === 0 || enviando}
            onClick={() => cerrar(false)}
            className="press h-12 flex-1 rounded-control border border-border bg-surface text-[14px] font-semibold text-text disabled:opacity-50"
          >
            Cerrar · por cobrar
          </button>
          <button
            type="button"
            disabled={lineas.length === 0 || enviando}
            onClick={() => cerrar(true)}
            className="press h-12 flex-1 rounded-control bg-accent text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Registrando..." : "Cobrar ahora"}
          </button>
        </div>
      </section>

      {/* Por cobrar */}
      <section className="flex flex-col gap-2">
        <h2 className="text-[15px] font-bold">Por cobrar ({porCobrar.length})</h2>
        {porCobrar.length === 0 ? (
          <p className="text-[13px] text-text-2">No hay ventas esperando el pago.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {porCobrar.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[16px] font-bold">{formatoARS(v.total)}</span>
                  <span className="rounded-pill bg-estado-pendiente-bg px-2.5 py-1 text-[11px] font-bold text-estado-pendiente-text">
                    POR COBRAR
                  </span>
                </div>
                <div className="text-[12px] text-text-2">
                  {hora(v.creadaEn)} · {v.medioPago ? ETIQUETA_MEDIO[v.medioPago] : "Sin medio"}
                  {v.comprador ? ` · ${v.comprador.nombre}` : ""}
                </div>
                <div className="text-[12px] text-text-2">
                  {v.items.map((i) => `${formatearCantidad(i.unidad, i.cantidad)} ${i.nombre}`).join(", ")}
                </div>
                {v.nota && <div className="text-[13px] italic text-text">“{v.nota}”</div>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={procesando === v.id}
                    onClick={() => transicionar(v, "anular")}
                    className="press h-10 flex-1 rounded-control border border-border bg-surface text-[13px] font-semibold text-estado-rechazado-text disabled:opacity-50"
                  >
                    Anular
                  </button>
                  <button
                    type="button"
                    disabled={procesando === v.id}
                    onClick={() => transicionar(v, "cobrar")}
                    className="press h-10 flex-[2] rounded-control bg-primary text-[13px] font-semibold text-white disabled:opacity-50"
                  >
                    Pago recibido
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Caja del día */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-bold">Cobrado hoy</h2>
          <span className="text-[15px] font-bold text-primary-dark">{formatoARS(totalHoy)}</span>
        </div>
        {deHoy.length === 0 ? (
          <p className="text-[13px] text-text-2">Todavía no hay ventas cobradas hoy.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border bg-surface">
            {deHoy.map((v) => (
              <li key={v.id} className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
                <span className="text-text-2">
                  {hora(v.cobradaEn ?? v.creadaEn)} · {v.medioPago ? ETIQUETA_MEDIO[v.medioPago] : "Pedido online"}
                </span>
                <span className="font-semibold">{formatoARS(v.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
