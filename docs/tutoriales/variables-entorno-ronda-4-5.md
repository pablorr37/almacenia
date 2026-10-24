# Tutorial: variables de entorno de las rondas 4 y 5

Qué variables cargar en Coolify para que funcionen las notificaciones push, el email, los pagos en pesos y las tareas programadas (specs `21-publicidad.md`, `22-notificaciones.md` y `23-puntos-pagos.md`). Sin ellas la app anda igual, pero esos canales quedan apagados.

## Resumen

| Variable | ¿Obligatoria? | Para qué |
| --- | --- | --- |
| `APP_URL` | Sí | Enlaces dentro de los emails |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Sí, para push | Notificaciones push |
| `VAPID_PRIVATE_KEY` | Sí, para push | Notificaciones push |
| `VAPID_SUBJECT` | Sí, para push | Contacto que exigen los servicios de push (`mailto:…`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Sí, para email | Envío de emails |
| `EMAIL_FROM` | Sí, para email | Remitente de los emails |
| `CRON_TOKEN` | Sí | Protege la tarea programada de cada hora |
| `PAGO_MANUAL_DATOS` | Opcional | Alias o CBU que se muestra en los pagos en pesos |
| `ADS_TXT` | Opcional, más adelante | Contenido de `/ads.txt` para AdSense; hoy dejala vacía |

## Paso 1: generar los valores

### a) Claves VAPID (push)
La herramienta ya está dentro de la imagen de la app. En el servidor, por SSH:

```bash
APP=$(docker ps --format '{{.Names}}' | grep hdui7vmipvd3fmx4hflfvr5z | head -1)
docker exec "$APP" node node_modules/web-push/src/cli.js generate-vapid-keys
```

Te devuelve `Public Key` y `Private Key`. **Guardalas en un lugar seguro.** No se cambian nunca: si cambian, todos los teléfonos suscriptos dejan de recibir push y tienen que volver a activarlo.

### b) `CRON_TOKEN`
En el mismo servidor:

```bash
openssl rand -hex 32
```

### c) Cuenta SMTP (email)

| Opción | Gratis | `SMTP_HOST` | `SMTP_PORT` | `SMTP_USER` | `SMTP_PASS` |
| --- | --- | --- | --- | --- | --- |
| **Brevo** (recomendada para empezar) | 300 por día | `smtp-relay.brevo.com` | `587` | El login SMTP de Brevo | La clave SMTP de Brevo |
| **Resend** | 3000 por mes | `smtp.resend.com` | `465` | `resend` | Tu API key (`re_…`) |
| **Gmail** (solo para pruebas) | ~500 por día | `smtp.gmail.com` | `465` | Tu Gmail | Una "contraseña de aplicación" (requiere verificación en 2 pasos) |

- Con Brevo o Resend hay que **verificar el dominio `almacenia.store`**: te piden agregar registros DNS (SPF y DKIM) donde tengas el dominio. Sin eso, los emails caen en spam o se rechazan.
- `EMAIL_FROM` tiene que ser una dirección de ese dominio verificado.
- Los límites gratuitos cambian; confirmalos en el sitio de cada proveedor.

## Paso 2: cargarlas en Coolify

1. Entrá a la app en Coolify y abrí **Environment Variables**.
2. Tocá **Developer view** para pegar todo junto. Reemplazá los valores entre `<…>`:

   ```env
   APP_URL=https://app.almacenia.store
   NEXT_PUBLIC_VAPID_PUBLIC_KEY=<Public Key del paso 1a>
   VAPID_PRIVATE_KEY=<Private Key del paso 1a>
   VAPID_SUBJECT=mailto:<tu email de contacto>
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_USER=<usuario SMTP>
   SMTP_PASS=<clave SMTP>
   EMAIL_FROM=Almacenia <notificaciones@almacenia.store>
   CRON_TOKEN=<valor del paso 1b>
   PAGO_MANUAL_DATOS=Alias: tu.alias · Titular: Nombre Apellido
   ```

3. Tocá **Save**. Dejá tildadas las opciones que Coolify trae por defecto (disponible en el build y en el runtime). Es importante para `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
4. Tocá **Redeploy**: las variables recién se aplican en el deploy nuevo.

## Paso 3: la tarea de cada hora

Sin esta tarea no vencen los planes premium, no se descuentan los días de las campañas, no sale la publicidad push ni terminan los envíos masivos.

1. En la app de Coolify, abrí **Scheduled Tasks** y tocá **Add**.
2. Completá:
   - **Name:** `tareas-cada-hora`
   - **Command** (la imagen no trae `curl`, así que se usa Node; llama al servidor por el nombre del contenedor, porque en imágenes anteriores a `ENV HOSTNAME=0.0.0.0` la app no escucha en `localhost`):

     ```sh
     node -e "fetch('http://'+process.env.HOSTNAME+':3000/api/cron/tareas',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_TOKEN}}).then(async r=>{console.log(r.status, await r.text());process.exit(r.ok?0:1)})"
     ```

   - **Frequency:** `0 * * * *`
3. Guardá la tarea y ejecutala una vez a mano. En el log tiene que aparecer `200`:
   - `503`: falta `CRON_TOKEN`;
   - `401`: el token no coincide;
   - `ECONNREFUSED`: el comando todavía apunta a `localhost`; usá el de arriba.

## Paso 4: verificar

1. Abrí `https://app.almacenia.store/api/push/clave`. Tiene que mostrar la clave, no `null`.
2. En el teléfono, abrí la app instalada y andá a **Perfil → Notificaciones → Activar notificaciones push**. Aceptá el permiso. En iPhone, la app se tiene que abrir desde el ícono de la pantalla de inicio.
3. Cerrá la app y simulá un pedido: tiene que sonar el teléfono y llegar el email (con "Pedidos → Email" tildado, que viene así por defecto).
4. Si algo no llega, buscá en los logs del contenedor las líneas con `[notificaciones]`:
   - `canal push deshabilitado` o `canal email deshabilitado`: falta esa variable;
   - `push falló` o `email falló`: el error que sigue dice por qué.
