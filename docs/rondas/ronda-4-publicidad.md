# Ronda 4: publicidad y pagos con puntos

Estado: **hecha** (2026-10-23). Lo implementado y las decisiones finales están en [`../memoria.md`](../memoria.md) ("Rondas 4 y 5") y en las specs `specs/sdd/21-publicidad.md`, `22-notificaciones.md` y `23-puntos-pagos.md`. Este documento queda como borrador histórico.

Ver en [`../memoria.md`](../memoria.md):
- el pedido del 2026-10-16, punto 2;
- el pedido del 2026-10-17, puntos 1 y 2.

## Documentos de apoyo (listos)

| Documento | Para qué sirve |
| --- | --- |
| [`../tutoriales/publicidad-google-adsense.md`](../tutoriales/publicidad-google-adsense.md) | Paso a paso para dar de alta la cuenta de AdSense y obtener `ca-pub-…`, los slots y `ads.txt`. |
| [`../tutoriales/publicidad-google-ad-manager.md`](../tutoriales/publicidad-google-ad-manager.md) | Cuándo conviene Ad Manager y cómo se configura (GPT, unidades, líneas, backfill con AdSense). |
| [`../tutoriales/publicidad-otros-proveedores.md`](../tutoriales/publicidad-otros-proveedores.md) | Proveedores alternativos para tráfico de Argentina y cómo se suman al rotador. |
| [`../investigacion/motor-de-avisos.md`](../investigacion/motor-de-avisos.md) | Investigación y diseño del motor propio: avisos con imagen o GIF; alta, baja y pausa; rotación; medición; publicidad push. |

## Decisiones del usuario
- **Quién ve anuncios:**
  - los usuarios **free** (compradores y vendedores) ven anuncios rotativos que mezclan **Google**, **otros proveedores** y **anuncios propios de Almacenia**;
  - en el mapa, los usuarios free ven el **nombre de las tiendas que pagan publicidad** junto a su pin;
  - los usuarios **premium y plata** no ven anuncios; ven solo el nombre en el pin.
- **Pedido del 2026-10-17:**
  - los **vendedores pueden pagar publicidad con puntos**;
  - los **compradores pueden pagar el plan premium con puntos**;
  - las **cantidades de puntos se calibran en el panel de admin**.

## Pagar con puntos (pedido del 2026-10-17)

### Modelo
- **Saldo de puntos para gastar** = puntos ganados − puntos gastados.
  - Los gastos se registran como `eventos_puntos` con puntos **negativos**, tipos `canje_publicidad` y `canje_premium`.
  - El historial y la auditoría ya existen en `12-gamificacion.md`.
  - Lo que hoy se calcula con el total de puntos (radio de alcance, `18-alcance.md`) **no** debería bajar al canjear. Propuesta: el alcance usa los **puntos ganados históricos**, es decir, solo los eventos positivos.
  - La pregunta queda abierta en la memoria.
- **Precios en puntos**, editables en el admin como claves de `configuracion_sistema` (`CLAVES_CONFIG` en `src/lib/config/config.ts`). Nada queda fijo en el código. Los valores iniciales de abajo son propuestas:

  | Clave | Por defecto | Qué es |
  | --- | --- | --- |
  | `canje.premium_puntos` | 1500 | Puntos para pasar a premium. |
  | `canje.premium_dias` | 30 | Días de premium que da ese canje. |
  | `canje.publicidad_dia_puntos` | 100 | Puntos por día de campaña propia (aviso en la app). |
  | `canje.publicidad_pin_dia_puntos` | 50 | Puntos por día de "nombre junto al pin" en el mapa. |
  | `canje.publicidad_push_puntos` | 300 | Puntos por un envío de publicidad push (con tope de envíos, ver ronda 5). |

- **Plan con vencimiento:**
  - `usuarios.plan_vence_en` (timestamp, nullable);
  - si vence, el usuario vuelve a free con un job diario o al consultar el plan;
  - un plan que el admin asigna a mano sigue sin vencimiento.
  - Recordar que el plan de la tienda es el del dueño (`20-precios-facturacion.md`).
- **Canje atómico:**
  - en una transacción se verifica el saldo, se inserta el evento negativo y se aplica el beneficio (se extiende el plan o se activa la campaña);
  - con saldo insuficiente, `409 PUNTOS_INSUFICIENTES`.
- **Quién paga la publicidad de una tienda:** el dueño con sus puntos. Que un empleado pueda pagar con los suyos queda abierto.
- **UI:**
  - en "Mis puntos": saldo, "Canjear premium" y el historial de canjes;
  - en mi-tienda: "Publicitar con puntos" (elegir aviso, días y zona, y ver el costo en puntos);
  - en el admin: los precios en puntos en la configuración y un reporte de canjes.

## Infraestructura de publicidad a construir
- **Espacios publicitarios (slots)** en lugares fijos y con medidas fijas, para que no salten al cargar:
  - banner en la lista de tiendas;
  - entre resultados de "Buscar y comparar";
  - en el pie de la tienda;
  - en el menú de inicio.
- **Rotador:**
  - por cada slot elige el proveedor según pesos configurables en el admin: Google, otro proveedor o Almacenia;
  - si el proveedor no llena el espacio, cae al siguiente.
  - Las campañas propias pagadas tienen prioridad sobre las redes.
- **Proveedor Google:**
  - el script se carga solo para usuarios free, después del consentimiento de cookies;
  - los IDs van en variables de entorno.
  - Ver el tutorial.
- **Motor propio:** ver la investigación. En resumen:
  - anunciantes, campañas y piezas (imagen, GIF animado o texto);
  - alta, baja, pausa y aprobación;
  - rotación ponderada con tope de frecuencia;
  - medición de impresiones visibles y clics;
  - "tienda destacada en el mapa";
  - publicidad push, que sale por las notificaciones de la ronda 5.
- **Spec nueva:** `specs/sdd/21-publicidad.md`. El número 20 ya lo usa `20-precios-facturacion.md`.

## Orden propuesto dentro de la ronda
1. Canje de puntos (saldo, `plan_vence_en`, precios en el admin), porque no depende de nada externo.
2. Motor propio: avisos, slots, rotador y medición.
3. "Tienda destacada en el mapa".
4. Proveedor Google y otros proveedores en el rotador (con los IDs que cargue el usuario).
5. Publicidad push: cuando esté la ronda 5, o se adelanta solo la parte de push si se prefiere.

## Pendiente de definir
Ver "Preguntas abiertas → Publicidad" en la memoria:
- IDs de los proveedores;
- precio en dinero, si lo hay;
- unidad de cobro en puntos;
- duración del premium canjeado;
- si el canje baja o no el radio de alcance.
