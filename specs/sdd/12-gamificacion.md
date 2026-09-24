# Módulo: gamificación

Convenciones comunes: ver [`00-overview.md`](00-overview.md). Depende de
[`01-auth.md`](01-auth.md).

**Este documento define solo infraestructura, sin reglas de negocio activas en el
MVP.** No hay puntos, insignias, niveles ni rankings todavía — el objetivo es dejar
un modelo de datos genérico y extensible para cuando se diseñe la gamificación en
sí (qué acciones puntúan, cuánto, qué se desbloquea), sin tener que migrar el
schema en ese momento.

## Modelo de datos

```sql
CREATE TABLE eventos_puntos (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id),
  tipo       TEXT NOT NULL,
  puntos     INTEGER NOT NULL,
  metadata   JSONB,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX eventos_puntos_usuario_id_idx ON eventos_puntos (usuario_id);
```

- `tipo` es un string libre (no un enum cerrado en la base) — ej. `"compra_completada"`,
  `"primera_venta"`, `"resena_dejada"`. Se elige texto en vez de un enum de Postgres
  a propósito: agregar un tipo de evento nuevo cuando se diseñe una regla de
  gamificación futura no debe requerir una migración de schema, solo un valor nuevo
  en el código que llama a `registrarEvento`.
- `puntos` puede ser negativo (para penalizaciones futuras, ej. cancelar un pedido
  reiteradamente) aunque el MVP no genera ningún evento con puntos negativos.
- `metadata` guarda contexto libre del evento (ej. `{ "pedidoId": "..." }`) para
  poder auditar de dónde salió un puntaje sin tener que inferirlo del `tipo`.
- No hay tabla de "logros" ni "niveles" — el total de puntos de un usuario se
  calcula sumando `eventos_puntos.puntos` (`totalPuntos`), no se cachea en
  `Usuario`.

## Reglas de negocio

- Ninguna todavía. `registrarEvento` no se llama automáticamente desde ningún flujo
  de negocio existente (pedidos, ventas, etc.) en este MVP — queda disponible para
  cuando se decida qué acciones puntúan.

## Endpoints REST

Ninguno público en este MVP. `totalPuntos` queda disponible en `src/lib/` para que
una futura UI de perfil lo consuma, sin necesidad de un endpoint propio todavía.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/gamificacion/`.

```ts
interface EventoPuntos {
  id: string;
  usuarioId: string;
  tipo: string;
  puntos: number;
  metadata: Record<string, unknown> | null;
  creadoEn: string;
}

async function registrarEvento(
  usuarioId: string,
  tipo: string,
  puntos: number,
  metadata?: Record<string, unknown>
): Promise<EventoPuntos>;

async function totalPuntos(usuarioId: string): Promise<number>;
```

## Casos de error a contemplar

Ninguno específico — `registrarEvento` no valida reglas de negocio propias en este
MVP (no hay límites, cooldowns, ni validación de `tipo` contra una lista cerrada).
