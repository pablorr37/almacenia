# Deploy de Almacenia en Coolify

Tutorial paso a paso para llevar la app a producción en un server con Coolify.
Cubre: base de datos Postgres+PostGIS, la app Next.js (vía `Dockerfile`), variables
de entorno, dominio/HTTPS y verificación post-deploy.

No pongas contraseñas reales en este archivo si lo versionás en git — usá los
placeholders (`<...>`) como referencia y guardá los valores reales solo en las
variables de entorno de Coolify.

## 1. Base de datos: Postgres + PostGIS

El mapa de tiendas cercanas depende de la extensión **PostGIS** (`ST_DWithin`,
`ST_Distance` sobre la columna `ubicacion`). Un Postgres sin PostGIS instalado no
alcanza, aunque la conexión funcione — las migraciones van a fallar en el
`CREATE EXTENSION postgis`.

### Si podés crear la base desde cero (recomendado)

1. En Coolify: **New Resource → Database → PostgreSQL**.
2. En la imagen Docker, usá `postgis/postgis:16-3.4` en vez de la imagen default de
   Postgres (es la misma que usa `infra/docker-compose.yml` en local).
3. Anotá: usuario, password, host interno y nombre de la base — Coolify te los
   muestra en la pestaña de conexión del recurso.

### Si ya tenés una base creada sin PostGIS

1. Conectate a la consola de esa base desde Coolify (o con `psql` externamente).
2. Corré:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```
3. Si falla con un error de "extension not available" o de permisos, el server de
   Postgres no tiene el paquete PostGIS instalado a nivel sistema — en ese caso no
   hay vuelta, hay que recrear la base con la imagen `postgis/postgis` (paso
   anterior).

No hace falta correr migraciones a mano en ningún caso: el contenedor de la app las
aplica solo al arrancar (ver sección 5).

## 2. Armar el `DATABASE_URL`

Formato:

```
postgresql://<usuario>:<password>@<host-interno>:5432/<nombre-db>?schema=public
```

- Usá el **host interno** que te da Coolify para conexión service-to-service (no el
  endpoint público expuesto a internet, si lo hay) — es más rápido y no depende de
  que el puerto esté abierto hacia afuera.
- Es una sola URL. No pegues otra URL completa dentro de alguno de estos campos — un
  error común es copiar el string de conexión que muestra Coolify y volver a
  envolverlo en la plantilla.
- Si el usuario o el password tienen caracteres especiales (`@`, `:`, `/`, `#`, etc.),
  hay que codificarlos con `encodeURIComponent` antes de pegarlos en la URL — si tu
  password es alfanumérico no hace falta.

## 2.5. Storage S3-compatible para fotos (08-archivos.md)

La subida de fotos (producto, tienda, perfil) necesita un bucket S3-compatible —
sin esto, `POST /api/archivos/upload` va a fallar en cuanto se lo use. Se crea a
mano (no hay script para esto):

1. En el proyecto de Coolify (mismo entorno que la app): **+ New → Docker Compose
   Empty**. Las versiones actuales de Coolify ya no muestran la plantilla de MinIO
   en el catálogo (MinIO dejó de publicar imágenes Docker en 2025), y Garage, que sí
   aparece, no soporta las políticas de bucket que usa la app. Pegá:

   ```yaml
   services:
     minio:
       image: ghcr.io/coollabsio/minio:RELEASE.2025-10-15T17-29-55Z
       command: server /data --console-address ":9001"
       environment:
         - SERVICE_URL_MINIO_9000
         - MINIO_SERVER_URL=https://s3.almacenia.store
         - MINIO_BROWSER_REDIRECT_URL=https://minio.almacenia.store
         - MINIO_ROOT_USER=$SERVICE_USER_MINIO
         - MINIO_ROOT_PASSWORD=$SERVICE_PASSWORD_MINIO
       volumes:
         - minio-data:/data
       healthcheck:
         test: ["CMD", "mc", "ready", "local"]
         interval: 5s
         timeout: 20s
         retries: 10
   ```

   Es la imagen que mantiene el equipo de Coolify (la misma de su plantilla
   oculta). `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO` son variables mágicas:
   Coolify genera el usuario y la contraseña root al guardar (pestaña Environment
   Variables del servicio); los vas a necesitar abajo. `SERVICE_URL_MINIO_9000`
   (sin valor) es imprescindible: marca a `minio` como web en el puerto 9000. Sin
   ella Coolify no le asigna dominio y no genera ninguna etiqueta de Traefik (el
   contenedor queda healthy pero inalcanzable). Sin sección `ports:` a propósito:
   MinIO solo se alcanza por el proxy, con HTTPS. El volumen `minio-data` es lo
   que conserva las fotos entre redeploys.
