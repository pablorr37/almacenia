# Módulo: precios (costo + ganancia + impuestos), datos para facturar, balance por plan

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`02-tiendas.md`](02-tiendas.md), [`03-productos.md`](03-productos.md),
[`05-ventas.md`](05-ventas.md), [`10-planes.md`](10-planes.md) y
[`19-equipo-tienda.md`](19-equipo-tienda.md). Pedido del usuario: punto 1 de
`docs/memoria.md`; decisiones en `docs/rondas/ronda-3-precios-balance.md`.

## Modelo de datos

```sql
CREATE TYPE condicion_iva AS ENUM ('monotributo', 'responsable_inscripto', 'exento');
CREATE TYPE alicuota_iva AS ENUM ('iva_21', 'iva_10_5', 'iva_27', 'iva_0', 'exento');
CREATE TYPE tipo_comprobante AS ENUM ('A', 'B', 'C');
CREATE TYPE estado_comprobante AS ENUM ('interno', 'autorizado', 'rechazado');

-- Precio del producto: `precio` sigue siendo el precio FINAL al consumidor (lo que se cobra).
ALTER TABLE productos
  ADD COLUMN costo              NUMERIC(12, 2) NULL,          -- costo de compra por unidad (o por kg)
  ADD COLUMN margen             NUMERIC(7, 2)  NULL,          -- % de ganancia sobre el costo (puede ser negativo)
  ADD COLUMN alicuota_iva       alicuota_iva   NOT NULL DEFAULT 'iva_21',
  ADD COLUMN impuestos_internos NUMERIC(5, 2)  NOT NULL DEFAULT 0; -- % sobre el neto

-- Foto fiscal de cada ítem vendido (para el balance histórico y el comprobante).
ALTER TABLE items_venta
  ADD COLUMN costo_unitario    NUMERIC(12, 2) NULL,
  ADD COLUMN alicuota_iva      alicuota_iva   NULL,
  ADD COLUMN neto_unitario     NUMERIC(12, 4) NULL,
  ADD COLUMN iva_unitario      NUMERIC(12, 4) NULL,
  ADD COLUMN internos_unitario NUMERIC(12, 4) NULL;

-- Datos fiscales de la tienda (los edita solo el propietario).
ALTER TABLE tiendas
  ADD COLUMN condicion_iva      condicion_iva NOT NULL DEFAULT 'monotributo',
  ADD COLUMN razon_social       TEXT NULL,
  ADD COLUMN cuit               CHAR(11) NULL,               -- solo dígitos
  ADD COLUMN ingresos_brutos    TEXT NULL,
  ADD COLUMN domicilio_fiscal   TEXT NULL,
  ADD COLUMN punto_venta        INTEGER NULL CHECK (punto_venta BETWEEN 1 AND 99999),
  ADD COLUMN inicio_actividades DATE NULL;

CREATE TABLE comprobantes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id         UUID NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE CASCADE,
  tienda_id        UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  tipo             tipo_comprobante NOT NULL,
  punto_venta      INTEGER NOT NULL,
  numero           INTEGER NOT NULL,
  cliente_doc_tipo TEXT NOT NULL,                -- 'CUIT' | 'DNI' | 'CF'
  cliente_doc      TEXT NULL,
  cliente_nombre   TEXT NULL,
  cliente_condicion condicion_iva NULL,
  neto             NUMERIC(12, 2) NOT NULL,
  iva_por_alicuota JSONB NOT NULL,               -- [{ alicuota, neto, iva }]
  internos         NUMERIC(12, 2) NOT NULL,
  total            NUMERIC(12, 2) NOT NULL,
  estado           estado_comprobante NOT NULL DEFAULT 'interno',
  cae              TEXT NULL,
  cae_vencimiento  DATE NULL,
  emitido_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tienda_id, punto_venta, tipo, numero)
);

-- Numeración correlativa por tienda, punto de venta y tipo.
CREATE TABLE numeracion_comprobantes (
  tienda_id   UUID NOT NULL REFERENCES tiendas(id) ON DELETE CASCADE,
  punto_venta INTEGER NOT NULL,
  tipo        tipo_comprobante NOT NULL,
  ultimo      INTEGER NOT NULL,
  PRIMARY KEY (tienda_id, punto_venta, tipo)
);
```

## Precio = costo + ganancia + impuestos

Tasas de IVA: `iva_21` → 21 %, `iva_10_5` → 10,5 %, `iva_27` → 27 %, `iva_0` y `exento`
→ 0 %. `impuestos_internos` es un % sobre el neto (bebidas alcohólicas, cigarrillos…).

