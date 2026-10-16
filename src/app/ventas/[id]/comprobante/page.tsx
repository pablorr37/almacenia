"use client";

import { use, useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { ETIQUETA_ALICUOTA, ETIQUETA_CONDICION, type AlicuotaIva, type CondicionIva } from "@/lib/precios/precios";

// Comprobante de una venta cobrada (20-precios-facturacion.md): si no existe, se emite
// eligiendo al cliente; después se ve en formato imprimible. Mientras no haya conexión
// con ARCA, es un comprobante interno.

type Comprobante = {
  tipo: "A" | "B" | "C";
  numeroFormateado: string;
  cliente: { docTipo: "CF" | "DNI" | "CUIT"; doc: string | null; nombre: string | null; condicionIva: CondicionIva | null };
  neto: number;
  ivaPorAlicuota: Array<{ alicuota: AlicuotaIva; neto: number; iva: number }>;
  internos: number;
  total: number;
  estado: "interno" | "autorizado" | "rechazado";
  cae: string | null;
  caeVencimiento: string | null;
  emitidoEn: string;
  tienda: {
    nombre: string;
    razonSocial: string | null;
    cuit: string | null;
    condicionIva: CondicionIva;
    domicilioFiscal: string | null;
    ingresosBrutos: string | null;
    inicioActividades: string | null;
  };
  venta: { creadaEn: string; medioPago: string | null };
  items: Array<{ nombre: string; cantidad: number; precioUnitario: number; subtotal: number }>;
};

const formatoARS = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatoCuit = (c: string | null) => (c ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : "—");
const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/San_Juan", dateStyle: "short", timeStyle: "short" });

const claseInput = "h-11 w-full rounded-control border border-border bg-surface px-3 text-[14px]";

export default function ComprobantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);
  const [sinComprobante, setSinComprobante] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [docTipo, setDocTipo] = useState<"CF" | "DNI" | "CUIT">("CF");
  const [doc, setDoc] = useState("");
  const [nombre, setNombre] = useState("");
  const [condicionCliente, setCondicionCliente] = useState<CondicionIva>("responsable_inscripto");

  const cargar = useCallback(() => {
    apiGet<Comprobante>(`/api/ventas/${id}/comprobante`)
      .then((c) => {
        setComprobante(c);
        setSinComprobante(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "COMPROBANTE_NO_ENCONTRADO") setSinComprobante(true);
        else setError(err instanceof ApiError ? err.message : "No se pudo cargar el comprobante.");
      });
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function emitir(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      await apiPost(`/api/ventas/${id}/comprobante`, {
        cliente: docTipo === "CF" ? { docTipo, nombre: nombre || undefined } : { docTipo, doc, nombre: nombre || undefined, condicionIva: docTipo === "CUIT" ? condicionCliente : undefined },
      });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo emitir el comprobante.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-bg px-5 py-5 print:max-w-none print:bg-white">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/mi-tienda?seccion=vender" className="text-[13px] font-semibold text-accent-text">
          ← Volver a vender
        </Link>
        {comprobante && (
          <button
            type="button"
            onClick={() => window.print()}
            className="press rounded-pill bg-primary px-4 py-2 text-[13px] font-semibold text-white"
          >
            Imprimir
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-estado-rechazado-text">
          {error}
        </p>
      )}

      {sinComprobante && (
        <form onSubmit={emitir} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <h1 className="font-display text-[20px] font-bold text-primary-dark">Emitir comprobante</h1>
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            Cliente
            <select value={docTipo} onChange={(e) => setDocTipo(e.target.value as typeof docTipo)} aria-label="Tipo de cliente" className={claseInput}>
              <option value="CF">Consumidor final</option>
              <option value="DNI">Con DNI</option>
              <option value="CUIT">Con CUIT</option>
            </select>
          </label>
          {docTipo !== "CF" && (
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
              {docTipo}
              <input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" required aria-label={`${docTipo} del cliente`} className={claseInput} />
            </label>
          )}
          {docTipo === "CUIT" && (
            <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
              Condición del cliente
              <select value={condicionCliente} onChange={(e) => setCondicionCliente(e.target.value as CondicionIva)} className={claseInput}>
                <option value="responsable_inscripto">Responsable inscripto</option>
                <option value="monotributo">Monotributo</option>
                <option value="exento">Exento</option>
              </select>
            </label>
          )}
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            Nombre o razón social (opcional)
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={claseInput} />
          </label>
          <button
            type="submit"
            disabled={enviando}
            className="press h-12 rounded-control bg-accent text-[15px] font-semibold text-white disabled:opacity-50"
          >
            {enviando ? "Emitiendo..." : "Emitir comprobante"}
          </button>
        </form>
      )}

      {comprobante && (
        <article className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 text-[13px] print:border-black" data-testid="comprobante">
          {comprobante.estado === "interno" && (
            <p className="rounded-control bg-estado-pendiente-bg px-3 py-2 text-center text-[12px] font-bold uppercase text-estado-pendiente-text">
              Comprobante interno — no válido como factura
            </p>
          )}
          <header className="flex items-start justify-between gap-3 border-b border-border pb-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-[17px] font-bold">{comprobante.tienda.razonSocial}</span>
              <span className="text-text-2">{comprobante.tienda.domicilioFiscal}</span>
              <span className="text-text-2">{ETIQUETA_CONDICION[comprobante.tienda.condicionIva]}</span>
              <span className="text-text-2">CUIT {formatoCuit(comprobante.tienda.cuit)}</span>
              {comprobante.tienda.ingresosBrutos && <span className="text-text-2">IIBB {comprobante.tienda.ingresosBrutos}</span>}
              {comprobante.tienda.inicioActividades && <span className="text-text-2">Inicio de actividades {comprobante.tienda.inicioActividades}</span>}
            </div>
            <div className="flex flex-shrink-0 flex-col items-end gap-0.5">
              <span className="flex h-12 w-12 items-center justify-center rounded-control border-2 border-text font-display text-[26px] font-bold" aria-label={`Tipo ${comprobante.tipo}`}>
                {comprobante.tipo}
              </span>
              <span className="font-semibold tabular-nums">N° {comprobante.numeroFormateado}</span>
              <span className="text-text-2">{fecha(comprobante.venta.creadaEn)}</span>
            </div>
          </header>
          <p>
            <strong>Cliente:</strong>{" "}
            {comprobante.cliente.docTipo === "CF"
              ? "Consumidor final"
              : `${comprobante.cliente.nombre ?? ""} · ${comprobante.cliente.docTipo} ${comprobante.cliente.docTipo === "CUIT" ? formatoCuit(comprobante.cliente.doc) : comprobante.cliente.doc}`}
            {comprobante.cliente.docTipo === "CF" && comprobante.cliente.nombre ? ` (${comprobante.cliente.nombre})` : ""}
          </p>
          <table className="w-full text-left tabular-nums">
            <thead className="border-b border-border text-[12px] text-text-2">
              <tr>
                <th className="py-1 font-semibold">Producto</th>
                <th className="py-1 text-right font-semibold">Cant.</th>
                <th className="py-1 text-right font-semibold">Precio</th>
                <th className="py-1 text-right font-semibold">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {comprobante.items.map((i, n) => (
                <tr key={n} className="border-b border-border/60">
                  <td className="py-1.5 pr-2">{i.nombre}</td>
                  <td className="py-1.5 text-right">{i.cantidad.toLocaleString("es-AR")}</td>
                  <td className="py-1.5 text-right">{formatoARS(i.precioUnitario)}</td>
                  <td className="py-1.5 text-right">{formatoARS(i.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto flex w-full max-w-[260px] flex-col gap-1 tabular-nums">
            {comprobante.tipo !== "C" && (
              <>
                <div className="flex justify-between">
                  <dt>Neto gravado</dt>
                  <dd>{formatoARS(comprobante.neto)}</dd>
                </div>
                {comprobante.ivaPorAlicuota.map((a) => (
                  <div key={a.alicuota} className="flex justify-between">
                    <dt>{ETIQUETA_ALICUOTA[a.alicuota]}</dt>
                    <dd>{formatoARS(a.iva)}</dd>
                  </div>
                ))}
              </>
            )}
            {comprobante.internos > 0 && (
              <div className="flex justify-between">
                <dt>Impuestos internos</dt>
                <dd>{formatoARS(comprobante.internos)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-1 text-[16px] font-bold">
              <dt>Total</dt>
              <dd data-testid="comprobante-total">{formatoARS(comprobante.total)}</dd>
            </div>
          </dl>
          {comprobante.cae ? (
            <p className="text-[12px] text-text-2">
              CAE {comprobante.cae} · Vto. {comprobante.caeVencimiento}
            </p>
          ) : (
            <p className="text-[12px] text-text-2">Sin CAE: la conexión con ARCA todavía no está activa.</p>
          )}
        </article>
      )}
    </div>
  );
}
