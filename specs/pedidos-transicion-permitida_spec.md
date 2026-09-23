
```markdown
## Módulo: pedidos-transicion-permitida

### Objetivo
Implementar una función pura para verificar si una transición de estado de pedido es válida, de acuerdo con las reglas de negocio definidas en el sistema de gestión de Almacenia. Esta función es utilizada por endpoints REST para validar transiciones antes de realizarlas.

### Requisitos funcionales
La función `transicionPermitida` debe determinar si una acción específica es permitida en un estado de pedido particular. Debe adherirse estrictamente a las transiciones de estado definidas en el sistema:

1. **Transiciones permitidas**:
   - Desde 'pendiente': se permite 'confirmar' (-> 'confirmado'), 'rechazar' (-> 'rechazado'), y 'cancelar' (-> 'cancelado').
   - Desde 'confirmado': se permite 'marcarListo' (-> 'listo_para_retirar').
   - Desde 'listo_para_retirar': se permite 'entregar' (-> 'entregado').

2. **Acciones no permitidas**:
   - Ninguna otra combinación de estado+acción es válida.
   - Ejemplos: 
     - Confirmar desde 'confirmado' o 'listo_para_retirar'
     - Cancelar desde cualquier estado que no sea 'pendiente'
     - Entregar desde estados que no sean 'listo_para_retirar'

### Firmas de funciones/clases TypeScript
```ts
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

function transicionPermitida(
  estadoActual: EstadoPedido,
  accion: AccionPedido
): boolean;
```

### Casos de error a contemplar
No hay casos de error específicos para esta función, ya que es pura y solo valida combinaciones lógicas. Los únicos parámetros son el estado actual y la acción a intentar.

### Casos de prueba esperados
1. **Transición válida desde 'pendiente'**:
   - Entrada: estadoActual = 'pendiente', accion = 'confirmar'
   - Resultado esperado: true

2. **Transición válida desde 'pendiente'**:
   - Entrada: estadoActual = 'pendiente', accion = 'rechazar'
   - Resultado esperado: true

3. **Transición válida desde 'pendiente'**:
   - Entrada: estadoActual = 'pendiente', accion = 'cancelar'
   - Resultado esperado: true

4. **Transición válida desde 'confirmado'**:
   - Entrada: estadoActual = 'confirmado', accion = 'marcarListo'
   - Resultado esperado: true

5. **Transición válida desde 'listo_para_retirar'**:
   - Entrada: estadoActual = 'listo_para_retirar', accion = 'entregar'
   - Resultado esperado: true

6. **Transición inválida desde 'pendiente'**:
   - Entrada: estadoActual = 'pendiente', accion = 'entregar'
   - Resultado esperado: false

7. **Transición inválida desde 'confirmado'**:
   - Entrada: estadoActual = 'confirmado', accion = 'confirmar'
   - Resultado esperado: false

8. **Transición inválida desde 'listo_para_retirar'**:
   - Entrada: estadoActual = 'listo_para_retirar', accion = 'rechazar'
   - Resultado esperado: false

9. **Combinación estado-acción no permitida**:
   - Entrada: estadoActual = 'cancelado', accion = 'confirmar'
   - Resultado esperado: false

10. **Transición inválida en estado final**:
    - Entrada: estadoActual = 'entregado', accion = 'cancelar'
    - Resultado esperado: false
```