- **Responsable inscripto** (IVA discriminado):
  - neto = costo × (1 + margen / 100)
  - precio final = neto × (1 + iva + internos)
  - el costo se carga **sin** IVA (el IVA de compra es crédito fiscal).
- **Monotributo y exento** (IVA no discriminado, factura C):
  - neto = costo × (1 + margen / 100) — el costo **incluye** el IVA de compra;
  - precio final = neto × (1 + internos);
  - la alícuota de IVA se guarda (por si la tienda cambia de condición) pero no suma.
- El precio final se redondea a 2 decimales.
- **Desglose** de un precio final (para la foto de la venta y el comprobante):
  `neto = final / (1 + iva + internos)` (RI) o `final / (1 + internos)` (monotributo/exento);
  `iva = neto × iva` (RI) o `0`; `internos = final − neto − iva`.
- **Margen desde un precio**: `margen = (neto / costo − 1) × 100`, redondeado a 2
  decimales (puede ser negativo: se vende por debajo del costo).

### Alta y edición de productos (`03-productos.md`)

`CrearProductoInput` y `ActualizarProductoInput` suman `costo?`, `margen?`,
`alicuotaIva?` e `impuestosInternos?`:

- Si viene `precio`, manda el precio; si además hay costo (el que vino o el guardado)
  se recalcula y guarda el `margen`.
- Si **no** viene `precio` y quedan `costo` y `margen` conocidos (los que vinieron o los
  guardados) y cambió alguno de `costo`, `margen`, `alicuotaIva` o `impuestosInternos`,
  se **calcula** el precio.
- Al crear, `precio` es obligatorio salvo que vengan `costo` y `margen`.
- Validaciones: `costo ≥ 0`, `margen` número finito (−100 < margen ≤ 10000),
  `impuestosInternos` entre 0 y 100, `alicuotaIva` del enum. Errores
  `COSTO_INVALIDO`, `MARGEN_INVALIDO`, `ALICUOTA_INVALIDA`, `INTERNOS_INVALIDOS`.
- Permisos (`19-equipo-tienda.md`): `costo`, `margen`, `alicuotaIva` e
  `impuestosInternos` piden `precios` (cambian el precio).
- `Producto` (respuesta) suma `costo`, `margen`, `alicuotaIva`, `impuestosInternos`.
  `costo` y `margen` **solo se devuelven** a quien tiene acceso a la tienda; en las
  vistas públicas (comprador) vienen en `null`.

### Foto fiscal de la venta (`05-ventas.md`)

Al crear cada `ItemVenta` (presencial o desde pedido) se guardan `costoUnitario` (el
costo del producto en ese momento), `alicuotaIva` y el desglose del `precioUnitario`
según la condición de la tienda en ese momento. Las ventas anteriores a este módulo
quedan con esos campos en `null` ("sin costo").

## Datos fiscales de la tienda

- `condicionIva`, `razonSocial`, `cuit`, `ingresosBrutos`, `domicilioFiscal`,
  `puntoVenta`, `inicioActividades` (`YYYY-MM-DD`). Se editan con
  `PATCH /api/tiendas/:id` (solo propietario) y vienen en `Tienda`.
- **CUIT**: 11 dígitos (se aceptan guiones, se guardan solo dígitos) con dígito
  verificador válido (módulo 11, pesos 5,4,3,2,7,6,5,4,3,2). `400 CUIT_INVALIDO`.
- `puntoVenta` entero 1–99999 (`400 PUNTO_VENTA_INVALIDO`).
- **Datos fiscales completos** = `razonSocial`, `cuit`, `domicilioFiscal` y `puntoVenta`.
- Cambiar la condición frente al IVA no reescribe precios: el precio final se mantiene
  y el margen mostrado se recalcula con la nueva condición.

## Comprobantes

- Se emiten **a pedido** desde la venta cobrada (botón "Comprobante"), con
  `POST /api/ventas/:id/comprobante` y los datos del cliente. Uno por venta
  (`409 COMPROBANTE_YA_EMITIDO`). La venta tiene que estar `cobrada`
  (`409 VENTA_NO_COBRADA`) y la tienda con datos fiscales completos
  (`409 DATOS_FISCALES_INCOMPLETOS`).
- **Cliente**: `{ docTipo: 'CF' | 'DNI' | 'CUIT', doc?, nombre?, condicionIva? }`;
  por defecto consumidor final (`CF`). `CUIT` exige un CUIT válido.
