# Tutorial: otros proveedores de publicidad

El rotador de Almacenia (ronda 4) mezcla tres fuentes de anuncios:
- **Google**;
- **otros proveedores**;
- **avisos propios**.

Esta guía sirve para elegir los "otros" y darlos de alta.

> **Contexto del público:** el tráfico es de **San Juan, Argentina**, desde el celular y con pocas visitas al principio. Muchas redes pagan poco por tráfico latinoamericano o piden mínimos altos. La fuente que más va a rendir al principio es la **publicidad propia**: comercios locales que pagan con dinero o con puntos.

## Comparativa rápida

| Proveedor | Mínimo de tráfico | Encaja con Almacenia | Notas |
| --- | --- | --- | --- |
| **Avisos propios de Almacenia** | Ninguno | ⭐ Mejor opción | Anunciantes locales, pago con dinero o puntos, diseño integrado. Ver la [investigación](../investigacion/motor-de-avisos.md). |
| **Google AdSense** | Sin mínimo publicado | ✅ Base | El [tutorial](publicidad-google-adsense.md) es el primer paso. |
| **Ezoic** | Pide cuenta aprobada; ver sus requisitos vigentes | ✅ Cuando haya tráfico | Socio certificado de Google: suma demanda de AdX y optimiza con IA. Reemplaza la colocación de anuncios con su script, así que conviene probarlo en pocas páginas. |
| **PropellerAds** / **Adsterra** | Sin mínimo o muy bajo | ⚠️ Con cuidado | Aprobación rápida y buen relleno en mercados emergentes, pero la calidad de los anuncios es dispar (popunders, redirecciones). Solo formatos de banner, **nunca** popunder ni push de terceros, para no arruinar la experiencia. |
| **Media.net** (Yahoo/Bing) | ~10.000 visitas/mes | ❌ Por ahora | Se enfoca en tráfico de EE. UU., Reino Unido y Canadá. |
| **Mediavine** / **Raptive** | 50.000 o más sesiones/mes | ❌ Por ahora | Pensados para sitios de contenido grandes. |
| **Infolinks** | Bajo | ⚠️ Poco útil | Anuncios dentro del texto; Almacenia tiene poco texto largo. |
| **MGID** / **Taboola** | Variable | ❌ | Recomendación de contenido ("noticias que te pueden interesar"); no encaja con una app de compras. |

**Recomendación:**
1. Ahora: **avisos propios + AdSense**.
2. Con tráfico estable (más de 10.000 usuarios al mes): probar **Ezoic** o **Ad Manager con header bidding**.
3. Las redes de bajo requisito (PropellerAds, Adsterra) solo como relleno de banners y con revisión manual de lo que muestran.

## Alta de un proveedor (pasos comunes)
1. **Registro** como *publisher* (editor), con:
   - dominio: `almacenia.store`;
   - categoría: compras o comercio local;
   - país: Argentina.
2. **Verificación del sitio**:
   - casi todas piden una **línea en `ads.txt`**: se suma a la variable `ADS_TXT` de Coolify, sin tocar el código;
   - algunas piden además un meta tag o un script temporal: pasámelo y lo agrego por configuración.
3. **Crear unidades o zonas de anuncio** para los mismos espacios que AdSense:

   | Espacio | Tamaños |
   | --- | --- |
   | Inicio | 320x100 o 320x50 |
   | Lista | 320x100 o 320x50 |
   | Comparar | 300x250 |
   | Pie de tienda | 320x100 o 320x50 |

4. **Datos de cobro**:
   - casi todas pagan en USD por transferencia internacional, PayPal, Payoneer o cripto;
   - revisá comisiones, mínimos de pago y el tratamiento ante ARCA con un contador.
5. **Pasame:**
   - el ID de editor;
   - los IDs o snippets de cada espacio;
   - la línea de `ads.txt`.

## Cómo entra un proveedor en la app (para el desarrollo)
- Cada proveedor es un **adaptador** del rotador:
  - `src/lib/publicidad/proveedores/<nombre>.ts` en el servidor (configuración);
  - un componente que carga su script en el cliente.
- En el admin, cada espacio tiene **pesos por proveedor** (por ejemplo: propios 50 %, AdSense 40 %, otro 10 %) y un **orden de respaldo** si alguno no llena el espacio.
- **Reglas iguales para todos los proveedores:**
  - solo usuarios free;
  - después del consentimiento;
  - alto reservado;
  - lejos de los botones de acción;
  - nunca premiar clics en anuncios de terceros.
- Medición: impresiones y clics de los propios en nuestra base; los de terceros, en su panel. En el admin se ve un resumen de cuántas veces se eligió a cada proveedor.

## Fuentes
- [Alternativas a AdSense (Kinsta)](https://kinsta.com/blog/adsense-alternatives/).
- [Redes alternativas para editores (Quality Unit)](https://cdn.qualityunit.com/faq/alternative-ad-networks).
- [Las mejores alternativas a AdSense (Adrenalead)](https://adrenalead.com/en/blog/alternatives-google-adsense-monetize-site/).
- [Alternativas a AdSense (Skylum)](https://blog.skylum.com/best-adsense-alternatives/).
- [Alternativas a AdSense (Bidscube)](https://bidscube.com/?p=3556).
