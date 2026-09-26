"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
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
  estado: EstadoPedido;
  nota: string | null;
  items: Array<{ productoId: string; cantidad: number; precioUnitario: number }>;
};

const formatoARS = (n: number) =>
  "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Pedido>(`/api/pedidos/${id}`)
      .then(setPedido)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar el pedido."));
  }, [id]);

  const total = pedido?.items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0) ?? 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-bg px-5 py-6">
      <Link href="/" className="text-[13px] font-semibold text-accent-text">
        ← Volver al mapa
      </Link>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      {pedido && (
        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <span className="font-display text-[18px] font-bold text-primary-dark">
              Pedido #{pedido.id.slice(0, 4).toUpperCase()}
            </span>
            <EstadoPedidoBadge estado={pedido.estado} />
          </div>
          <div className="flex flex-col gap-2">
            {pedido.items.map((item) => (
              <div key={item.productoId} className="flex justify-between text-[14px]">
                <span>{item.cantidad}× producto</span>
                <span>{formatoARS(item.cantidad * item.precioUnitario)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-[15px] font-semibold">
            <span>Total</span>
            <span>{formatoARS(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
