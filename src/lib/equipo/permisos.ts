// Permisos de equipo de tienda (19-equipo-tienda.md). Sin dependencias de servidor:
// lo usan tanto la lógica como la UI.

export type Permiso =
  | "vender"
  | "cobrar"
  | "anular"
  | "precios"
  | "stock"
  | "productos"
  | "fotos"
  | "pedidos"
  | "balance"
  | "usuarios";
export type RolMiembro = "encargado" | "empleado";
export type RolEnTienda = "propietario" | RolMiembro;

export const PERMISOS: readonly Permiso[] = [
  "vender",
  "cobrar",
  "anular",
  "precios",
  "stock",
  "productos",
  "fotos",
  "pedidos",
  "balance",
  "usuarios",
];

export const ETIQUETA_PERMISO: Record<Permiso, string> = {
  vender: "Vender",
  cobrar: "Cobrar ventas",
  anular: "Anular ventas",
  precios: "Cambiar precios",
  stock: "Cambiar stock",
  productos: "Alta, baja y edición de productos",
  fotos: "Cambiar fotos",
  pedidos: "Atender pedidos",
  balance: "Ver el balance",
  usuarios: "Gestionar el equipo",
};

export const ETIQUETA_ROL: Record<RolEnTienda, string> = {
  propietario: "Propietario",
  encargado: "Encargado",
  empleado: "Empleado",
};

export function permisosPorDefecto(rol: RolMiembro): Permiso[] {
  return rol === "encargado" ? PERMISOS.filter((p) => p !== "usuarios") : ["vender", "cobrar"];
}

// ¿Tiene alguno de los permisos? 'propietario' = ser el dueño.
export function puede(acceso: { rol: RolEnTienda; permisos: Permiso[] }, permiso: Permiso | Permiso[] | "propietario"): boolean {
  if (permiso === "propietario") return acceso.rol === "propietario";
  return (Array.isArray(permiso) ? permiso : [permiso]).some((p) => acceso.permisos.includes(p));
}
