# Módulo: archivos

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Consumido por
[`01-auth.md`](01-auth.md) (avatar), [`02-tiendas.md`](02-tiendas.md) (foto de
tienda) y [`03-productos.md`](03-productos.md) / [`06-catalogo.md`](06-catalogo.md)
(foto de producto).

No hay tabla propia: este módulo solo sube bytes a un bucket S3-compatible (MinIO
en Coolify, o cualquier proveedor S3 real) y devuelve la URL pública, que el
llamador guarda en el campo `imagenUrl`/`avatarUrl` que corresponda (`Usuario`,
`Tienda` o `Producto`/`ProductoCatalogo`).

## Reglas de negocio

- Solo se aceptan imágenes: `image/jpeg`, `image/png`, `image/webp`. Cualquier otro
  `Content-Type` es rechazado.
- Tamaño máximo por archivo: 5 MB.
- La key en el bucket sigue la convención `<tipo>/<entidadId>/<uuid>.<ext>`, ej.
  `tiendas/<tiendaId>/<uuid>.jpg`, `productos/<productoId>/<uuid>.jpg`,
  `usuarios/<usuarioId>/avatar-<uuid>.jpg` — no se reusa la key entre subidas
  (cada upload genera un nombre nuevo), así una foto vieja sigue siendo válida
  hasta que el registro se actualice con la URL nueva (no hay borrado automático
  del archivo anterior en el MVP).
- Solo puede subir una foto de tienda/producto quien es dueño de esa tienda; solo
  el propio usuario puede subir su avatar — la autorización la hace el endpoint
  antes de llamar a este módulo, según el tipo de entidad.
- **Gating por plan** (ver `10-planes.md`, feature `fotos_personalizadas`, y la
  regla de fotos de `03-productos.md` / `06-catalogo.md`). Este módulo no conoce el
  concepto de plan — lo valida el endpoint `POST /api/archivos/upload` antes de
  llamar a `subirArchivo`:
  - `tipo=producto` (foto personalizada de un producto de la tienda): la tienda debe
    ser `premium`; si no, `403 FOTOS_SOLO_PREMIUM`.
  - `tipo=catalogo` (`entidadId` = id de `ProductoCatalogo`): el usuario debe ser
    admin, o dueño de una tienda `premium` y la entrada no tener foto todavía
    (`403 FOTOS_SOLO_PREMIUM` / `409 CATALOGO_YA_TIENE_FOTO`). Key en el bucket:
    `catalogo/<catalogoId>/<uuid>.<ext>`.
  El límite anterior de 3 fotos para tiendas free (`LIMITE_FOTOS_PLAN_FREE`) queda
  reemplazado por esta regla.

## Endpoints REST

### `POST /api/archivos/upload`

Requiere sesión válida. `Content-Type: multipart/form-data` con un único campo
`archivo`. Query param `?tipo=tienda|producto|catalogo|avatar&entidadId=<id>` para que el
endpoint valide ownership antes de subir (`entidadId` no aplica para `avatar`, es
siempre el propio usuario).

Response `201`: `{ data: { url: string } }`.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/archivos/`.

```ts
type TipoArchivo = 'tienda' | 'producto' | 'catalogo' | 'avatar';

interface SubirArchivoInput {
  tipo: TipoArchivo;
  entidadId: string;
  contentType: string;
  buffer: Buffer;
}

async function subirArchivo(input: SubirArchivoInput): Promise<{ url: string }>;

function validarImagen(contentType: string, tamanioBytes: number): void;
```

## Casos de error a contemplar

| Código                   | Cuándo                                                          |
| -------------------------- | -------------------------------------------------------------------|
| `TIPO_ARCHIVO_INVALIDO`    | `contentType` no es `image/jpeg`, `image/png` ni `image/webp`.    |
| `ARCHIVO_DEMASIADO_GRANDE` | El archivo supera 5 MB.                                           |
| `ARCHIVO_FALTANTE`         | El request no trae el campo `archivo`.                            |
| `FOTOS_SOLO_PREMIUM`       | Subida de foto de producto/catálogo sin plan premium (`403`, ver `10-planes.md`). |
| `CATALOGO_YA_TIENE_FOTO`   | `tipo=catalogo`, la entrada ya tiene foto y el usuario no es admin (`409`). |
