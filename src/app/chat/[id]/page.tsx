"use client";

import { use, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";
import { useAlVolver } from "@/lib/hooks/useAlVolver";
import { haceCuanto } from "@/components/pedidos/DetallePedido";
import { TEXTO_MAXIMO_CHAT } from "@/lib/chat/plantillas";

// Conversación (24-chat.md): botones de "¿está abierta?" siempre; texto libre (con
// emojis) si corresponde.
type Mensaje = { id: string; deTienda: boolean; texto: string; plantilla: string | null; pedidoId: string | null; creadoEn: string };
type Detalle = {
  id: string;
  tiendaId: string;
  lado: "comprador" | "tienda";
  otraParte: { id: string; nombre: string };
  libre: boolean;
  motivo: string | null;
  plantillas: Array<{ clave: string; texto: string }>;
  mensajes: Mensaje[];
};

const REFRESCO_MS = 8000;

export default function ConversacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detalle | null>(null);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fin = useRef<HTMLDivElement>(null);

  const cargar = useCallback(() => {
    apiGet<Detalle>(`/api/chat/conversaciones/${id}`)
      .then(setD)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar el chat."));
  }, [id]);

  useEffect(() => {
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [cargar]);
  useAlVolver(cargar);
  const cantidad = d?.mensajes.length ?? 0;
  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [cantidad]);

  async function enviar(cuerpo: { texto?: string; plantilla?: string }) {
    setEnviando(true);
    setError(null);
    try {
      await apiPost(`/api/chat/conversaciones/${id}/mensajes`, cuerpo);
      if (cuerpo.texto) setTexto("");
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo enviar.");
    } finally {
      setEnviando(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (texto.trim()) enviar({ texto });
  }

  const mio = (m: Mensaje) => (d?.lado === "tienda" ? m.deTienda : !m.deTienda);

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-4 py-3">
        <Link href={d?.lado === "tienda" ? `/chat?tienda=${d.tiendaId}` : "/chat"} aria-label="Volver a los chats" className="press flex h-11 w-11 items-center justify-center rounded-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-display text-[18px] font-bold text-primary-dark">{d?.otraParte.nombre ?? "Chat"}</span>
          {d?.lado === "comprador" && (
            <Link href={`/tiendas/${d.tiendaId}`} className="text-[12px] font-semibold text-accent-text">
              Ver tienda
            </Link>
          )}
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {d?.mensajes.length === 0 && <p className="mt-6 text-center text-[13px] text-text-2">Todavía no hay mensajes.</p>}
        {d?.mensajes.map((m) =>
          m.plantilla === "ajuste" ? (
            <div key={m.id} className="mx-auto max-w-[90%] rounded-control bg-estado-pendiente-bg px-3 py-2 text-center text-[12px] text-estado-pendiente-text" data-testid="mensaje">
              {m.texto}
              {m.pedidoId && (
                <Link href={`/pedidos/${m.pedidoId}`} className="ml-1 font-semibold underline">
                  Ver pedido
                </Link>
              )}
            </div>
          ) : (
            <div key={m.id} className={`flex flex-col ${mio(m) ? "items-end" : "items-start"}`} data-testid="mensaje">
              <span className={`max-w-[80%] whitespace-pre-wrap break-words rounded-card px-3 py-2 text-[14px] ${mio(m) ? "bg-primary text-white" : "border border-border bg-surface text-text"}`}>
                {m.texto}
              </span>
              <span className="mt-0.5 text-[11px] text-text-2">{haceCuanto(m.creadoEn)}</span>
            </div>
          )
        )}
        <div ref={fin} />
      </div>

      <div className="flex flex-col gap-2 border-t border-border bg-surface px-4 py-3">
        {d && d.plantillas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {d.plantillas.map((p) => (
              <button
                key={p.clave}
                type="button"
                disabled={enviando}
                onClick={() => enviar({ plantilla: p.clave })}
                className="press rounded-pill border border-primary bg-primary-soft px-3 py-2 text-left text-[13px] font-semibold text-primary-dark disabled:opacity-50"
              >
                {p.texto}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={TEXTO_MAXIMO_CHAT}
            disabled={!d?.libre || enviando}
            placeholder={d?.libre ? "Escribí un mensaje 🙂" : "Solo mensajes rápidos"}
            aria-label="Mensaje"
            className="h-11 min-w-0 flex-1 rounded-pill border border-border bg-bg px-4 text-[14px] disabled:opacity-60"
          />
          <button type="submit" disabled={!d?.libre || enviando || !texto.trim()} className="press h-11 rounded-pill bg-primary px-4 text-[14px] font-semibold text-white disabled:opacity-50">
            Enviar
          </button>
        </form>
        {d && !d.libre && d.motivo && <p className="text-[12px] text-text-2">{d.motivo}</p>}
        {error && (
          <p role="alert" className="text-[12px] text-estado-rechazado-text">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
