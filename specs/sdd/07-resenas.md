# Módulo: reseñas (resenas)

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`03-productos.md`](03-productos.md), [`02-tiendas.md`](02-tiendas.md) y
[`04-pedidos.md`](04-pedidos.md).

## Modelo de datos

```sql
CREATE TABLE resenas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id  UUID NOT NULL REFERENCES usuarios(id),
  tienda_id     UUID NOT NULL REFERENCES tiendas(id),
  producto_id   UUID REFERENCES productos(id),
  puntuacion    SMALLINT NOT NULL,
  comentario    TEXT,
  creada_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT puntuacion_valida CHECK (puntuacion BETWEEN 1 AND 5),
  CONSTRAINT resenas_comprador_producto_key UNIQUE (comprador_id, producto_id)
);

CREATE INDEX resenas_tienda_id_idx ON resenas (tienda_id);
CREATE INDEX resenas_producto_id_idx ON resenas (producto_id);
```

- `productoId` es nullable: una reseña puede ser de un producto puntual o, si viene
  `null`, una reseña general de la tienda. `tiendaId` siempre está presente (incluso
  reseñando un producto, para no tener que resolverlo por join al listar reseñas de
  una tienda).
- El rating agregado de un producto o tienda (usado para `sort=rating` en
  `03-productos.md`) se calcula con `AVG(puntuacion)` filtrando por `producto_id`
  o `tienda_id` — no se guarda como columna en `Producto`/`Tienda`.
- La constraint única `(comprador_id, producto_id)` limita a una reseña por
  comprador por producto. Reseñas generales de tienda (`producto_id IS NULL`) no
  quedan cubiertas por esa constraint de Postgres (NULL no colisiona) — la regla
  "una reseña general por comprador por tienda" se valida en la capa de aplicación.

## Reglas de negocio

- Solo puede reseñar un producto/tienda un comprador que tenga al menos una
  `Venta` (`05-ventas.md`) asociada a esa tienda (compra confirmada, no importa el
  `origen`) — no se permite reseñar sin haber comprado nunca ahí.
  `RESENA_SIN_COMPRA_PREVIA` si no se cumple.
  Reseñar un producto puntual además requiere que ese producto haya estado en
  algún `ItemVenta` de una compra del comprador en esa tienda.
- `puntuacion` es un entero de 1 a 5.
- Un comprador no puede reseñar dos veces el mismo producto (constraint de DB). Para
  reseña general de tienda, la función de servicio valida la duplicación antes de
  insertar.

## Endpoints REST

### `POST /api/resenas`

Requiere sesión válida (`esComprador`).

Request: `{ tiendaId: string; productoId?: string; puntuacion: number; comentario?: string }`

Response `201`: `{ data: Resena }`.

### `GET /api/tiendas/:tiendaId/resenas`

Público. Paginado (ver `00-overview.md`). Query opcional `?productoId=<id>` para
filtrar reseñas de un producto puntual.

Response `200`: `{ data: Resena[]; page; pageSize; total }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/resenas/`.

```ts
interface Resena {
  id: string;
  compradorId: string;
  tiendaId: string;
  productoId: string | null;
  puntuacion: number;
  comentario: string | null;
  creadaEn: string;
}

interface CrearResenaInput {
  tiendaId: string;
  productoId?: string;
  puntuacion: number;
  comentario?: string;
}

async function crearResena(comprador: Usuario, input: CrearResenaInput): Promise<Resena>;

interface ListarResenasInput {
  tiendaId: string;
  productoId?: string;
  page?: number;
  pageSize?: number;
}

async function listarResenas(
  input: ListarResenasInput
): Promise<{ data: Resena[]; page: number; pageSize: number; total: number }>;

// Usada por 03-productos.md para sort=rating. Devuelve null si no hay reseñas.
async function ratingPromedioProducto(productoId: string): Promise<number | null>;
```

## Casos de error a contemplar

| Código                       | Cuándo                                                            |
| ------------------------------ | -------------------------------------------------------------------|
| `PUNTUACION_INVALIDA`          | `puntuacion` no es un entero entre 1 y 5.                        |
| `RESENA_SIN_COMPRA_PREVIA`     | El comprador no tiene ninguna `Venta` en esa tienda (o ese producto). |
| `RESENA_DUPLICADA`             | Ya existe una reseña del mismo comprador para ese producto/tienda. |
| `TIENDA_NO_ENCONTRADA`         | `tiendaId` no existe.                                              |
| `PRODUCTO_NO_ENCONTRADO`       | `productoId` no existe o no pertenece a `tiendaId`.                |
