# Módulo: auth

Convenciones comunes: ver [`00-overview.md`](00-overview.md).

## Modelo de datos

```sql
CREATE TYPE rol_usuario AS ENUM ('vendedor', 'comprador');

CREATE TABLE usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           rol_usuario NOT NULL,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Sin tabla de sesiones propia: la sesión la maneja NextAuth (JWT o adapter de base de
datos, a decidir en la tarea de implementación — no es parte de este SDD).

## Reglas de negocio

- `email` es único y case-insensitive (se normaliza a minúsculas antes de guardar).
- `rol` se elige al registrarse y **no cambia después** — un usuario es vendedor o
  comprador, no ambos. Si una persona quiere operar como las dos cosas, crea dos
  cuentas con emails distintos (MVP; no se contempla multi-rol).
- `password_hash` se genera con bcrypt (o equivalente), nunca se guarda ni se devuelve
  la contraseña en texto plano en ninguna respuesta.
- Un usuario con rol `vendedor` puede o no tener todavía una `Tienda` creada (la
  creación de la tienda es un paso posterior al registro, ver `02-tiendas.md`).

## Endpoints REST

Todos públicos (no requieren sesión previa).

### `POST /api/auth/registro`

Request:

```ts
{ email: string; password: string; nombre: string; rol: 'vendedor' | 'comprador' }
```

Response `201`:

```ts
{ data: { id: string; email: string; nombre: string; rol: 'vendedor' | 'comprador' } }
```

### `POST /api/auth/login`

Delegado al flujo estándar de NextAuth (`/api/auth/[...nextauth]`), no se especifica
payload propio acá.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/auth/`.

```ts
interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: 'vendedor' | 'comprador';
}

interface RegistrarUsuarioInput {
  email: string;
  password: string;
  nombre: string;
  rol: 'vendedor' | 'comprador';
}

async function registrarUsuario(input: RegistrarUsuarioInput): Promise<Usuario>;

async function buscarUsuarioPorEmail(email: string): Promise<Usuario | null>;

async function verificarPassword(email: string, password: string): Promise<Usuario | null>;
```

## Casos de error a contemplar

| Código                    | Cuándo                                                  |
| -------------------------- | -------------------------------------------------------- |
| `EMAIL_YA_REGISTRADO`      | `email` ya existe en `usuarios` (comparación case-insensitive). |
| `EMAIL_INVALIDO`           | `email` no tiene formato válido.                         |
| `PASSWORD_DEBIL`           | `password` no cumple longitud mínima (8 caracteres).     |
| `ROL_INVALIDO`              | `rol` no es `'vendedor'` ni `'comprador'`.                |
| `CREDENCIALES_INVALIDAS`   | Login con email inexistente o password incorrecta (mismo código para ambos casos, para no filtrar qué emails existen). |
