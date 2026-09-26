# Módulo: valoraciones de clientes

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`02-tiendas.md`](02-tiendas.md) y [`05-ventas.md`](05-ventas.md). Es el espejo de
[`07-resenas.md`](07-resenas.md): allí el comprador valora a la tienda; acá **el
dueño de la tienda valora al cliente**.

## Modelo de datos

```sql
CREATE TABLE valoraciones_clientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tienda_id       UUID NOT NULL REFERENCES tiendas(id),
  comprador_id    UUID NOT NULL REFERENCES usuarios(id),
  puntuacion      SMALLINT NOT NULL,
  comentario      TEXT,
  creada_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valoracion_cliente_puntuacion_valida CHECK (puntuacion BETWEEN 1 AND 5),
  CONSTRAINT valoraciones_clientes_tienda_comprador_key UNIQUE (tienda_id, comprador_id)
);

CREATE INDEX valoraciones_clientes_comprador_id_idx ON valoraciones_clientes (comprador_id);
```

## Reglas de negocio

- Solo el dueño de la tienda (`tienda.vendedorId === usuario.id`) valora a clientes
  **en nombre de su tienda**.
- Solo puede valorar a un comprador que tenga al menos una `Venta` en su tienda
  (`compradorId` = ese comprador, cualquier `origen`) —
  `VALORACION_SIN_VENTA_PREVIA` si no.
- Una valoración por par (tienda, comprador). Volver a valorar **reemplaza** la
  anterior (upsert: actualiza `puntuacion`, `comentario` y `actualizadaEn`).
- Una tienda no puede valorar a su propio dueño.
- **Visibilidad**: la valoración es información para vendedores.
  - Cualquier usuario con `esVendedor` ve el **resumen** de un cliente (promedio,
    cantidad de valoraciones) y, de su propia tienda, la valoración completa con
    comentario. Nunca ve los comentarios que dejaron otras tiendas.
  - El comprador ve **solo su propio resumen** (promedio y cantidad), sin
    comentarios ni qué tienda puntuó qué.
  - No es pública.

## Endpoints REST

### `PUT /api/clientes/:compradorId/valoracion`

Requiere sesión con `esVendedor` y tienda propia. Request:
`{ puntuacion: number; comentario?: string }`. Response `200`:
`{ data: ValoracionCliente }`.

### `GET /api/clientes/:compradorId/valoracion`

Requiere sesión con `esVendedor`. Response `200`:
`{ data: { promedio: number | null; cantidad: number; miValoracion: ValoracionCliente | null } }`
(`miValoracion` es la de la tienda del vendedor autenticado, si existe).

### `GET /api/auth/perfil/valoracion`

Requiere sesión. Response `200`: `{ data: { promedio: number | null; cantidad: number } }`
(las valoraciones recibidas por el usuario autenticado como cliente).

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/valoraciones-clientes/`.

```ts
interface ValoracionCliente {
  id: string;
  tiendaId: string;
  compradorId: string;
  puntuacion: number;
  comentario: string | null;
  creadaEn: string;
  actualizadaEn: string;
}

interface ValorarClienteInput {
  puntuacion: number;
  comentario?: string;
}

async function valorarCliente(
  vendedor: Usuario,
  compradorId: string,
  input: ValorarClienteInput
): Promise<ValoracionCliente>;

interface ResumenCliente {
  promedio: number | null; // redondeado a 1 decimal
  cantidad: number;
}

async function resumenCliente(
  vendedor: Usuario,
  compradorId: string
): Promise<ResumenCliente & { miValoracion: ValoracionCliente | null }>;

// Varios clientes a la vez (para la lista de pedidos del vendedor).
async function resumenesClientes(
  vendedor: Usuario,
  compradorIds: string[]
): Promise<Record<string, ResumenCliente>>;

async function miResumenComoCliente(comprador: Usuario): Promise<ResumenCliente>;
```

## Casos de error a contemplar

| Código                          | Cuándo                                                        |
| -------------------------------- | ---------------------------------------------------------------|
| `PUNTUACION_INVALIDA`            | `puntuacion` no es un entero entre 1 y 5.                    |
| `FORBIDDEN`                      | El usuario no es vendedor o no tiene tienda (`403`).          |
| `VALORACION_SIN_VENTA_PREVIA`    | El comprador no tiene ninguna `Venta` en la tienda (`409`).   |
| `VALORACION_PROPIA`              | El vendedor intenta valorarse a sí mismo (`409`).            |
| `USUARIO_NO_ENCONTRADO`          | `compradorId` no existe (`404`).                              |
