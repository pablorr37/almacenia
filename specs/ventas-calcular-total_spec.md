
```markdown
## Requisitos funcionales

El módulo `ventas-calcular-total` implementa una función pura para calcular el total de una venta a partir de sus items. Cada item tiene una cantidad y un precio unitario. La función suma el valor de cada item (cantidad × precio unitario) y debe lanzar un error si algún item tiene una cantidad menor o igual a cero. Esta función es utilizada para calcular el `total` de una venta antes de guardarlo en la base de datos, asegurando que los datos son consistentes.

## Firmas de funciones/clases (TypeScript)

### Función: `calcularTotalItems`

**Firma:**
```typescript
function calcularTotalItems(
  items: Array<{ 
    cantidad: number; 
    precioUnitario: number; 
  }>
): number;
```

**Parámetros:**
- `items`: Array de objetos con propiedades `cantidad` y `precioUnitario` (ambos números).

**Retorno:**
- `number`: Total calculado como la suma de `cantidad * precioUnitario` de todos los items.

## Casos de error a contemplar

1. **Cantidad no válida**: Si algún item tiene `cantidad <= 0`.
2. **Parámetros no numéricos**: Si algún item tiene `cantidad` o `precioUnitario` no numéricos.
3. **Propiedades faltantes en items**: Si algún objeto en el array no tiene las propiedades `cantidad` o `precioUnitario`.

## Casos de prueba esperados

1. **Caso básico con valores positivos**:
   - Entrada: `[ {cantidad: 2, precioUnitario: 5}, {cantidad: 3, precioUnitario: 4} ]`
   - Salida esperada: `23` (2×5 + 3×4)
   - Explicación: Suma correcta de los valores de los items.

2. **Item con cantidad cero**:
   - Entrada: `[ {cantidad: 0, precioUnitario: 10}, {cantidad: 1, precioUnitario: 5} ]`
   - Salida esperada: Error con mensaje "Cantidad no válida"
   - Explicación: Cantidad debe ser mayor que cero.

3. **Item con cantidad negativa**:
   - Entrada: `[ {cantidad: -1, precioUnitario: 10}, {cantidad: 1, precioUnitario: 5} ]`
   - Salida esperada: Error con mensaje "Cantidad no válida"
   - Explicación: Cantidad no puede ser negativa.

4. **Entrada vacía**:
   - Entrada: `[]`
   - Salida esperada: Error con mensaje "No hay items"
   - Explicación: El array no puede estar vacío.

5. **Parámetros no numéricos**:
   - Entrada: `[ {cantidad: "2", precioUnitario: 5}, {cantidad: 3, precioUnitario: 4} ]`
   - Salida esperada: Error con mensaje "Parámetros no numéricos"
   - Explicación: Validación de tipos en los parámetros.

6. **Item con propiedades faltantes**:
   - Entrada: `[ {precioUnitario: 5} ]`
   - Salida esperada: Error con mensaje "Propiedades faltantes en items"
   - Explicación: Todos los items deben tener las propiedades requeridas.

7. **Item con precio no numérico**:
   - Entrada: `[ {cantidad: 2, precioUnitario: "5"}, {cantidad: 3, precioUnitario: 4} ]`
   - Salida esperada: Error con mensaje "Parámetros no numéricos"
   - Explicación: Validación de tipos en propiedades.

8. **Todos los items tienen el mismo precio**:
   - Entrada: `[ {cantidad: 1, precioUnitario: 10}, {cantidad: 2, precioUnitario: 10}, {cantidad: 3, precioUnitario: 10} ]`
   - Salida esperada: `60`
   - Explicación: Suma correcta independientemente del mismo precio.

## Consideraciones técnicas

- **Función pura**: La implementación debe ser una función pura, sin efectos laterales, que solo recibe un array y retorna un número.
- **Validación de datos**: La función debe validar que todas las propiedades sean numéricas y que las cantidades sean mayores que cero.
- **Manejo de errores**: En caso de encontrar un item inválido, lanzar una excepción de tipo `Error` con un mensaje descriptivo.
```