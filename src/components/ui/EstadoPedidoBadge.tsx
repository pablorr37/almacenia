type EstadoPedido =
  | "pendiente"
  | "confirmado"
  | "listo_para_retirar"
  | "entregado"
  | "rechazado"
  | "cancelado";

const estilos: Record<EstadoPedido, string> = {
  pendiente: "bg-estado-pendiente-bg text-estado-pendiente-text",
  confirmado: "bg-estado-confirmado-bg text-estado-confirmado-text",
  listo_para_retirar: "bg-estado-listo-bg text-estado-listo-text",
  entregado: "bg-estado-entregado-bg text-estado-entregado-text",
  rechazado: "bg-estado-rechazado-bg text-estado-rechazado-text",
  cancelado: "bg-estado-cancelado-bg text-estado-cancelado-text",
};

const etiquetas: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  listo_para_retirar: "Listo para retirar",
  entregado: "Entregado",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
};

export function EstadoPedidoBadge({ estado }: { estado: EstadoPedido }) {
  return (
    <span
      className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${estilos[estado]}`}
    >
      {etiquetas[estado]}
    </span>
  );
}