- **Tipo**:
  - tienda monotributo o exenta → **C**;
  - tienda responsable inscripta → **A** si el cliente es responsable inscripto con
    CUIT; si no, **B**.
- **Número**: correlativo por (tienda, punto de venta, tipo), atómico
  (`INSERT … ON CONFLICT DO UPDATE SET ultimo = ultimo + 1 RETURNING ultimo`).
- **Importes** (desde la foto fiscal de los ítems): `iva_por_alicuota` agrupa por
  alícuota `{ neto, iva }` (redondeados a 2); `internos` idem; `total = venta.total`;
  `neto = total − Σ iva − internos` (así la suma cierra exacta). En comprobantes C el
  IVA va en 0 y el neto es el total sin internos.
- **Facturador** (`src/lib/facturacion/facturador.ts`): interfaz
  `autorizar(comprobante): Promise<{ estado: 'interno' | 'autorizado' | 'rechazado'; cae?; caeVencimiento? }>`.
  Este módulo trae solo el adaptador **`SinFacturacion`** (devuelve `interno`). La
  conexión real con ARCA (WSFEv1, certificado del contribuyente) queda para otra ronda;
  el adaptador se elige en un solo lugar (`facturadorActivo()`).
- Mientras el estado sea `interno`, la vista imprimible (`/ventas/:id/comprobante`)
  dice **"Comprobante interno — no válido como factura"**.
- Permisos: emitir pide `cobrar` o `vender`; verlo, cualquiera de `vender`, `cobrar`,
  `balance`, o ser el comprador de la venta.

## Plan de la tienda = plan del dueño (`10-planes.md`)

- `usuarios.plan` es la fuente de verdad; `tiendas.plan` es una **copia** del plan del
  propietario (se mantiene para no cambiar sus lecturas): `crearTienda` copia el plan
  del dueño y cambiar el plan del usuario (`PATCH /api/admin/usuarios/:id`) actualiza
  todas sus tiendas en la misma transacción.
- Migración de datos: `usuarios.plan` = el mayor entre el suyo y el de sus tiendas
  (free < premium < plata); después `tiendas.plan` = el del dueño.
- Se elimina `PATCH /api/admin/tiendas/:id/plan` (y `cambiarPlan` de `planes.ts`).
- **Tope de tiendas por plan** (constante `MAX_TIENDAS` en `src/lib/planes/limites.ts`):
  free 1 (ninguna sucursal), premium 3 (2 sucursales), plata 4 (3 sucursales).
  `crearTienda` lanza `409 LIMITE_TIENDAS_PLAN` si el dueño ya llegó al tope.
- **Features por plan**: cada feature declara el plan mínimo (`free < premium < plata`):
  `fotos_personalizadas` y `destacado_prioritario` → premium (como hasta ahora);
  `balance_solido` → premium; `balance_completo` y `exportar_libro_ventas` → plata.
  `tienePermiso(tienda, feature)` compara el plan de la tienda con el mínimo.
  Una función de plan que no se tiene responde `403 PLAN_INSUFICIENTE`.

## Balance por plan (`19-equipo-tienda.md`, "Balance básico")

`GET /api/tiendas/:id/balance` agrega `nivel: 'basico' | 'solido' | 'completo'`
según el plan de la tienda y solo las secciones de ese nivel (las otras vienen
ausentes). Rango, permisos y fechas como en `19-equipo-tienda.md`.

- **Básico (free)**: lo de `19-equipo-tienda.md` + `masVendidos`: top 10 de productos
  por importe cobrado `[{ productoId, nombre, cantidad, total }]`.
- **Sólido (premium)**, además:
  - `resultado`: `{ ingresosNetos, costoVendido, gananciaBruta, margenBruto, itemsSinCosto }`.
    `ingresosNetos` = Σ neto de los ítems cobrados; `costoVendido` = Σ costo × cantidad
    (solo ítems con costo); `gananciaBruta` = ingresos netos de los ítems con costo − su
    costo; `margenBruto` = ganancia / ingresos netos con costo × 100 (o `null`).
  - `porProducto` y `porCategoria`: `[{ id, nombre, cantidad, ingresosNetos, costo, ganancia, margen }]`.
  - `stock`: `{ valorCosto, valorVenta, productosSinCosto }` (productos no eliminados
    de la tienda; valor a hoy, no depende del rango).
  - `comparativo`: el período anterior de igual largo `{ desde, hasta, cobrado, cantidad, gananciaBruta }`
    y variaciones % (`null` si el anterior es 0).
