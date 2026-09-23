
```markdown
## Requisitos funcionales

El módulo `overview-normalizar-paginacion` implementa una función pura `normalizarPaginacion` para normalizar los parámetros de paginación recibidos en los endpoints. La función debe manejar los siguientes casos:

- Si `page` no se pasa o es inválido (no numérico, menor a 1, o punto flotante), establecer `page = 1`.
- Si `pageSize` no se pasa o es inválido (no numérico, menor a 1, o mayor a 100), establecer `pageSize = 20`.
- Esta función será usada por todos los endpoints de listado paginados en la API.

## Firmas de funciones/clases (TypeScript)

### Función: `normalizarPaginacion`

**Firma:**
```typescript
interface NormalizarPaginacionInput {
  page?: number;
  pageSize?: number;
}

function normalizarPaginacion(input: NormalizarPaginacionInput): { page: number; pageSize: number };
```

**Parámetros:**
- `input`: Objeto con propiedades `page` y `pageSize` opcionales.

**Retorno:**
- `{ page: number; pageSize: number }`: Objeto con los valores normalizados.

## Casos de error a contemplar

1. **PAGINACION_PARAMETROS_INVALIDOS**: Cuando `page` o `pageSize` no son numéricos o son menores a 1.
2. **PAGINACION_PAGE_TUPLA**: Cuando `page` es un número de punto flotante (ej. 2.5) en lugar de entero.
3. **PAGINACION_PAGE_NEGATIVA**: Cuando `page` es un número negativo.
4. **PAGINACION_PAGE_CERO**: Cuando `page` es igual a cero.
5. **PAGINACION_PAGE_NO_ENTERA**: Cuando `page` no es un número entero.

## Casos de prueba esperados

#### Éxito
1. **Entrada válida:** `{ page: 2, pageSize: 25 }`
   - **Salida esperada:** `{ page: 2, pageSize: 25 }`

2. **Entrada con valores por defecto:** `{ }` o `{ page: undefined, pageSize: undefined }`
   - **Salida esperada:** `{ page: 1, pageSize: 20 }`

3. **Entrada con `pageSize` > 100:** `{ pageSize: 150 }`
   - **Salida esperada:** `{ pageSize: 100 }`

4. **Entrada con `page` y `pageSize` fuera de rangos:** `{ page: 100, pageSize: 0 }`
   - **Salida esperada:** `{ page: 1, pageSize: 20 }`

#### Errores
5. **Caso de error `page` no numérico:** `{ page: 'abc', pageSize: 10 }`
   - **Mensaje:** `'page' debe ser un número entero mayor o igual a 1.`
   - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

6. **Caso de error `page` < 1:** `{ page: 0, pageSize: 10 }`
   - **Mensaje:** `'page' debe ser un número entero mayor o igual a 1.`
   - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

7. **Caso de error `page` es flotante:** `{ page: 2.5, pageSize: 10 }`
   - **Mensaje:** `'page' debe ser un número entero.`
   - **Código:** `'PAGINACION_PAGE_TUPLA'`

8. **Caso de error `pageSize` no numérico:** `{ pageSize: 'abc', page: 1 }`
   - **Mensaje:** `'pageSize' debe ser un número entero mayor o igual a 1 y menor o igual a 100.`
   - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

9. **Caso de error `pageSize` < 1:** `{ pageSize: 0, page: 1 }`
   - **Mensaje:** `'pageSize' debe ser un número entero mayor o igual a 1 y menor o igual a 100.`
   - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

10. **Caso de error `pageSize` > 100:** `{ pageSize: 101, page: 1 }`
    - **Mensaje:** `'pageSize' debe ser un número entero mayor o igual a 1 y menor o igual a 100.`
    - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

11. **Caso de error `page` no entero:** `{ page: "2", pageSize: 10 }`
    - **Mensaje:** `'page' debe ser un número entero mayor o igual a 1.`
    - **Código:** `'PAGINACION_PAGE_TUPLA'`

12. **Caso de error `page` negativo:** `{ page: -1, pageSize: 10 }`
    - **Mensaje:** `'page' debe ser un número entero mayor o igual a 1.`
    - **Código:** `'PAGINACION_PAGE_TUPLA'`

13. **Caso de error `page` cero:** `{ page: 0, pageSize: 10 }`
    - **Mensaje:** `'page' debe ser un número entero mayor o igual a 1.`
    - **Código:** `'PAGINACION_PAGE_TUPLA'`

14. **Caso de error `pageSize` no entero:** `{ pageSize: 25.5, page: 1 }`
    - **Mensaje:** `'pageSize' debe ser un número entero mayor o igual a 1 y menor o igual a 100.`
    - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

15. **Caso de error `pageSize` mayor a 100:** `{ pageSize: 101, page: 1 }`
    - **Mensaje:** `'pageSize' debe ser un número entero mayor o igual a 1 y menor o igual a 100.`
    - **Código:** `'PAGINACION_PARAMETROS_INVALIDOS'`

16. **Caso de error `page` es flotante en un string:** `{ page: "2.5", pageSize: 10 }`
    - **Mensaje:** `'page' debe ser un número entero mayor o igual a 1.`
    - **Código:** `'PAGINACION_PAGE_TUPLA'`
```