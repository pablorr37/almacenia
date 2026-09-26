import { textoEstadoApertura, type EstadoApertura } from "@/lib/tiendas/horarios";

// Estado Abierto/Cerrado con texto explícito (no depende solo del color).
export function EstadoAperturaPill({ estado, className = "" }: { estado: EstadoApertura; className?: string }) {
  const estilos =
    estado.estado === "abierta"
      ? "bg-estado-entregado-bg text-estado-entregado-text"
      : estado.estado === "cerrada"
        ? "bg-estado-rechazado-bg text-estado-rechazado-text"
        : "bg-estado-cancelado-bg text-estado-cancelado-text";
  const punto =
    estado.estado === "abierta" ? "bg-estado-entregado-text" : estado.estado === "cerrada" ? "bg-estado-rechazado-text" : "bg-text-2";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-semibold tabular-nums ${estilos} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-pill ${punto}`} aria-hidden="true" />
      {textoEstadoApertura(estado)}
    </span>
  );
}
