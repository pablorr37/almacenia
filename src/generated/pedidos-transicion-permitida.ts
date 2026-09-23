type EstadoPedido = 
  | 'pendiente' 
  | 'confirmado' 
  | 'listo_para_retirar'
  | 'entregado' 
  | 'rechazado' 
  | 'cancelado';

type AccionPedido = 
  | 'confirmar' 
  | 'rechazar' 
  | 'marcarListo' 
  | 'entregar' 
  | 'cancelar';

export function transicionPermitida(
  estadoActual: EstadoPedido,
  accion: AccionPedido
): boolean {
  switch (estadoActual) {
    case 'pendiente':
      return accion === 'confirmar' || accion === 'rechazar' || accion === 'cancelar';
    case 'confirmado':
      return accion === 'marcarListo';
    case 'listo_para_retirar':
      return accion === 'entregar';
    case 'entregado':
    case 'rechazado':
    case 'cancelado':
      return false;
    default:
      return false;
  }
}