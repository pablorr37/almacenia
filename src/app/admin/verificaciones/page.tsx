"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";

type SolicitudVerificacion = {
  id: string;
  tiendaId: string;
  estado: "pendiente" | "aprobada" | "rechazada";
  creadaEn: string;
};

export default function AdminVerificacionesPage() {
  const { status } = useSession();
  const [solicitudes, setSolicitudes] = useState<SolicitudVerificacion[]>([]);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  function cargar() {
    apiGet<SolicitudVerificacion[]>("/api/admin/verificaciones?estado=pendiente")
      .then(setSolicitudes)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudieron cargar las solicitudes.");
        }
      });
  }

  useEffect(() => {
    if (status === "authenticated") cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function revisar(id: string, decision: "aprobada" | "rechazada") {
    setProcesando(id);
    setError(null);
    try {
      await apiPatch(`/api/admin/verificaciones/${id}`, { decision });
      setSolicitudes((actual) => actual.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo procesar la solicitud.");
    } finally {
      setProcesando(null);
    }
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión.</p>
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es solo para administradores.</p>
        <Link href="/" className="font-semibold text-accent-text">
          Volver al mapa
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Solicitudes de verificación</h1>
      </div>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      {solicitudes.length === 0 && !error && (
        <p className="py-6 text-center text-[13px] text-text-2">No hay solicitudes pendientes.</p>
      )}

      <div className="flex flex-col gap-2.5">
        {solicitudes.map((s) => (
          <div key={s.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
            <div className="text-[13px] text-text-2">Tienda: {s.tiendaId}</div>
            <div className="flex gap-2">
              <button
                onClick={() => revisar(s.id, "aprobada")}
                disabled={procesando === s.id}
                className="flex-1 rounded-control bg-primary px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                Aprobar
              </button>
              <button
                onClick={() => revisar(s.id, "rechazada")}
                disabled={procesando === s.id}
                className="flex-1 rounded-control border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text disabled:opacity-60"
              >
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
