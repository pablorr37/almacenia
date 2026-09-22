
```markdown
## Requisitos Funcionales

El módulo `tiendas-distancia` implementa dos funciones principales:

1. **`calcularDistanciaKm`**: Calcula la distancia en kilómetros entre dos coordenadas geográficas usando la fórmula de Haversine.
2. **`ordenarTiendasPorDistancia`**: Ordena un array de tiendas por su cercanía a un punto de referencia usando la función anterior.

## Firmas de Funciones (TypeScript)

### Función: `calcularDistanciaKm`

**Firma:**
```typescript
function calcularDistanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number;
```

**Parámetros:**
- `lat1`: Latitud del primer punto en grados (número).
- `lon1`: Longitud del primer punto en grados (número).
- `lat2`: Latitud del segundo punto en grados (número).
- `lon2`: Longitud del segundo punto en grados (número).

**Retorno:**
- `number`: Distancia en kilómetros entre los dos puntos.

### Función: `ordenarTiendasPorDistancia`

**Firma:**
```typescript
function ordenarTiendasPorDistancia(
  tiendas: Array<{ lat: number; lon: number }>,
  lat: number,
  lon: number
): Array<{ lat: number; lon: number }>;
```

**Parámetros:**
- `tiendas`: Array de objetos con propiedades `lat` y `lon` (números).
- `lat`: Latitud de referencia (número).
- `lon`: Longitud de referencia (número).

**Retorno:**
- `Array<{ lat: number; lon: number }>`: Array ordenado de tiendas.

## Casos de Error a Contemplar

1. **Valores no numéricos**: 
   - Si algún parámetro no es un número en `calcularDistanciaKm`.
   - Si las propiedades `lat` o `lon` de un objeto de tienda no son numéricas en `ordenarTiendasPorDistancia`.

2. **Rango de coordenadas inválido**:
   - Latitudes no en [-90, 90].
   - Longitudes no en [-180, 180].

3. **Propiedades faltantes en objetos de tienda**:
   - Si algún objeto en el array de tiendas no tiene `lat` o `lon` definidas.

## Casos de Prueba Esperados

1. **Caso básico**:
   - Entrada: `calcularDistanciaKm(0, 0, 0, 0)`
   - Salida esperada: `0`
   - Explicación: Mismo punto de origen y destino.

2. **Distancia máxima**:
   - Entrada: `calcularDistanciaKm(-90, -180, 90, 180)`
   - Salida esperada: ~12742 km (diámetro de la Tierra)
   - Explicación: Puntos antipodales.

3. **Ordenamiento básico**:
   - Entrada: `ordenarTiendasPorDistancia([{lat: 0, lon: 0}, {lat: 1, lon: 1}], 0, 0)`
   - Salida esperada: `[{lat: 0, lon: 0}, {lat: 1, lon: 1}]`
   - Explicación: Primera tienda más cercana.

4. **Manutención de distancias iguales**:
   - Entrada: `ordenarTiendasPorDistancia([{lat: 0, lon: 0}, {lat: 0, lon: 1}], 0, 0)`
   - Salida esperada: Array ordenado con la tienda más cercana primero.
   - Explicación: Distancia creciente al moverse la tienda.

5. **Error de validación**:
   - Entrada: `calcularDistanciaKm("0", 0, 0, 0)`
   - Salida esperada: `Error` con mensaje "Parámetros inválidos".

6. **Rango de latitud inválido**:
   - Entrada: `calcularDistanciaKm(91, 0, 0, 0)`
   - Salida esperada: `Error` con mensaje "Latitud fuera de rango".

7. **Rango de longitud inválido**:
   - Entrada: `calcularDistanciaKm(0, 181, 0, 0, 0)`
   - Salida esperada: `Error` con mensaje "Longitud fuera de rango".

8. **Propiedades faltantes en tiendas**:
   - Entrada: `ordenarTiendasPorDistancia([{lat: 0}], 0, 0)`
   - Salida esperada: `Error` indicando que faltan propiedades.

## Consideraciones Técnicas

### Validación de Parámetros
- **`calcularDistanciaKm`**: 
  - Verificar que `lat1`, `lon1`, `lat2`, `lon2` sean números.
  - Comprobar que las latitudes estén en [-90, 90] y las longitudes en [-180, 180].
- **`ordenarTiendasPorDistancia`**:
  - Validar que `lat` y `lon` sean números y dentro de los rangos.
  - Iterar sobre el array de tiendas y validar que cada objeto tenga `lat` y `lon` como propiedades numéricas.

### Implementación de la Fórmula de Haversine
- **Fórmula**:
  ```typescript
  const R = 6371; // Radio de la Tierra en km
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ/2) ** 2 + 
             Math.cos(φ1) * Math.cos(φ2) * 
             Math.sin(Δλ/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distancia = R * c;
  ```
- **Pasos**:
  1. Convertir grados a radianes.
  2. Calcular diferencias en radianes.
  3. Aplicar la fórmula de Haversine.
  4. Devolver la distancia en kilómetros.

### Manejo de Errores
- En ambos casos, si los parámetros no son válidos, lanzar un `Error` con un mensaje claro:
  - "Parámetros inválidos"
  - "Latitud fuera de rango"
  - "Longitud fuera de rango"
  - "Propiedades faltantes en tiendas"

### Ordenación
- **Algoritmo**: `Array.sort` con comparador personalizado usando `calcularDistanciaKm`.
- **Estabilidad**: Mantener el orden original para tiendas con igual distancia (usar `sort` con comparador estable).

## Ejemplos de Uso

```typescript
// Caso básico: misma coordenada
console.log(calcularDistanciaKm(0, 0, 0, 0)); // 0

// Distancia entre dos puntos antipodales
console.log(calcularDistanciaKm(-90, -180, 90, 180)); // ~12742 km

// Ordenar tiendas por cercanía
const tiendas = [
  { lat: 0, lon: 0 },
  { lat: 1, lon: 1 },
  { lat: 2, lon: 2 }
];
console.log(ordenarTiendasPorDistancia(tiendas, 0, 0));
// Salida esperada: [{lat: 0, lon: 0}, {lat: 1, lon: 1}, {lat: 2, lon: 2}]

// Validación de coordenadas
try {
  calcularDistanciaKm(91, 0, 0, 0);
} catch (error) {
  console.log(error.message); // "Latitud fuera de rango"
}

// Validación de objetos de tienda
try {
  ordenarTiendasPorDistancia([{lat: 0}], 0, 0);
} catch (error) {
  console.log(error.message); // "Propiedades faltantes en tiendas"
}
```