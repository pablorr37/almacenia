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
sin esto, `POST /api/archivos/upload` va a fallar en cuanto se lo use.

1. En Coolify: **New Resource → Docker Image**, imagen `minio/minio` (requiere
   cuenta/login de Docker Hub para esa imagen — si no la tenés, cualquier otro
   servidor S3-compatible autoalojado, o un proveedor S3 real como Cloudflare R2 o
   AWS S3, sirve igual: el cliente (`@aws-sdk/client-s3`) solo necesita un
   `endpoint` y credenciales, no depende de que sea MinIO específicamente).
2. Comando: `server /data --console-address ":9001"`. Exponé el puerto 9000 (API
   S3) al menos internamente para la app; el 9001 (consola web) es opcional.
3. No hace falta crear el bucket a mano: `subirArchivo`
   (`src/lib/archivos/archivos.ts`) lo crea solo en el primer upload si no existe.
4. Variables de entorno de la app (ver paso 4):
   `S3_ENDPOINT`, `S3_PUBLIC_URL`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`,
   `S3_SECRET_KEY`.
   - `S3_ENDPOINT` es el host interno del recurso MinIO en Coolify (service-to-
     service, como con `DATABASE_URL`).
   - `S3_PUBLIC_URL` es la URL **pública** desde la que el navegador va a cargar
     las fotos (`<img src>`) — si `S3_ENDPOINT` no es accesible desde afuera,
     asignale un dominio propio al recurso MinIO en Coolify y usá ese acá.

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
| `S3_ENDPOINT` | Host interno del recurso S3/MinIO (paso 2.5). |
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
