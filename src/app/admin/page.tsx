"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";
import { ConfigSistema } from "@/components/ui/ConfigSistema";

type Metricas = {
  ventas: { cantidad: number; totalFacturado: number };
  pedidos: Record<string, number>;
  tiendasNuevas: number;
  tiendasDadasDeBaja: number;
  usuariosNuevos: number;
};

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente: "Pendientes",
  confirmado: "Confirmados",
  listo_para_retirar: "Listos para retirar",
  entregado: "Entregados",
  rechazado: "Rechazados",
  cancelado: "Cancelados",
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdminPage() {
  const { status } = useSession();
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<Metricas>("/api/admin/metricas")
      .then(setMetricas)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudieron cargar las métricas.");
        }
      });
  }, [status]);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión.</p>
        <Link href="/login" className="font-semibold text-accent">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es solo para administradores.</p>
        <Link href="/" className="font-semibold text-accent">
          Volver al mapa
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <h1 className="font-display text-[20px] font-bold text-primary-dark">Panel admin</h1>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        <Link href="/admin/verificaciones" className="text-[13px] font-semibold text-accent">
          Verificaciones →
        </Link>
        <Link href="/admin/usuarios" className="text-[13px] font-semibold text-accent">
          Usuarios →
        </Link>
        <Link href="/admin/productos" className="text-[13px] font-semibold text-accent">
          Productos →
        </Link>
        <Link href="/admin/ventas" className="text-[13px] font-semibold text-accent">
          Ventas →
        </Link>
      </div>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      {metricas && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-card border border-border bg-surface p-3.5">
              <div className="text-[12px] text-text-2">Ventas</div>
              <div className="text-[18px] font-bold">{metricas.ventas.cantidad}</div>
              <div className="text-[12px] text-text-2">{formatoARS(metricas.ventas.totalFacturado)}</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3.5">
              <div className="text-[12px] text-text-2">Usuarios nuevos</div>
              <div className="text-[18px] font-bold">{metricas.usuariosNuevos}</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3.5">
              <div className="text-[12px] text-text-2">Tiendas nuevas</div>
              <div className="text-[18px] font-bold">{metricas.tiendasNuevas}</div>
            </div>
            <div className="rounded-card border border-border bg-surface p-3.5">
              <div className="text-[12px] text-text-2">Tiendas dadas de baja</div>
              <div className="text-[18px] font-bold">{metricas.tiendasDadasDeBaja}</div>
            </div>
          </div>

          <div className="rounded-card border border-border bg-surface p-3.5">
            <div className="mb-2 text-[13px] font-semibold text-text">Pedidos por estado</div>
            <div className="flex flex-col gap-1.5">
              {Object.entries(metricas.pedidos).map(([estado, cantidad]) => (
                <div key={estado} className="flex justify-between text-[13px] text-text-2">
                  <span>{ETIQUETAS_ESTADO[estado] ?? estado}</span>
                  <span className="font-semibold text-text">{cantidad}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-text-2">Últimos 30 días.</p>
        </div>
      )}

      {metricas && <ConfigSistema />}
    </div>
  );
}
