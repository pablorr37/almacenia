# Tutorial: Google Ad Manager para Almacenia

**Ad Manager** es el servidor de anuncios de Google. AdSense es "Google pone los anuncios"; Ad Manager te deja **administrar vos** qué se muestra en cada espacio:
- campañas vendidas directo a comercios de San Juan;
- anuncios propios;
- AdSense y otras redes como relleno ("backfill");
- prioridades, topes de frecuencia y reportes unificados.

## ¿Lo necesitamos ya? Recomendación: **todavía no**
- **Para empezar alcanza con AdSense** y nuestro motor propio ([`../investigacion/motor-de-avisos.md`](../investigacion/motor-de-avisos.md)). El rotador de la app ya mezcla Google, otros proveedores y avisos propios.
- **Ad Manager conviene cuando:**
  - hay volumen;
  - se venden campañas directas grandes a anunciantes externos;
  - se quiere sumar demanda programática (Ad Exchange, header bidding).
- **Requisito práctico:** la versión gratuita (Ad Manager para pequeñas empresas) suele pedir una **cuenta de AdSense aprobada**. Hay que hacer primero el [tutorial de AdSense](publicidad-google-adsense.md).
- **Límites:**
  - la versión gratuita tiene un tope mensual de impresiones (decenas de millones; la cifra varía por región, confirmala en tu cuenta);
  - por encima está **Ad Manager 360**, pago y con contrato anual alto.

## 1. Alta
1. Con la misma cuenta de Google de AdSense, entrá a <https://admanager.google.com> y elegí **"Registrarse"** (o "Crear cuenta de Ad Manager").
2. Elegí **país Argentina**, zona horaria **America/Argentina/San_Juan** y moneda **ARS** o **USD**. Pensalo bien: **la moneda no se cambia después**.
3. Vinculá la cuenta de AdSense cuando lo pida. Así AdSense compite automáticamente por los espacios vacíos.
4. Anotá el **código de red** (network code): un número que aparece en **Administrador → Configuración global**.

## 2. Inventario: una unidad de anuncio por espacio
**Inventario → Unidades de anuncio → Nueva unidad.** Mismos espacios que en AdSense:

| Código de unidad | Tamaños | Dónde |
| --- | --- | --- |
| `almacenia_inicio` | 320x100, 320x50, fluid | Menú de inicio |
| `almacenia_lista` | 320x100, 320x50 | Lista de negocios cercanos |
| `almacenia_comparar` | 300x250 | Entre resultados de "Buscar y comparar" |
| `almacenia_tienda_pie` | 320x100, 320x50 | Pie de la página de una tienda |

## 3. Pedidos y líneas (cómo se vende un espacio)
- **Anunciante** (Administrador → Empresas): por ejemplo, "Supermercado X".
- **Pedido**: una venta con un anunciante.
- **Línea de pedido**: qué, dónde, cuándo y cuánto.

  | Elemento | Ejemplo |
  | --- | --- |
  | Tipo | **Patrocinio** (100 % del espacio), **Estándar** (X impresiones) o **Precio por volumen** (relleno) |
  | Segmentación | Unidades, fechas, frecuencia (por ejemplo, máximo 3 por usuario por día) y valores clave personalizados, como `plan=free`, `rubro=almacen`, `zona=capital` |
  | Creatividad | Imagen o GIF del tamaño exacto, con su URL de destino |

- **Prioridad:** patrocinios y estándar le ganan a AdSense; AdSense rellena lo que sobra.

## 4. Cómo lo integra la app (para el desarrollo)
Ad Manager se usa con **GPT** (Google Publisher Tag). En una app de una sola página como Almacenia, Google recomienda:
- cargar `https://securepubads.g2.doubleclick.net/tag/js/gpt.js` **una sola vez**, en el layout, solo para usuarios free y después del consentimiento;
- definir cada espacio con `googletag.defineSlot('/<código de red>/almacenia_inicio', [[320,100],[320,50]], 'div-id')`;
- usar `googletag.pubads().disableInitialLoad()` y pedir los anuncios con `refresh()` cuando el componente aparece;
- al cambiar de pantalla, `googletag.destroySlots([...])`, para no dejar espacios huérfanos;
- pasar segmentación con `setTargeting('plan','free')`, `setTargeting('rubro',…)`.
- Reservar el alto del espacio, para que la pantalla no salte (CLS).

Google tiene un ejemplo oficial para React y Next.js: [GPT y React](https://developers.google.com/publisher-tag/samples/integrations/react?hl=es).

En la app esto queda como **un proveedor más** del rotador (`proveedor = "gam"`). Se configura con `NEXT_PUBLIC_GAM_NETWORK` y los códigos de unidad, sin tocar el código.

## 5. `ads.txt`
Con Ad Manager hay que sumar a `ads.txt` la línea de Google que aparece en **Administrador → Configuración global → ads.txt**. Va en la misma variable `ADS_TXT` que la de AdSense, una línea por proveedor.

## 6. Qué me tenés que pasar (cuando decidas usarlo)
- [ ] El código de red.
- [ ] Los códigos de unidad de cada espacio (o la confirmación de que usaste los de la tabla).
- [ ] La línea de `ads.txt`.
- [ ] Si vas a vender campañas directas por Ad Manager, o por el motor propio de Almacenia (recomendado al principio: motor propio).

## Fuentes
- [AdSense vs. Ad Manager (Setupad)](https://setupad.com/blog/google-ad-manager-vs-adsense-complete-guide/).
- [Ad Manager para empresas (MonetizeMore)](https://www.monetizemore.com/blog/google-ad-manager-for-business/).
- [Preguntas frecuentes del ecosistema Google (AdButler)](https://www.adbutler.com/blog/article/google-ad-manager-vs-google-ads-adsense-an-ecosystem-faq).
- [Ejemplo oficial de GPT con React](https://developers.google.com/publisher-tag/samples/integrations/react?hl=es).
- [GPT en una SPA con Next.js (DEV)](https://dev.to/muhammadazfaraslam/implementing-google-publisher-tag-ads-in-nextjs-15-single-page-application-2025-3kof).
