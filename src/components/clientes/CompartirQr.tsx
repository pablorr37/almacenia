"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { apiPost, ApiError } from "@/lib/api-client";
import { PREFIJO_QR } from "@/lib/clientes/leer-codigo";
import { useTema } from "@/components/tema/TemaProvider";

// "Compartir mis datos" (01-auth.md): genera un código de 6 dígitos que vale 10
// minutos y lo muestra como QR, para que el vendedor asocie la venta de mostrador.

// Ícono de QR estilizado (tres marcadores de esquina y módulos sueltos).
export function IconoQr({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.6" stroke="currentColor" strokeWidth="2" />
      <rect x="5.6" y="5.6" width="1.8" height="1.8" rx="0.4" fill="currentColor" />
      <rect x="16.6" y="5.6" width="1.8" height="1.8" rx="0.4" fill="currentColor" />
      <rect x="5.6" y="16.6" width="1.8" height="1.8" rx="0.4" fill="currentColor" />
      <rect x="14" y="14" width="2.6" height="2.6" rx="0.6" fill="currentColor" />
      <rect x="18.4" y="14" width="2.6" height="2.6" rx="0.6" fill="currentColor" />
      <rect x="14" y="18.4" width="2.6" height="2.6" rx="0.6" fill="currentColor" />
      <rect x="18.4" y="18.4" width="2.6" height="2.6" rx="0.6" fill="currentColor" />
    </svg>
  );
}


function restante(expiraEn: string, ahora: number): string {
  const s = Math.max(0, Math.round((new Date(expiraEn).getTime() - ahora) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CompartirQr() {
  const [abierto, setAbierto] = useState(false);
  const [codigo, setCodigo] = useState<{ codigo: string; expiraEn: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const { colores } = useTema();

  const generar = useCallback(async () => {
    setGenerando(true);
    setError(null);
    try {
      const nuevo = await apiPost<{ codigo: string; expiraEn: string }>("/api/auth/perfil/codigo");
      setCodigo(nuevo);
      setQr(await QRCode.toDataURL(`${PREFIJO_QR}${nuevo.codigo}`, { width: 480, margin: 1, color: { dark: colores.primaryDark } }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo generar el código.");
    } finally {
      setGenerando(false);
    }
  }, [colores.primaryDark]);

  // Cuenta regresiva mientras el diálogo está abierto.
  useEffect(() => {
    if (!abierto) return;
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [abierto]);

  const vencido = codigo ? new Date(codigo.expiraEn).getTime() <= ahora : false;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAbierto(true);
          setAhora(Date.now());
          if (!codigo || new Date(codigo.expiraEn).getTime() <= Date.now()) generar();
        }}
        className="press flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3.5 text-left shadow-card"
      >
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-dark">
          <IconoQr className="h-6 w-6" />
        </span>
        <span className="flex flex-col">
          <span className="text-[15px] font-semibold text-text">Compartir QR</span>
          <span className="text-[12px] text-text-2">Mostralo en la tienda para que tu compra quede a tu nombre y sume puntos</span>
        </span>
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-4 sm:items-center" role="presentation" onClick={() => setAbierto(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="compartir-qr-titulo"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm animate-slide-up flex-col items-center gap-3 rounded-card bg-surface p-5 shadow-float"
          >
            <h2 id="compartir-qr-titulo" className="font-display text-[20px] font-bold text-primary-dark">
              Mi código de cliente
            </h2>
            <p className="text-center text-[13px] text-text-2">
              Mostrale el QR al vendedor o dictale el número.
            </p>
            {qr && !vencido ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="Código QR para compartir tus datos" className="h-60 w-60 rounded-control" />
            ) : (
              <div className="flex h-60 w-60 items-center justify-center rounded-control bg-placeholder text-[13px] text-text-2">
                {generando ? "Generando..." : vencido ? "El código venció" : ""}
              </div>
            )}
            {codigo && !vencido && (
              <>
                <span className="font-display text-[34px] font-bold tracking-[0.2em] tabular-nums text-text" data-testid="codigo-cliente">
                  {codigo.codigo.slice(0, 3)} {codigo.codigo.slice(3)}
                </span>
                <span className="text-[12px] text-text-2">Vence en {restante(codigo.expiraEn, ahora)}</span>
              </>
            )}
            {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
            <div className="flex w-full gap-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="press h-11 flex-1 rounded-control border border-border bg-surface text-[14px] font-semibold"
              >
                Cerrar
              </button>
              <button
                type="button"
                disabled={generando}
                onClick={generar}
                className="press h-11 flex-1 rounded-control bg-primary text-[14px] font-semibold text-white disabled:opacity-50"
              >
                Generar otro
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