- **Completo (plata)**, además:
  - `impuestos`: `{ ivaPorAlicuota: [{ alicuota, neto, iva }], internos }` (débito fiscal;
    el crédito fiscal necesita un módulo de compras, pendiente).
  - `flujoCaja`: por día y medio de pago `[{ fecha, porMedio: Record<medio, total>, total }]`.
  - `alertas`: `{ stockBajo: [...], margenNegativo: [...], sinCosto: [...] }` —
    `stockBajo` = productos disponibles con stock ≤ configuración del sistema
    `balance.umbral_stock_bajo` (default 3, editable por admin).
  - **Libro de ventas** CSV: `GET /api/tiendas/:id/balance/libro.csv?desde&hasta`
    (`exportar_libro_ventas`): una fila por ítem cobrado — fecha, venta, comprobante
    (tipo-punto-número o vacío), producto, cantidad, precio unitario, neto, alícuota,
    IVA, internos, total de la línea, costo, medio de pago, vendió. Separador `;`,
    decimales con coma, UTF-8 con BOM (abre bien en Excel en español).
  - **Rentabilidad por sucursal**: `GET /api/balance/sucursales?desde&hasta` (dueño
    plata): por cada tienda propia `{ tienda: { id, nombre }, cobrado, cantidad, ingresosNetos, gananciaBruta }`.

## Endpoints REST

- `PATCH /api/tiendas/:id`: suma los datos fiscales (ver arriba).
- `POST /api/ventas/:id/comprobante` — Request `{ cliente? }`. Response `201`: `{ data: Comprobante }`.
- `GET /api/ventas/:id/comprobante` — Response `200`: `{ data: Comprobante & { tienda: datos fiscales; items } }`; `404 COMPROBANTE_NO_ENCONTRADO`.
- `GET /api/tiendas/:id/balance` — con `nivel` y secciones por plan.
- `GET /api/tiendas/:id/balance/libro.csv` — `text/csv`.
- `GET /api/balance/sucursales` — dueño plata.

## Firmas de funciones TypeScript

```ts
// src/lib/precios/precios.ts (puras)
type CondicionIva = 'monotributo' | 'responsable_inscripto' | 'exento';
type AlicuotaIva = 'iva_21' | 'iva_10_5' | 'iva_27' | 'iva_0' | 'exento';
function tasaIva(a: AlicuotaIva): number; // 0.21, 0.105, ...
function calcularPrecio(p: { condicion; costo: number; margen: number; alicuota; internos: number }): number;
function desglosar(precioFinal: number, p: { condicion; alicuota; internos: number }): { neto: number; iva: number; internos: number };
function margenDesde(precioFinal: number, p: { condicion; costo: number; alicuota; internos: number }): number | null;

// src/lib/tiendas/cuit.ts
function normalizarCuit(texto: string): string | null; // 11 dígitos válidos o null

// src/lib/facturacion/comprobantes.ts
function tipoComprobante(emisor: CondicionIva, cliente: { docTipo; condicionIva? }): 'A' | 'B' | 'C';
function emitirComprobante(usuario: Usuario, ventaId: string, cliente?: ClienteComprobante): Promise<Comprobante>;
function obtenerComprobante(usuario: Usuario, ventaId: string): Promise<ComprobanteDetalle>;

// src/lib/planes/limites.ts (sin dependencias de servidor)
const MAX_TIENDAS: Record<Plan, number>;
const ORDEN_PLAN: Record<Plan, number>;
```

## Errores

| Código | Status | Cuándo |
| --- | --- | --- |
| `COSTO_INVALIDO` / `MARGEN_INVALIDO` / `ALICUOTA_INVALIDA` / `INTERNOS_INVALIDOS` | 400 | Datos de precio inválidos. |
| `CUIT_INVALIDO` | 400 | CUIT con formato o dígito verificador inválido. |
| `PUNTO_VENTA_INVALIDO` | 400 | Punto de venta fuera de 1–99999. |
| `DATOS_FISCALES_INCOMPLETOS` | 409 | Emitir comprobante sin razón social, CUIT, domicilio fiscal o punto de venta. |
| `VENTA_NO_COBRADA` | 409 | Emitir comprobante de una venta por cobrar o anulada. |
| `COMPROBANTE_YA_EMITIDO` | 409 | La venta ya tiene comprobante. |
| `COMPROBANTE_NO_ENCONTRADO` | 404 | La venta no tiene comprobante. |
| `LIMITE_TIENDAS_PLAN` | 409 | El dueño llegó al tope de tiendas de su plan. |
| `PLAN_INSUFICIENTE` | 403 | La función pide un plan mayor. |
