# Ronda 3: precio = costo + ganancia + impuestos, facturación, balance por plan, plan Plata

Estado: **hecha** (ver "Ronda 3: qué quedó hecho" en `../memoria.md` y la spec `specs/sdd/20-precios-facturacion.md`). Lo de abajo es el borrador original. Ver el pedido textual en [`../memoria.md`](../memoria.md), punto 1.

## Composición del precio (contabilidad, Argentina)
- **Costo** de compra del producto, sin IVA si la tienda es responsable inscripta.
- **Margen de ganancia** (% sobre el costo, o markup) → **precio neto** = costo × (1 + margen).
- **Impuestos:**
  - **IVA** según la alícuota del producto (21 % general, 10,5 % algunos alimentos, 27 %, exento);
  - opcionales: **impuestos internos** (bebidas alcohólicas, cigarrillos) y percepciones;
  - **precio final al consumidor** = neto + IVA + internos.
- **Monotributo:** se factura sin discriminar IVA (factura C). El precio final es el que cobra, y el costo incluye el IVA de compra.
- El vendedor puede cargar **el costo y el margen** (y la app calcula el precio) **o el precio final** (y la app muestra el margen resultante).
- Se guardan `costo`, `margen`, `alicuota_iva` e `impuestos_internos` en `productos`, y el precio final resultante.
- Cada ítem vendido guarda **una foto del costo y de los impuestos** en el momento de la venta, para el balance histórico.

## Datos para facturar
- **Por tienda:** razón social, CUIT, condición frente al IVA, ingresos brutos, domicilio fiscal, punto de venta, fecha de inicio de actividades.
- **Por venta:** tipo de comprobante (A/B/C, ticket), número, cliente (CUIT/DNI o consumidor final), neto, IVA discriminado y total.
- **Integración con ARCA (ex AFIP), WSFEv1:** se deja la interfaz `Facturador` lista, con un adaptador "sin facturación". La conexión real, que requiere certificado del contribuyente, queda a confirmar.

## Balance por plan
| Plan | Balance |
| --- | --- |
| free | **Básico**: ventas del día, la semana y el mes; cobrado / por cobrar; productos más vendidos. |
| premium | **Sólido**: lo anterior más el costo de lo vendido, la ganancia bruta, el margen por producto y categoría, la valorización del stock, y comparativos por período. |
| plata | **Completo**: lo anterior más IVA débito/crédito, el libro de ventas exportable (CSV/Excel), el flujo de caja por medio de pago, la rentabilidad por tienda o sucursal, y alertas (stock, margen negativo). |
| gold | "Casi admin": otra ronda. |

## Plan Plata
- Enum `plan` + `plata` (la ronda 1 ya lo agrega en `usuarios`).
- El plan de la tienda se unifica con el de su dueño.
- Hay que definir los precios de los planes y el gating de features (`src/lib/planes/planes.ts`).
