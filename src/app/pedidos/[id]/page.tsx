"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { AjustesPeso, type ItemConAjuste } from "@/components/pedidos/AjustesPeso";
import { BotonChat } from "@/components/chat/BotonChat";
import { EstadoPedidoBadge } from "@/components/ui/EstadoPedidoBadge";
import { DetallePedido, haceCuanto, type ItemPedidoVista } from "@/components/pedidos/DetallePedido";
import { apiGet, apiPost, ApiError } from "@/lib/api-client";

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
  nota: string | null;
  total: number;
  creadoEn: string;
  comprador: { nombre: string };
  items: Array<ItemPedidoVista & ItemConAjuste>;
  // Solo para el equipo de la tienda (04-pedidos.md, ronda 6).
  ubicacionComprador: { lat: number; lon: number } | null;
  tiendaUbicacion: { lat: number; lon: number } | null;
  distanciaKm: number | null;
};

const MapaPedido = dynamic(() => import("@/components/pedidos/MapaPedido").then((m) => m.MapaPedido), { ssr: false });

type Accion = "confirmar" | "rechazar" | "marcarListo" | "entregar" | "cancelar";

// 04-pedidos.md: el vendedor avanza el pedido; el comprador solo puede cancelarlo
// mientras está pendiente.
const ACCIONES_VENDEDOR: Partial<Record<EstadoPedido, Accion[]>> = {
  pendiente: ["confirmar", "rechazar"],
  confirmado: ["marcarListo"],
  listo_para_retirar: ["entregar"],
};
const ETIQUETA: Record<Accion, string> = {
  confirmar: "Confirmar",
  rechazar: "Rechazar",
  marcarListo: "Marcar listo para retirar",
  entregar: "Entregar",
  cancelar: "Cancelar pedido",
};

export default function PedidoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [esVendedor, setEsVendedor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    apiGet<Pedido>(`/api/pedidos/${id}`)
      .then(async (p) => {
        setPedido(p);
        // ¿Lo está mirando alguien que atiende los pedidos de esa tienda? (19-equipo-tienda.md)
        const mias = await apiGet<Array<{ tienda: { id: string }; permisos: string[] }>>("/api/tiendas/mias").catch(() => []);
        setEsVendedor(mias.some((m) => m.tienda.id === p.tiendaId && m.permisos.includes("pedidos")));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Error al cargar el pedido."));
  }, [id]);

  async function ejecutar(accion: Accion) {
    if (!pedido) return;
    setProcesando(true);
    setError(null);
    try {
      setPedido(await apiPost<Pedido>(`/api/pedidos/${pedido.id}/transicion`, { accion }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar el pedido.");
    } finally {
      setProcesando(false);
    }
  }

  const acciones: Accion[] = pedido
    ? esVendedor
      ? (ACCIONES_VENDEDOR[pedido.estado] ?? [])
      : pedido.estado === "pendiente"
        ? ["cancelar"]
        : []
    : [];

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 bg-bg px-5 py-6">
      <Link
        href={esVendedor && pedido ? `/mi-tienda?tienda=${pedido.tiendaId}&seccion=pedidos` : "/perfil/pedidos"}
        className="text-[13px] font-semibold text-accent-text"
      >
        {esVendedor ? "← Volver a los pedidos de la tienda" : "← Volver a mis pedidos"}
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
          <div className="text-[13px] text-text-2">
            {esVendedor ? (
              <>
                De <span className="font-semibold text-text">{pedido.comprador.nombre}</span> ·{" "}
              </>
            ) : null}
            {haceCuanto(pedido.creadoEn)}
          </div>
          {esVendedor && (
            <div className="flex flex-col gap-2" data-testid="ubicacion-comprador">
              {pedido.ubicacionComprador && pedido.tiendaUbicacion ? (
                <>
                  <span className="text-[13px] text-text-2">
                    Pidió a <strong className="text-text">{pedido.distanciaKm?.toLocaleString("es-AR", { maximumFractionDigits: 1 })} km</strong> de la tienda
                  </span>
                  <div className="h-48 overflow-hidden rounded-control border border-border">
                    <MapaPedido tienda={pedido.tiendaUbicacion} comprador={pedido.ubicacionComprador} nombreComprador={pedido.comprador.nombre} />
                  </div>
                </>
              ) : (
                <span className="text-[12px] text-text-2">El comprador no compartió su ubicación.</span>
              )}
            </div>
          )}
          <DetallePedido items={pedido.items} nota={pedido.nota} total={pedido.total} />
          {pedido.estado === "confirmado" && (
            <AjustesPeso<Pedido> items={pedido.items} lado={esVendedor ? "tienda" : "comprador"} pedidoId={pedido.id} onActualizado={setPedido} />
          )}
          {esVendedor ? (
            <Link href={`/chat?tienda=${pedido.tiendaId}`} className="self-start text-[13px] font-semibold text-accent-text">
              Chats de la tienda →
            </Link>
          ) : (
            <BotonChat tiendaId={pedido.tiendaId} className="self-start" />
          )}
          {acciones.length > 0 && (
            <div className="flex gap-2">
              {acciones.map((accion) => (
                <button
                  key={accion}
                  type="button"
                  disabled={procesando}
                  onClick={() => ejecutar(accion)}
                  className={`press h-11 flex-1 rounded-control text-[13px] font-semibold disabled:opacity-50 ${
                    accion === "rechazar" || accion === "cancelar"
                      ? "border border-border bg-surface text-text"
                      : "bg-primary text-white"
                  }`}
                >
                  {ETIQUETA[accion]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
