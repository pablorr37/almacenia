# Módulo: radio de alcance

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md) (plan del usuario), [`02-tiendas.md`](02-tiendas.md)
(`GET /api/tiendas/cercanas`), [`10-planes.md`](10-planes.md) y
[`12-gamificacion.md`](12-gamificacion.md) (puntos).

Cada usuario logueado ve en el mapa las tiendas que están dentro de su **radio de
alcance**, dibujado como un círculo alrededor de su ubicación. El radio depende de su
**plan** y, en plan free, de sus **puntos**: cuanto más usa la app, más lejos llega.

## Modelo de datos

```sql
ALTER TYPE plan ADD VALUE 'plata';
ALTER TABLE usuarios ADD COLUMN plan plan NOT NULL DEFAULT 'free';
```

- El enum `plan` pasa a ser `free | premium | plata` y lo usan tanto `usuarios.plan`
  (este módulo) como `tiendas.plan` (`10-planes.md`).
- `usuarios.plan` es el plan **del usuario**, como comprador y como vendedor. Desde la
  ronda 3, `tiendas.plan` es una copia del plan del dueño (`20-precios-facturacion.md`).

## Reglas de negocio

### Radio según plan y puntos

| Plan | Puntos (`p`) | Radio |
| --- | --- | --- |
| free | `p < 100` | 3 km |
| free | `100 ≤ p < 500` | `3 + 4·(1 − (1 − x)²)`, con `x = (p − 100) / 400` |
| free | `500 ≤ p < 1500` | `7 + 3·(1 − (1 − x)⁴)`, con `x = (p − 500) / 1000` |
| free | `1500 ≤ p < 2000` | `10 + (p − 1500) / 100` |
| free | `p ≥ 2000` | 15 km |
| premium | — | 15 km |
| plata | — | toda la provincia de San Juan (sin círculo) |

- Los tramos 100–500 y 500–1500 son **cóncavos**: el radio crece cada vez menos a
  medida que se suman puntos. El segundo tramo crece muy rápido entre 500 y 700
  puntos (de 7 a ~9,9 km) y muy lento después.
- El tramo 1500–2000 es **lineal**: 1 km cada 100 puntos.
- La función es continua y no decreciente en `p`: 3 km en 100, 7 km en 500, 10 km
  en 1500 y 15 km en 2000.
- Los puntos son el total de `eventos_puntos` del usuario (`totalPuntos`,
  `12-gamificacion.md`). Un total negativo cuenta como 0.
- **Provincia de San Juan** (plan plata): el rectángulo latitud −32,6 a −28,4 y
  longitud −70,6 a −66,9. Es una aproximación por rectángulo; no se usa el polígono
  exacto de la provincia.

### Próximo umbral

Para motivar a sumar puntos, en plan free con radio menor a 15 km se informa el
**próximo km entero**: `radioKm = ⌊radio⌋ + 1` y los puntos mínimos (enteros, hacia
arriba) para llegar a él, calculados con la inversa del tramo que corresponde. En
premium, plata o con 15 km es `null`.

Ejemplos: 0 puntos → `{ radioKm: 4, puntos: 154 }`; 300 puntos (6 km) →
`{ radioKm: 7, puntos: 500 }`.

### Búsqueda de tiendas en el mapa

`GET /api/tiendas/cercanas` (`02-tiendas.md`) aplica el alcance **solo con sesión**:

- sin `radioKm`, busca con el radio de alcance del usuario;
- con `radioKm`, usa el menor entre el pedido y el alcance (el pedido se sigue
  validando: mayor a 0 y hasta 50 km, si no `400 RADIO_INVALIDO`);
- plan plata: busca en todo el rectángulo de San Juan, sin límite de 50 km, y
  `radioKm` se ignora.

**Sin sesión** no cambia nada: la lista del invitado (`HomeInvitado`) no es un mapa
de alcance, sino una vitrina para invitar a registrarse, y sigue pidiendo hasta 50 km
desde el centro de San Juan.

### Mapa

- Círculo semitransparente del radio de alcance alrededor de la ubicación del
  usuario. En plan plata no hay círculo.
- Chip con el alcance: "Alcance 3 km", y debajo "154 pts más → 4 km" cuando hay
  próximo umbral, o "Toda San Juan" en plata.
- El encuadre inicial incluye el círculo completo.

### Admin

El admin cambia el plan de un usuario desde `/admin/usuarios` con
`PATCH /api/admin/usuarios/:id` `{ plan }` (`11-admin.md`). Mientras no haya cobro
integrado es la única forma de cambiarlo.

## Endpoints REST

### `GET /api/alcance`

Público. Con sesión devuelve el alcance del usuario; sin sesión, `invitado: true` y
el alcance de un free con 0 puntos (solo informativo: la búsqueda del invitado no se
limita, ver arriba).

Response `200`:

```ts
{
  data: {
    invitado: boolean;
    plan: 'free' | 'premium' | 'plata';
    puntos: number;
    radioKm: number | null;      // null en plata (toda la provincia)
    provincia: boolean;          // true en plata
    proximoUmbral: { radioKm: number; puntos: number } | null;
  }
}
```

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/alcance/alcance.ts`.

```ts
type Plan = 'free' | 'premium' | 'plata';

// Rectángulo de la provincia de San Juan.
const SAN_JUAN: { latMin: number; latMax: number; lonMin: number; lonMax: number };

// Radio en km; null = toda la provincia (plata). Función pura.
function radioAlcanceKm(plan: Plan, puntos: number): number | null;

// Próximo km entero y puntos para llegar; null si no aplica. Función pura.
function proximoUmbral(plan: Plan, puntos: number): { radioKm: number; puntos: number } | null;

interface Alcance {
  invitado: boolean;
  plan: Plan;
  puntos: number;
  radioKm: number | null;
  provincia: boolean;
  proximoUmbral: { radioKm: number; puntos: number } | null;
}

// Alcance del usuario (plan desde la DB, puntos con totalPuntos). null = invitado.
function obtenerAlcance(usuarioId: string | null): Promise<Alcance>;
```

## Errores

Este módulo no agrega códigos nuevos. `PATCH /api/admin/usuarios/:id` con un plan
inválido devuelve `400 PLAN_INVALIDO` (`11-admin.md`).