2. En el servicio → **Settings → Domains** (Coolify 4.3; no está en el Settings
   del componente): editar la fila de **Minio** (o **Add domain** → Service
   application *Minio*) con Protocol `https`, Host `s3.almacenia.store`, Port
   `9000`. Opcional, la consola: **Add domain** → *Minio*, `https`,
   `minio.almacenia.store`, `9001` → *Use this port anyway*. El Port es el puerto
   del contenedor al que reenvía Traefik; hacia afuera siempre es 443. Creá en tu
   DNS los registros A de esos subdominios apuntando a la IP del VPS (igual que
   `app.almacenia.store`) y, una vez propagados, **Deploy** del servicio (no
   *Restart* del componente: ese solo hace `docker restart` y no regenera las
   etiquetas). Comprobación en el VPS:
   `grep -c traefik /data/coolify/services/<uuid>/docker-compose.yml` > 0, y
   `https://s3.almacenia.store/minio/health/live` responde 200.
3. No hace falta crear el bucket ni configurar permisos a mano: la app crea el
   bucket en el primer upload y le aplica **lectura pública solo de archivos**
   (`s3:GetObject`), para que el navegador pueda mostrar las fotos.
4. Variables de entorno **de la app** (recurso de la app → Environment Variables),
   y después **Redeploy** de la app:

   ```
   S3_ENDPOINT=https://s3.almacenia.store
   S3_PUBLIC_URL=https://s3.almacenia.store
   S3_BUCKET=almacenia
   S3_REGION=us-east-1
   S3_ACCESS_KEY=<usuario root de MinIO>
   S3_SECRET_KEY=<contraseña root de MinIO>
   ```

   Usar el dominio público también como `S3_ENDPOINT` es lo más simple: no depende
   de que la app y MinIO compartan red interna de Docker. (Si preferís la red
   interna, `S3_ENDPOINT` puede ser el host interno del servicio con `:9000`, pero
   `S3_PUBLIC_URL` siempre tiene que ser el dominio público.)

### Comprobar que funciona

En `/admin` (cuenta admin) → tarjeta **Estado del sistema** → **Probar
almacenamiento**: escribe y borra un archivo de prueba en el bucket y muestra ✓ o
el error exacto. También queda en el log de la app con el prefijo
`[almacenamiento]` (`docker logs <app> | grep almacenamiento`).

| Error que muestra | Qué significa | Qué hacer |
| --- | --- | --- |
| `falta S3_BUCKET` / `falta S3_ENDPOINT` | La app no tiene la variable. | Cargarla en las variables de entorno de la app en Coolify y redeployar. |
| `ECONNREFUSED`, `ENOTFOUND`, `getaddrinfo`, `timeout` | La app no llega a MinIO. | Revisar que `S3_ENDPOINT` sea `https://s3.almacenia.store` (sin barra final), que el registro DNS exista y que MinIO esté corriendo. |
| `certificate`, `self-signed` | Traefik todavía no emitió el certificado de `s3.`. | Con el DNS ya propagado, **Restart** del servicio MinIO. |
| `404 page not found`, `no available server` | Traefik no sabe a qué contenedor mandar el dominio. | Revisar el campo Domains del componente `minio` (con `:9000`). |
| `InvalidAccessKeyId`, `SignatureDoesNotMatch`, `AccessDenied` | Credenciales incorrectas. | `S3_ACCESS_KEY` / `S3_SECRET_KEY` = usuario y contraseña root de MinIO (`MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`). |
| `XMinioStorageFull`, `minimum free drive threshold` | El disco del VPS / volumen de MinIO está lleno. | Liberar espacio en el VPS (`df -h`, `docker system prune`) o ampliar el volumen. |
| ✓ almacenamiento pero ✗ "Las fotos se pueden ver" | El bucket recibe pero el navegador no puede leerlas. | El diagnóstico ya reaplica la política de lectura; si sigue en ✗, `S3_PUBLIC_URL` no es una URL pública accesible: usá el dominio del servicio MinIO (puerto 9000) con HTTPS. |

Las fotos se comprimen en el teléfono antes de subirse (máx. 1600 px, JPEG), así
que una foto de cámara pesa ~300 KB. El cartel negro de Android "memoria
insuficiente" al sacar la foto es del teléfono (cierra el navegador mientras la
cámara está abierta), no del servidor: sacar la foto con la cámara y después
elegirla desde la galería.

## 3. Crear el recurso de la app en Coolify

1. **New Resource** → fuente **Dockerfile** o **Git Repository** apuntando a este
   repo (Coolify detecta el `Dockerfile` de la raíz automáticamente).
2. Conectá la rama que corresponda (`master`).
3. Puerto interno del contenedor: **3000** (`EXPOSE 3000` en el `Dockerfile`).

## 4. Variables de entorno

