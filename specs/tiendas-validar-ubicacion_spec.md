
```markdown
## Módulo: tiendas-validar-ubicacion

### Requisitos Funcionales

El módulo `tiendas-validar-ubicacion` implementa una función que valida una ubicación geográfica (latitud y longitud). La función debe verificar que ambos valores sean números y estén dentro de rangos válidos, lanzando un error si no es así.

### Firmas de Funciones (TypeScript)

#### Función: `validarUbicacion`

**Firma:**
```typescript
function validarUbicacion(lat: number, lon: number): void;
```

**Parámetros:**
- `lat`: Latitud del punto en grados (número)
- `lon`: Longitud del punto en grados (número)

### Casos de Uso

1. **Validación básica**: Verificar que los parámetros sean números y dentro de rangos válidos.

### Casos de Error

1. **Valores no numéricos**: Si `lat` o `lon` no son de tipo `number` (ej. `NaN`, string, etc.), lanzar un `Error` con mensaje "Parámetros no numéricos".
2. **Rango de latitud inválido**: Si `lat` está fuera de [-90, 90], lanzar un `Error` con mensaje "Latitud fuera de rango".
3. **Rango de longitud inválido**: Si `lon` está fuera de [-180, 180], lanzar un `Error` con mensaje "Longitud fuera de rango".

### Casos de Prueba Esperados

1. **Ubicación válida**:
   - Entrada: `validarUbicacion(0, 0)`
   - Salida esperada: No lanza error.

2. **Ubicación válida en extremos**:
   - Entrada: `validarUbicacion(90, 180)`
   - Salida esperada: No lanza error.

3. **Latitud no numérica**:
   - Entrada: `validarUbicacion("0", 0)`
   - Salida esperada: Lanza `Error` con mensaje "Parámetros no numéricos"

4. **Longitud no numérica**:
   - Entrada: `validarUbicacion(0, "0")`
   - Salida esperada: Lanza `Error` con mensaje "Parámetros no numéricos"

5. **Latitud fuera de rango (demasiado alta)**:
   - Entrada: `validarUbicacion(91, 0)`
   - Salida esperada: Lanza `Error` con mensaje "Latitud fuera de rango"

6. **Latitud fuera de rango (demasiado baja)**:
   - Entrada: `validarUbicacion(-91, 0)`
   - Salida esperada: Lanza `Error` con mensaje "Latitud fuera de rango"

7. **Longitud fuera de rango (demasiado alta)**:
   - Entrada: `validarUbicacion(0, 181)`
   - Salida esperada: Lanza `Error` con mensaje "Longitud fuera de rango"

8. **Longitud fuera de rango (demásado baja)**:
   - Entrada: `validarUbicacion(0, -181)`
   - Salida esperada: Lanza `Error` con mensaje "Longitud fuera de rango"
```

### Consideraciones Técnicas

- **Validación de tipos**: La función debe verificar que `lat` y `lon` sean de tipo `number` y no `NaN`.
- **Rangos**: 
  - `lat` debe estar en [-90, 90]
  - `lon` debe estar en [-180, 180]
- **Mensaje de error**: En todos los casos de error, lanzar un `Error` con el mensaje:
  - "Parámetros no numéricos": Si alguno de los valores no es un número.
  - "Latitud fuera de rango": Si `lat` no está en [-90, 90].
  - "Longitud fuera de rango": Si `lon` no está en [-180, 180].

### Ejemplos de implementación esperados

```typescript
function validarUbicacion(lat: number, lon: number): void {
  // Verificar que lat y lon sean números y no NaN
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
    throw new Error('Parámetros no numéricos');
  }

  // Verificar rango de latitud
  if (lat < -90 || lat > 90) {
    throw new Error('Latitud fuera de rango');
  }

  // Verificar rango de longitud
  if (lon < -180 || lon > 180) {
    throw new Error('Longitud fuera de rango');
  }
}
```