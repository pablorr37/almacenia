# Ronda 4: publicidad

Estado: **pendiente** (borrador). Ver el pedido textual en [`../memoria.md`](../memoria.md), punto 2.

## Decisión del usuario
- Los usuarios **free** (compradores y vendedores) ven anuncios rotativos que mezclan **Google** (AdSense/Ad Manager), **otros proveedores** y **anuncios propios de Almacenia**.
- En el mapa, los usuarios free ven el **nombre de las tiendas que pagan publicidad** junto a su pin.
- Los usuarios **premium/plata** no ven anuncios; ven solo el nombre en el pin.

## Infraestructura a construir
- **Espacios publicitarios** ("slots") en lugares fijos:
  - banner en la lista de tiendas;
  - entre resultados de "Buscar y comparar";
  - en el pie de la tienda.
  - Cada slot tiene medidas y formato fijos, que integran el anuncio al diseño.
- **Rotador:** por cada slot elige un proveedor según pesos configurables en el admin: Google, otro proveedor u Almacenia. Si un proveedor falla, cae al siguiente.
- **Proveedor Google:**
  - el `<script>` de AdSense se carga solo para usuarios free;
  - IDs (`ca-pub-…` y los slots) en variables de entorno;
  - consentimiento de cookies si hace falta.
- **Motor propio de Almacenia:**
  - **anunciantes**: tiendas u otras empresas;
  - **campañas**: presupuesto, fechas, segmentación por zona, rubro y categoría;
  - **piezas** (creativos): imagen, título, texto y link, con el diseño de Almacenia;
  - registro de **impresiones y clics**;
  - **admin** para aprobar piezas y ver métricas;
  - **"Tienda destacada en el mapa"**: el nombre junto al pin, para usuarios free.
- **Spec nueva:** `specs/sdd/20-publicidad.md`.

## Pendiente de definir
- Cuenta e IDs de Google y lista de otros proveedores.
- Precio y forma de pago de los anuncios propios y de la tienda destacada.