En la sección de Environment Variables del recurso de la app:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | La URL armada en el paso 2. |
| `AUTH_SECRET` | Un valor nuevo, generado para producción — **no reutilices** el de tu `.env` local. Generalo con `openssl rand -base64 32` (o `npx auth secret` si tenés el CLI de Auth.js). |
| `S3_ENDPOINT` | Dominio público de la API de MinIO, ej. `https://s3.almacenia.store` (paso 2.5). |
| `S3_PUBLIC_URL` | URL pública desde la que el navegador carga las fotos (puede ser igual a `S3_ENDPOINT` si ese host ya es público). |
| `S3_BUCKET` | Nombre del bucket (ej. `almacenia`). |
| `S3_REGION` | `us-east-1` sirve para MinIO/la mayoría de proveedores S3-compatibles. |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Credenciales del recurso S3/MinIO. |

No hace falta `NEXTAUTH_URL`: `trustHost: true` en `src/auth.ts` ya cubre correr
detrás del proxy de Coolify. `ALLOWED_ORIGIN`/`MAP_TILES_API_KEY` de `.env.example`
no están en uso todavía — no son necesarias para que la app funcione.

## 5. Cómo arrancan las migraciones

El `Dockerfile` genera el cliente Prisma en el build (`npx prisma generate`) y el
`docker-entrypoint.sh` corre `prisma migrate deploy` contra `DATABASE_URL` **antes**
de levantar el server Next.js en cada arranque del contenedor. No es necesario (ni
recomendado) correr migraciones manualmente — si algo falla acá, el contenedor no
llega a levantar el server y el log del deploy en Coolify va a mostrar el error de
Prisma directamente (casi siempre `DATABASE_URL` mal armada o falta PostGIS).

## 6. Dominio y HTTPS

1. Asigná un dominio (propio o el subdominio `*.sslip.io`/similar que da Coolify).
2. Tiene que servir sobre **HTTPS** — la pantalla del mapa pide geolocalización al
   navegador (`navigator.geolocation`), que los navegadores solo habilitan en
   contextos seguros (HTTPS o `localhost`). Coolify arma el certificado
   automáticamente si usás su proxy (Traefik) por defecto.
3. Si el panel te deja configurar un healthcheck, usá el path `/api/health` (ya
   existe en la app, devuelve `{"status":"ok"}`).

## 6.5. Rotar secretos y evitar que se filtren en el build

Por default, Coolify inyecta **todas** las variables de entorno del recurso también
como build args de Docker — no solo en runtime. Nuestro `Dockerfile` no necesita
`DATABASE_URL` ni `AUTH_SECRET` durante el build (solo el `docker-entrypoint.sh` las
usa al arrancar el contenedor), así que dejarlas disponibles en build time no aporta
nada y sí expone el valor en texto plano en el log de deploy y, peor, **incrustado en
el historial de capas de la imagen** (recuperable con `docker history --no-trunc
<imagen>` por cualquiera con acceso a esa imagen).

### Dónde se desactiva

1. En Coolify, entrá al recurso de la **app** (no la base de datos) →
   **Environment Variables**.
2. Para cada variable (`DATABASE_URL`, `AUTH_SECRET`): abrí sus opciones (ícono de
   editar/engranaje al lado del valor) y buscá el toggle **"Available at
   Buildtime"** / **"Build Variable"** — desactivalo. Dejalas solo como variable de
   runtime (el toggle de "Available at Runtime" sí tiene que seguir activo).
3. Guardá cada una.

### Cuándo rotar

Cualquier valor que haya aparecido en texto plano en un log de deploy, en un chat,
o en cualquier lugar fuera de "solo la variable de entorno en Coolify" — tratalo
como comprometido y regeneralo, sin excepción:

- **Password de la base** (`dbadmin`): se regenera desde el panel de la base de
  datos en Coolify (o el hosting que la provea) — no hay comando único, depende del
  proveedor.
- **`AUTH_SECRET`**: se regenera localmente, no hay panel para esto. Corré:
  ```
  openssl rand -base64 32
  ```
  y pegá el resultado directo en el campo `AUTH_SECRET` de las Environment
  Variables de la app en Coolify (reemplazando el valor viejo).

Después de rotar ambos y desactivar "Available at Buildtime", hacé un **Redeploy**
para que el contenedor arranque con los valores nuevos.

## 7. Deploy

1. Deploy manual desde el botón de Coolify, o `git push` a la rama conectada si ya
   configuraste el autodeploy (según la convención del repo, el push a GitHub es un
   paso explícito del dev, no algo que se automatice sin que él lo pida).
2. Mirá los logs del primer deploy. La secuencia esperada:
   ```
   Aplicando migraciones de Prisma...
   ...
   All migrations have been successfully applied.
   Iniciando servidor...
   ▲ Next.js ...
   ✓ Ready in ...ms
   ```
