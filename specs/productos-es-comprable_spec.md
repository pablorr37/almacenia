
```markdown
## Especificación Técnica: Módulo `productos-es-comprable`

### Requisitos Funcionales

Implementar la función pura `esComprable` que determina si un producto es comprable según la regla definida en la especificación del módulo `productos`. 
La regla es: un producto es comprable si `disponible` es `true` y `stock` es mayor que 0.

### Firmas de Funciones

```typescript
interface Producto {
  id: string;
  tiendaId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  disponible: boolean;
}

function esComprable(producto: Producto): boolean;
```

### Casos de Uso

1. **Determinar comprabilidad de un producto**:
   - **Entrada**: Un objeto `Producto`.
   - **Salida**: `true` si el producto es comprable (`disponible=true` y `stock>0`), `false` en caso contrario.

### Casos de Error a Contemplar

- **Entrada inválida**: La función recibe un objeto que no cumple con la interfaz `Producto`.
- **Tipo de datos incorrectos**: 
  - `disponible` no es un booleano.
  - `stock` no es un número.
- **Valores fuera de rango**:
  - `disponible` no es `true` ni `false`.
  - `stock` es negativo o no es un número.

### Casos de Prueba Esperados

1. **Producto comprable (disponible y stock positivo)**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: 5, disponible: true }`
   - Salida esperada: `true`
   - Explicación: El producto cumple con los requisitos.

2. **Producto no comprable (disponible pero stock 0)**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: 0, disponible: true }`
   - Salida esperada: `false`
   - Explicación: No cumple `stock>0`.

3. **Producto no comprable (no disponible)**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: 5, disponible: false }`
   - Salida esperada: `false`
   - Explicación: No cumple `disponible=true`.

4. **Producto con datos de tipo incorrecto**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: '5', disponible: true }`
   - Salida esperada: `false`
   - Explicación: `stock` es string en lugar de número.

5. **Producto con `disponible` como string**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: 5, disponible: 'true' }`
   - Salida esperada: `false`
   - Explicación: `disponible` no es booleano.

6. **Producto con `stock` negativo**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: -1, disponible: true }`
   - Salida esperada: `false`
   - Explicación: `stock` es negativo.

7. **Producto con `disponible` fuera de rango (no boolean)**:
   - Entrada: `{ id: '1', tiendaId: '2', nombre: 'Lechuga', descripcion: null, precio: 2.5, stock: 5, disponible: 1 }`
   - Salida esperada: `false`
   - Explicación: `disponible` no es booleano.

### Consideraciones Técnicas

- **Validación de entrada**: La función debe verificar que el objeto recibido tenga los campos `disponible` (booleano) y `stock` (número). 
  Si no, se considera que el producto no es comprable y se retorna `false`.
- **Función pura**: No realiza operaciones externas (como acceso a base de datos) y solo depende de los datos de entrada.
- **Manejo de errores**: Si la entrada no es válida (falta algún campo o tipo de dato incorrecto), la función debe retornar `false`.

### Ejemplos de implementación

Ejemplo de uso de la función:

```typescript
const producto1: Producto = { 
  id: '1', 
  tiendaId: '2', 
  nombre: 'Lechuga', 
  descripcion: null, 
  precio: 2.5, 
  stock: 5, 
  disponible: true 
};
console.log(esComprable(producto1)); // true

const producto2: Producto = { 
  id: '1', 
  tiendaId: '2', 
  nombre: 'Lechuga', 
  descripcion: null, 
  precio: 2.5, 
  stock: 0, 
  disponible: true 
};
console.log(esComprable(producto2)); // false

const producto3: Producto = { 
  id: '1', 
  tiendaId: '2', 
  nombre: 'Lechuga', 
  descripcion: null, 
  precio: 2.5, 
  stock: 5, 
  disponible: false 
};
console.log(esComprable(producto3)); // false
```

### Notas importantes

- Esta función es utilizada internamente por otros módulos (como `ventas`) para validar la comprabilidad de productos antes de realizar transacciones.
- La función es parte de las especificaciones del módulo `productos` y no debe ser confundida con los endpoints REST del mismo módulo.
```