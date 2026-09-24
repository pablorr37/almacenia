"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { EstadoPedidoBadge } from "@/components/ui/EstadoPedidoBadge";
import { apiGet, ApiError } from "@/lib/api-client";

type EstadoPedido =
  | "pendiente"
  | "confirmado"
  | "listo_para_retirar"
  | "entregado"
  | "rechazado"
  | "cancelado";

type Pedido = {
  id: string;
  tiendaId: string;
  estado: EstadoPedido;
  total: number;
};

type Grupo = "activos" | "entregados" | "cancelados";

const ESTADOS_POR_GRUPO: Record<Grupo, EstadoPedido[]> = {
  activos: ["pendiente", "confirmado", "listo_para_retirar"],
  entregados: ["entregado"],
  cancelados: ["rechazado", "cancelado"],
};

const GRUPOS: Array<{ valor: Grupo; etiqueta: string }> = [
  { valor: "activos", etiqueta: "Activos" },
  { valor: "entregados", etiqueta: "Entregados" },
  { valor: "cancelados", etiqueta: "Cancelados" },
];

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PedidosCompradorPage() {
  const { status } = useSession();
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [grupo, setGrupo] = useState<Grupo>("activos");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<Pedido[]>(`/api/pedidos?compradorId=me`)
      .then(setPedidos)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No pudimos cargar tus pedidos."));
  }, [status]);

  const pedidosDelGrupo = pedidos.filter((p) => ESTADOS_POR_GRUPO[grupo].includes(p.estado));
  const montoDelGrupo = pedidosDelGrupo.reduce((sum, p) => sum + p.total, 0);

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión para ver tus pedidos.</p>
        <Link href="/login" className="font-semibold text-accent">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/perfil" aria-label="Volver al perfil" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Mis pedidos</h1>
      </div>

      <div className="flex gap-2">
        {GRUPOS.map((g) => (
          <button
            key={g.valor}
            onClick={() => setGrupo(g.valor)}
            className={`flex-1 rounded-pill px-3 py-2 text-[13px] font-semibold ${
              grupo === g.valor ? "bg-primary text-white" : "border border-border bg-surface text-text"
            }`}
          >
            {g.etiqueta}
          </button>
        ))}
      </div>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      {pedidosDelGrupo.length > 0 && (
        <div className="rounded-control bg-surface px-3.5 py-2.5 text-[13px] font-semibold text-text-2">
          {pedidosDelGrupo.length} pedido{pedidosDelGrupo.length !== 1 ? "s" : ""} · total {formatoARS(montoDelGrupo)}
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        {pedidosDelGrupo.length === 0 && !error && (
          <p className="py-6 text-center text-[13px] text-text-2">No tenés pedidos {GRUPOS.find((g) => g.valor === grupo)?.etiqueta.toLowerCase()}.</p>
        )}
        {pedidosDelGrupo.map((p) => (
          <Link
            key={p.id}
            href={`/pedidos/${p.id}`}
            className="flex items-center justify-between rounded-card border border-border bg-surface p-3.5"
          >
            <div className="flex flex-col gap-1">
              <EstadoPedidoBadge estado={p.estado} />
            </div>
            <span className="text-[15px] font-semibold">{formatoARS(p.total)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
