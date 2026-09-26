# Módulo: listas de compras

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md) y [`06-catalogo.md`](06-catalogo.md). Es la entrada de
[`15-itinerario.md`](15-itinerario.md) ("Buscar y comparar").

El comprador arma listas de productos **sin entrar a una tienda en particular**
(hasta ahora solo podía elegir productos dentro de una tienda). Los productos salen
del catálogo compartido (`productos_catalogo`), que se alimenta de lo que cargan
todas las tiendas.

## Modelo de datos

```sql
CREATE TABLE listas_compras (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id    UUID NOT NULL REFERENCES usuarios(id),
  nombre          TEXT NOT NULL,
  creada_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX listas_compras_comprador_id_idx ON listas_compras (comprador_id);

CREATE TABLE items_lista_compras (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id     UUID NOT NULL REFERENCES listas_compras(id) ON DELETE CASCADE,
  catalogo_id  UUID NOT NULL REFERENCES productos_catalogo(id),
  cantidad     INTEGER NOT NULL,
  CONSTRAINT item_lista_cantidad_positiva CHECK (cantidad > 0),
  CONSTRAINT items_lista_compras_lista_catalogo_key UNIQUE (lista_id, catalogo_id)
);
```

- **Genérico vs marca**: hoy la base no distingue "Gaseosa" de "Coca-Cola 1,5 L" —
  cada ítem apunta a una entrada concreta del catálogo y la comparación es por esa
  entrada. La distinción genérico/marca es la fase 3 de `15-itinerario.md`: se
  agregará un `ProductoGenerico` al que apuntan varias entradas de catálogo, y un
  ítem de lista podrá apuntar a un genérico ("cualquier gaseosa cola 1,5 L") o a una
  marca concreta. El modelo actual no se rompe: `catalogo_id` pasará a ser opcional
  junto a un `generico_id` opcional.

## Reglas de negocio

- Cualquier usuario autenticado puede tener listas (son del comprador que las crea).
  No hay límite de cantidad de listas.
- Solo el dueño de una lista puede verla, editarla, borrarla o compararla —
  `LISTA_NO_ENCONTRADA` (404) para cualquier otro usuario, para no revelar que existe.
- `nombre`: obligatorio, 1–80 caracteres (trim). Si la UI no pide nombre, usa
  "Mi lista" + fecha.
- Ítems: cada `catalogoId` debe existir; `cantidad` entero ≥ 1; sin `catalogoId`
  repetidos en la misma lista (si vienen repetidos en el request, se suman las
  cantidades). Máximo 100 ítems por lista.
- Actualizar ítems **reemplaza** la lista completa de ítems (como `horarios` en
  `02-tiendas.md`).
- Borrar una lista es borrado físico (no tiene historial asociado).
- **Guardar** (UI) = `POST`/`PATCH`. **Buscar y comparar** (UI) = guarda y llama a
  `POST /api/listas/:id/comparar` (`15-itinerario.md`). También se puede comparar sin
  guardar con `POST /api/itinerario/comparar`.

## Endpoints REST

### `GET /api/listas`

Requiere sesión. Paginado. Response `200`:
`{ data: ResumenLista[]; page; pageSize; total }`, orden `actualizadaEn desc`.

### `POST /api/listas`

Request: `{ nombre: string; items: Array<{ catalogoId: string; cantidad: number }> }`.
Response `201`: `{ data: ListaCompras }`.

### `GET /api/listas/:id`

Response `200`: `{ data: ListaCompras }`.

### `PATCH /api/listas/:id`

Request: `{ nombre?: string; items?: Array<{ catalogoId: string; cantidad: number }> }`.
Response `200`: `{ data: ListaCompras }`.

### `DELETE /api/listas/:id`

Response `200`: `{ data: { id: string } }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/listas/`.

```ts
interface ItemListaCompras {
  id: string;
  catalogoId: string;
  cantidad: number;
  producto: { nombre: string; marca: string | null; imagenUrl: string | null; categoria: Categoria | null };
}

interface ListaCompras {
  id: string;
  compradorId: string;
  nombre: string;
  items: ItemListaCompras[];
  creadaEn: string;
  actualizadaEn: string;
}

interface ResumenLista {
  id: string;
  nombre: string;
  cantidadItems: number;
  actualizadaEn: string;
}

interface ItemListaInput { catalogoId: string; cantidad: number }

async function crearLista(comprador: Usuario, input: { nombre: string; items: ItemListaInput[] }): Promise<ListaCompras>;
async function listarListas(comprador: Usuario, paginacion: { page?: number; pageSize?: number }): Promise<{ data: ResumenLista[]; page: number; pageSize: number; total: number }>;
async function obtenerLista(comprador: Usuario, listaId: string): Promise<ListaCompras>;
async function actualizarLista(comprador: Usuario, listaId: string, input: { nombre?: string; items?: ItemListaInput[] }): Promise<ListaCompras>;
async function eliminarLista(comprador: Usuario, listaId: string): Promise<{ id: string }>;

// Pura: valida y normaliza (suma repetidos). Lanza AppError.
function normalizarItems(items: unknown): ItemListaInput[];
```

## Casos de error a contemplar

| Código                     | Cuándo                                                      |
| --------------------------- | -------------------------------------------------------------|
| `NOMBRE_LISTA_INVALIDO`     | `nombre` vacío o de más de 80 caracteres.                   |
| `ITEMS_LISTA_INVALIDOS`     | `items` no es un array, `cantidad` no es entero ≥ 1, falta `catalogoId`, o más de 100 ítems. |
| `CATALOGO_NO_ENCONTRADO`    | Algún `catalogoId` no existe (`404`).                        |
| `LISTA_NO_ENCONTRADA`       | La lista no existe o no es del usuario (`404`).              |
