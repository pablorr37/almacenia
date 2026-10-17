# Tutorial: Google AdSense para Almacenia

Objetivo: tener la cuenta de AdSense aprobada y pasarle a la app los datos para mostrar anuncios de Google a los usuarios **free** (ronda 4, [`../rondas/ronda-4-publicidad.md`](../rondas/ronda-4-publicidad.md)).

**Lo que tenés que conseguir al final:**
- el **ID de editor** (`ca-pub-XXXXXXXXXXXXXXXX`);
- un **ID de unidad de anuncio** (`data-ad-slot`) por cada espacio;
- la **línea de `ads.txt`**.

Esos datos se cargan como variables de entorno en Coolify, no en el código.

> Google cambia seguido la interfaz y los requisitos. Si algo no coincide, mandá: el [Centro de ayuda de AdSense](https://support.google.com/adsense) y la [guía oficial de aprobación](https://developers.google.com/adsense/platforms/transparent/approvals?hl=es-419).

---

## 0. Antes de empezar (lo que tiene que tener el sitio)

AdSense revisa **el sitio completo**. La revisión suele tardar unos días y puede llevar de 2 a 4 semanas.

| Requisito | Estado en Almacenia |
| --- | --- |
| Dominio propio, público y con HTTPS | ✅ `almacenia.store` (Coolify + Traefik). |
| Contenido visible **sin iniciar sesión** | ✅ La lista de negocios (`HomeInvitado`) y las páginas de tiendas (`/tiendas/:id`) son públicas. El rastreador de AdSense no ve lo que pide login. |
| Página de **política de privacidad** (y conviene también términos de uso) | ❌ **Falta.** Se agrega en la ronda 4 (`/privacidad`, `/terminos`). Tiene que mencionar las cookies de terceros (Google) y la [Ley 25.326 de Protección de Datos Personales](https://www.argentina.gob.ar/aaip/datospersonales). |
| `robots.txt` que no bloquee al rastreador | ⚠️ Hoy no hay. Next.js lo genera con `app/robots.ts`; se agrega en la ronda 4. |
| Contenido original y útil | ✅ Tiendas reales con productos y precios. Conviene que haya varias tiendas cargadas en producción antes de pedir la revisión. |
| Ser mayor de 18 y tener una cuenta de Google | Del titular. |

**Política clave para Almacenia:** está prohibido incentivar clics o vistas de los anuncios de Google. **Nunca** hay que dar puntos por ver o tocar un anuncio de Google. Los puntos y los canjes de la ronda 4 se aplican solo a la publicidad **propia** de Almacenia.

## 1. Crear la cuenta
1. Entrá a <https://adsense.google.com> con la cuenta de Google que va a cobrar (la del titular o la de la empresa).
2. Elegí **"Empezar"** y completá:
   - **URL del sitio**: `almacenia.store`;
   - **país de pago**: Argentina, que no se puede cambiar después;
   - aceptá los términos.
3. Completá el **perfil de pago**:
   - tipo de cuenta (individual o empresa), nombre y dirección postal **exacta**, porque ahí llega el PIN;
   - teléfono para la verificación.

## 2. Conectar el sitio
1. En **Sitios → Agregar sitio** (o en el aviso de la página principal), elegí el método **"Fragmento de código de AdSense"**. Es el `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-…">`.
2. **No lo pegues en ningún lado.** Pasame el `ca-pub-…`: la app lo carga en el `<head>` desde la variable `NEXT_PUBLIC_ADSENSE_CLIENT`, solo para usuarios free y después del consentimiento de cookies.
   - Mientras se revisa el sitio, el script tiene que estar presente en las páginas públicas.
3. **`ads.txt`:** en **Sitios**, AdSense muestra la línea. Tiene esta forma:
   ```
   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
   ```
   La app la sirve en `https://almacenia.store/ads.txt` con `app/ads.txt/route.ts`, leyendo las líneas de una variable de entorno. Así se pueden sumar las de otros proveedores sin tocar el código.
4. Tildá **"Ya coloqué el código"** y pedí la **revisión**. El estado se ve en la tarjeta **Sitios**: "Preparando", después "Listo" o "Requiere atención".

## 3. Crear las unidades de anuncio (una por espacio)
Usamos **unidades manuales**, no "anuncios automáticos": los automáticos insertan anuncios donde quieren y rompen el diseño de la app.

1. **Anuncios → Por unidad de anuncio → Anuncios de display.**
2. Para cada espacio, creá una unidad con este nombre y forma:

   | Nombre de la unidad | Dónde aparece | Forma |
   | --- | --- | --- |
   | `almacenia-inicio` | Menú de inicio, debajo de "Comprar" | Horizontal, responsive |
   | `almacenia-lista-tiendas` | Lista de negocios cercanos | Horizontal, responsive |
   | `almacenia-comparar` | Entre resultados de "Buscar y comparar" | Cuadrado o rectángulo |
   | `almacenia-tienda-pie` | Pie de la página de una tienda | Horizontal, responsive |

3. Al guardar, AdSense muestra un código como este:
   ```html
   <ins class="adsbygoogle" style="display:block"
        data-ad-client="ca-pub-XXXXXXXXXXXXXXXX"
        data-ad-slot="1234567890"
        data-ad-format="auto" data-full-width-responsive="true"></ins>
   <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
   ```
   **Pasame solo el número de `data-ad-slot` de cada unidad.** El componente de la app (`<EspacioPublicitario>`) arma ese código y reserva el alto para que la pantalla no salte al cargar.

## 4. Privacidad y consentimiento
- **Europa, Reino Unido y Suiza:** Google exige una CMP (plataforma de consentimiento) certificada que use el estándar TCF para mostrar anuncios personalizados. Nuestro público es de San Juan, pero visitantes de esas regiones pueden entrar igual.
  - Lo más simple es activar el **mensaje de consentimiento de Google** en **Privacidad y mensajes** dentro de AdSense. Google lo muestra solo en esas regiones.
- **Argentina:** la regla europea no aplica, pero sí la Ley 25.326. Política de privacidad clara, más un aviso de cookies con opción de aceptar o rechazar las cookies publicitarias.
  - La app carga el script de Google **después** de la elección. Si la persona rechaza, se muestran solo anuncios propios.

## 5. Cobros e impuestos
- **Verificación de identidad** cuando AdSense la pida.
- **PIN por correo postal:** llega cuando las ganancias alcanzan el umbral de verificación y puede tardar de 2 a 3 semanas. Hay **4 meses** para cargarlo; si no, dejan de mostrarse anuncios.
- **Forma de pago:** transferencia bancaria a una cuenta a tu nombre. En Argentina conviene confirmar en **Pagos → Formas de pago** qué opciones aparecen para tu cuenta.
- **Umbral de pago:** se paga al superar el mínimo, que suele ser de USD 100. Confirmalo en tu cuenta.
- **Impuestos:**
  - en **Pagos → Configuración → Administrar información fiscal**, completá el formulario de EE. UU. para no residentes (W-8BEN para personas). Así evitás retenciones de más sobre ingresos de anunciantes de EE. UU.;
  - ante **ARCA**, los cobros de Google son ingresos del exterior. Consultá con un contador cómo facturarlos (exportación de servicios) y el tratamiento de las divisas.

## 6. Qué me tenés que pasar (checklist)
- [ ] `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX`
- [ ] Los IDs de slot: `ADSENSE_SLOT_INICIO`, `ADSENSE_SLOT_LISTA`, `ADSENSE_SLOT_COMPARAR`, `ADSENSE_SLOT_TIENDA`.
- [ ] La línea de `ads.txt` (va en `ADS_TXT`, una línea por proveedor).
- [ ] Confirmación de que la revisión del sitio quedó **"Listo"**.
- [ ] Si querés el mensaje de consentimiento de Google para Europa (recomendado: sí).

## 7. Buenas prácticas que la app ya va a respetar
- Los anuncios **lejos de los botones de acción** (Cobrar, Agregar, +). Los clics accidentales son una causa de suspensión.
- Un máximo razonable de anuncios por pantalla (uno o dos).
- **Nunca** hacer clic en tus propios anuncios ni pedirle a nadie que lo haga.
- Premium y plata no ven anuncios; los usuarios logueados free sí. En páginas con login AdSense tiene menos datos de contenido y puede rendir menos; es normal.

## Fuentes
- [Proceso de aprobación de la cuenta (Google, español)](https://developers.google.com/adsense/platforms/transparent/approvals?hl=es-419).
- [Ayuda de AdSense: pagos y verificación](https://support.google.com/adsense/answer/157667?hl=es-GB).
- [Requisito de CMP certificada para el EEE y el Reino Unido (Google)](https://support.google.com/adsense/answer/13554116).
- [Cómo monetizar con AdSense, paso a paso (MonetizeMore)](https://www.monetizemore.com/blog/como-monetizar-tu-sitio-web-con-google-adsense-un-paso-a-paso/).
- [Integrar AdSense en Next.js App Router (DEV)](https://dev.to/vibeberry/how-we-integrated-google-adsense-into-a-nextjs-app-router-project-the-right-way-4540).
