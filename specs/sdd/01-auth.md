# Módulo: auth

Convenciones comunes: ver [`00-overview.md`](00-overview.md).

## Modelo de datos

```sql
CREATE TABLE usuarios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  es_comprador   BOOLEAN NOT NULL DEFAULT true,
  es_vendedor    BOOLEAN NOT NULL DEFAULT false,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Sin tabla de sesiones propia: la sesión la maneja NextAuth (JWT o adapter de base de
datos, a decidir en la tarea de implementación — no es parte de este SDD).

No hay una columna `rol` única: `es_comprador` y `es_vendedor` son independientes, un
mismo usuario puede tener ambas en `true` a la vez (ver reglas de negocio).

## Reglas de negocio

- `email` es único y case-insensitive (se normaliza a minúsculas antes de guardar).
- **`es_comprador` nace en `true` para todo usuario** y no requiere ningún proceso de
  validación — comprar no tiene barrera de entrada.
- **`es_vendedor` nace en `false`** y pasa a `true` automáticamente, como efecto de
  `crearTienda` (ver `02-tiendas.md`), cuando el usuario completa el alta de su tienda
  (nombre, ubicación, etc.). No existe un endpoint separado para "activar" el rol de
  vendedor: se activa solo al crear la tienda, en la misma operación.
- Un usuario puede registrarse con la intención de vender y crear su tienda de
  entrada, sin pasar primero por ninguna acción de comprador — los dos caminos
  (registrarse para comprar, registrarse para vender) usan el mismo
  `POST /api/auth/registro`; lo único que distingue a un vendedor es haber
  completado el alta de tienda.
- `es_vendedor` no se revierte a `false` automáticamente por ninguna acción del MVP
  (ni siquiera desactivar la tienda, `activa = false` en `02-tiendas.md`) — una vez
  vendedor, el usuario conserva acceso a su panel de gestión aunque pause la tienda.
- `password_hash` se genera con bcrypt (o equivalente), nunca se guarda ni se devuelve
  la contraseña en texto plano en ninguna respuesta.

## Endpoints REST

Todos públicos (no requieren sesión previa).

### `POST /api/auth/registro`

Request:

```ts
{ email: string; password: string; nombre: string }
```

Response `201`:

```ts
{ data: { id: string; email: string; nombre: string; esComprador: boolean; esVendedor: boolean } }
```

`esComprador` nace `true` y `esVendedor` nace `false` siempre — no son parte del input
de registro (ver reglas de negocio).

### `POST /api/auth/login`

Delegado al flujo estándar de NextAuth (`/api/auth/[...nextauth]`), no se especifica
payload propio acá.

### `PATCH /api/auth/perfil`

Requiere sesión válida. Permite al usuario autenticado editar su propio perfil.

Request: `{ nombre?: string }`

Response `200`: `{ data: Usuario }`. `400 NOMBRE_INVALIDO` si `nombre` viene vacío o
solo espacios.

## Firmas de funciones/clases TypeScript

Ubicación: `src/lib/auth/`.

```ts
interface Usuario {
  id: string;
  email: string;
  nombre: string;
  esComprador: boolean;
  esVendedor: boolean;
}

interface RegistrarUsuarioInput {
  email: string;
  password: string;
  nombre: string;
}

async function registrarUsuario(input: RegistrarUsuarioInput): Promise<Usuario>;

async function buscarUsuarioPorEmail(email: string): Promise<Usuario | null>;

async function verificarPassword(email: string, password: string): Promise<Usuario | null>;

// Usada internamente por crearTienda (02-tiendas.md) al completar el alta de tienda.
// No se expone como endpoint propio.
async function activarVendedor(usuarioId: string): Promise<Usuario>;

interface ActualizarPerfilInput {
  nombre?: string;
}

async function actualizarPerfil(usuario: Usuario, input: ActualizarPerfilInput): Promise<Usuario>;
```

## Casos de error a contemplar

| Código                  | Cuándo                                                            |
| ------------------------ | -------------------------------------------------------------------|
| `EMAIL_YA_REGISTRADO`    | `email` ya existe en `usuarios` (comparación case-insensitive).   |
| `EMAIL_INVALIDO`         | `email` no tiene formato válido.                                   |
| `PASSWORD_DEBIL`         | `password` no cumple longitud mínima (8 caracteres).               |
| `CREDENCIALES_INVALIDAS` | Login con email inexistente o password incorrecta (mismo código para ambos casos, para no filtrar qué emails existen). |
| `NOMBRE_INVALIDO`        | `nombre` vacío o solo espacios en `actualizarPerfil`.               |