3. Si se corta antes de "Iniciando servidor...", el problema está casi siempre en
   `DATABASE_URL` (host/usuario/password mal, o falta la extensión PostGIS).

## 8. Verificación post-deploy

Con la app ya arriba, recorrido manual completo:

1. `GET https://<tu-dominio>/api/health` → `{"status":"ok"}`.
2. Registrarse (`/registro`) con una cuenta.
3. Iniciar sesión (`/login`).
4. Entrar al mapa (`/`) y aceptar el permiso de geolocalización del navegador.
5. Si no aparece ninguna tienda cerca, crear una desde `/mi-tienda` (necesita
   geolocalización también).
6. Cargar al menos un producto desde el panel del vendedor.
7. Desde otra cuenta (o sesión incógnita) compradora: entrar al catálogo de esa
   tienda, armar un pedido y confirmarlo.
8. Desde la cuenta vendedora: confirmar el pedido → marcar listo para retirar →
   entregar, y verificar que la venta quede registrada (débito de stock incluido).

Si algún paso falla, el error debería venir con un `code` (`SCREAMING_SNAKE_CASE`,
ver `specs/sdd/00-overview.md`) en la respuesta de la API — eso dice exactamente qué
regla de negocio no se cumplió, no hace falta adivinar por el mensaje.

## 9. Promover una cuenta a admin

No hay endpoint para esto a propósito (`01-auth.md`: `esAdmin` no se activa vía
API). El script `scripts/crear-admin.ts` viene dentro de la imagen, así que se
corre desde el contenedor de la app (en la terminal del VPS):

```bash
docker ps --format '{{.Names}}' | grep -i almacenia   # nombre del contenedor de la app
docker exec -it <NOMBRE> sh -c 'cd /app && node_modules/.bin/tsx scripts/crear-admin.ts admin@tu-dominio.com "una-password-fuerte"'
```

(También se puede pegar solo lo de adentro del `sh -c` en la pestaña **Terminal**
del recurso en Coolify.) Alternativa desde una máquina con acceso a la base:

```bash
DATABASE_URL="<url de producción>" npx tsx scripts/crear-admin.ts admin@tu-dominio.com "una-password-fuerte"
```

La password tiene que tener al menos 8 caracteres (`PASSWORD_DEBIL`). Si el email ya existe, solo lo promueve (no toca su password). Con la cuenta
promovida, entrá a `/admin` para ver métricas, verificaciones, usuarios,
productos y ventas.

## 10. Seed de demo: 100 tiendas reales con nombres de fantasía

El seed (`prisma/seed.ts`) viene en la imagen. Para sembrar 100 tiendas con
ubicaciones reales de comercios de barrio del Gran San Juan (datos públicos de
OpenStreetMap, © colaboradores de OpenStreetMap, licencia ODbL) y **nombres de
fantasía parecidos a los reales** (nunca el real), sin compradores:

```bash
docker ps --format '{{.Names}}' | grep -i almacenia   # nombre del contenedor de la app
docker exec -it <NOMBRE> sh -c 'cd /app && SEED_FUENTE=osm SEED_TIENDAS=100 SEED_COMPRADORES=0 node_modules/.bin/tsx prisma/seed.ts'
```

(O pegar solo lo de adentro del `sh -c` en la pestaña **Terminal** del recurso.)

| Variable           | Default | Qué hace |
| ------------------ | ------- | -------- |
| `SEED_TIENDAS`     | `20`    | Cantidad de tiendas. |
| `SEED_FUENTE`      | `local` | `osm`: consulta Overpass (OpenStreetMap). Si falla o trae menos, completa con tiendas generadas; el log dice cuántas vinieron de OSM. |
| `SEED_COMPRADORES` | `12`    | `0`: no crea compradores, reseñas ni la lista demo. |
| `SEED_FOTOS_WEB`   | —       | `1`: para cada producto de catálogo sin foto, busca una foto libre (Openverse) y la deja **pendiente** en `/admin/fotos`. |

- Es idempotente: borra solo usuarios `@seed.almacenia.test` y lo que cuelga de
  ellos. No toca el catálogo (se reutiliza por nombre), el banco de fotos ni
  cuentas reales (p. ej. el admin).
- Contraseña de todos los vendedores seed: `password123`.
- Fotos: nunca al azar. Cada producto usa la mejor foto **aprobada** del banco
  (`16-banco-fotos.md`); si no hay, queda sin foto. Flujo recomendado: correr con
  `SEED_FOTOS_WEB=1`, revisar las pendientes en `/admin/fotos` (y buscar más con
  "Buscar y aprobar fotos"), y volver a correr el seed para que las tome.
