"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGetPaginado, apiPatch, apiDelete, ApiError } from "@/lib/api-client";

type Rol = "comprador" | "vendedor" | "admin";
type EstadoCuenta = "activa" | "pausada" | "baneada";
type Plan = "free" | "premium";
// Plan del usuario (18-alcance.md): define su radio de alcance en el mapa.
type PlanUsuario = "free" | "premium" | "plata";

type TiendaAdmin = { id: string; nombre: string; plan: Plan; verificada: boolean };

type UsuarioAdmin = {
  id: string;
  nombre: string;
  email: string;
  esComprador: boolean;
  esVendedor: boolean;
  esAdmin: boolean;
  esTester: boolean;
  plan: PlanUsuario;
  estadoCuenta: EstadoCuenta;
  motivoSuspension: string | null;
  tiendas: TiendaAdmin[]; // propias (19-equipo-tienda.md)
  cantidadVentas: number;
};

const ROLES: Array<{ valor: Rol | ""; etiqueta: string }> = [
  { valor: "", etiqueta: "Todos los roles" },
  { valor: "comprador", etiqueta: "Comprador" },
  { valor: "vendedor", etiqueta: "Vendedor" },
  { valor: "admin", etiqueta: "Admin" },
];

const PLANES: Array<{ valor: Plan | ""; etiqueta: string }> = [
  { valor: "", etiqueta: "Cualquier plan" },
  { valor: "free", etiqueta: "Free" },
  { valor: "premium", etiqueta: "Premium" },
];

const ESTADOS: Array<{ valor: EstadoCuenta | ""; etiqueta: string }> = [
  { valor: "", etiqueta: "Cualquier estado" },
  { valor: "activa", etiqueta: "Activas" },
  { valor: "pausada", etiqueta: "Pausadas" },
  { valor: "baneada", etiqueta: "Baneadas" },
];

const PAGE_SIZE = 20;

// 11-admin.md: todos los usuarios (búsqueda + paginación), con las acciones del
// admin sobre cada tienda: plan free/premium y verificación.
export default function AdminUsuariosPage() {
  const { status } = useSession();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [q, setQ] = useState("");
  const [rol, setRol] = useState<Rol | "">("");
  const [plan, setPlan] = useState<Plan | "">("");
  const [estado, setEstado] = useState<EstadoCuenta | "">("");
  const [aEliminar, setAEliminar] = useState<UsuarioAdmin | null>(null);
  const [confirmacion, setConfirmacion] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  // La búsqueda espera a que se deje de escribir y vuelve a la primera página.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(busqueda.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(id);
  }, [busqueda]);

  useEffect(() => {
    if (status !== "authenticated") return;
    const sp = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (q) sp.set("q", q);
    if (rol) sp.set("rol", rol);
    if (plan) sp.set("plan", plan);
    if (estado) sp.set("estadoCuenta", estado);

    apiGetPaginado<UsuarioAdmin>(`/api/admin/usuarios?${sp.toString()}`)
      .then((r) => {
        setUsuarios(r.data);
        setTotal(r.total);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudieron cargar los usuarios.");
        }
      });
  }, [status, q, rol, plan, estado, page]);

  function reemplazar(id: string, cambios: Partial<UsuarioAdmin>) {
    setUsuarios((prev) => prev.map((x) => (x.id === id ? { ...x, ...cambios } : x)));
  }

  async function ejecutar(id: string, accion: () => Promise<void>, mensajeError: string) {
    setProcesando(id);
    setError(null);
    try {
      await accion();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : mensajeError);
    } finally {
      setProcesando(null);
    }
  }

  // 11-admin.md: el tester es curador del banco de fotos (16-banco-fotos.md).
  function alternarTester(u: UsuarioAdmin) {
    return ejecutar(
      u.id,
      async () => {
        const actualizado = await apiPatch<UsuarioAdmin>(`/api/admin/usuarios/${u.id}`, { esTester: !u.esTester });
        reemplazar(u.id, actualizado);
      },
      "No se pudo cambiar el rol de tester."
    );
  }

  // 10-planes.md: premium habilita fotos propias y prioridad en el mapa.
  function reemplazarTienda(u: UsuarioAdmin, cambiada: TiendaAdmin) {
    reemplazar(u.id, { tiendas: u.tiendas.map((t) => (t.id === cambiada.id ? cambiada : t)) });
  }

  function cambiarPlan(u: UsuarioAdmin, tienda: TiendaAdmin) {
    const nuevo: Plan = tienda.plan === "premium" ? "free" : "premium";
    const texto =
      nuevo === "premium"
        ? `¿Pasar "${tienda.nombre}" a Premium? Va a poder subir fotos propias y aparecer primero en el mapa.`
        : `¿Volver "${tienda.nombre}" a Free?`;
    if (!window.confirm(texto)) return;
    return ejecutar(
      u.id,
      async () => {
        await apiPatch(`/api/admin/tiendas/${tienda.id}/plan`, { plan: nuevo });
        reemplazarTienda(u, { ...tienda, plan: nuevo });
      },
      "No se pudo cambiar el plan."
    );
  }

  function cambiarPlanUsuario(u: UsuarioAdmin, plan: PlanUsuario) {
    ejecutar(
      u.id,
      async () => {
        const actualizado = await apiPatch<UsuarioAdmin>(`/api/admin/usuarios/${u.id}`, { plan });
        reemplazar(u.id, { plan: actualizado.plan });
      },
      "No se pudo cambiar el plan del usuario."
    );
  }

  function alternarVerificacion(u: UsuarioAdmin, tienda: TiendaAdmin) {
    const verificada = !tienda.verificada;
    if (!verificada && !window.confirm(`¿Quitar la verificación de "${tienda.nombre}"?`)) return;
    return ejecutar(
      u.id,
      async () => {
        await apiPatch(`/api/admin/tiendas/${tienda.id}/verificacion`, { verificada });
        reemplazarTienda(u, { ...tienda, verificada });
      },
      "No se pudo cambiar la verificación."
    );
  }

  // 01-auth.md / 11-admin.md: pausar (temporal), banear (sanción) o reactivar.
  function cambiarEstado(u: UsuarioAdmin, nuevo: EstadoCuenta) {
    let motivo: string | undefined;
    if (nuevo === "baneada") {
      const respuesta = window.prompt(`Motivo del baneo de ${u.nombre} (opcional):`, "");
      if (respuesta === null) return;
      motivo = respuesta;
    } else if (nuevo === "pausada" && !window.confirm(`¿Pausar la cuenta de ${u.nombre}? No va a poder entrar y su tienda deja de verse.`)) {
      return;
    }
    return ejecutar(
      u.id,
      async () => {
        const actualizado = await apiPatch<UsuarioAdmin>(`/api/admin/usuarios/${u.id}`, { estadoCuenta: nuevo, motivo });
        reemplazar(u.id, actualizado);
      },
      "No se pudo cambiar el estado de la cuenta."
    );
  }

  async function confirmarEliminacion() {
    if (!aEliminar) return;
    const u = aEliminar;
    await ejecutar(
      u.id,
      async () => {
        await apiDelete(`/api/admin/usuarios/${u.id}`, { confirmacionEmail: confirmacion });
        setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
        setTotal((t) => Math.max(0, t - 1));
        setAEliminar(null);
        setConfirmacion("");
      },
      "No se pudo eliminar el usuario."
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión.</p>
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">Esta sección es solo para administradores.</p>
        <Link href="/" className="font-semibold text-accent-text">
          Volver al inicio
        </Link>
      </div>
    );
  }

  const desde = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const hasta = Math.min(page * PAGE_SIZE, total);
  const ultimaPagina = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Usuarios</h1>
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre, email o tienda"
        aria-label="Buscar usuarios"
        className="h-11 rounded-control border border-border bg-surface px-3.5 text-[14px] focus:border-primary focus:outline-none"
      />

      <div className="flex gap-2">
        <select
          value={rol}
          onChange={(e) => {
            setRol(e.target.value as Rol | "");
            setPage(1);
          }}
          aria-label="Filtrar por rol"
          className="min-w-0 flex-grow rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
        >
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.etiqueta}
            </option>
          ))}
        </select>
        <select
          value={plan}
          onChange={(e) => {
            setPlan(e.target.value as Plan | "");
            setPage(1);
          }}
          aria-label="Filtrar por plan"
          className="min-w-0 flex-grow rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
        >
          {PLANES.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.etiqueta}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => {
            setEstado(e.target.value as EstadoCuenta | "");
            setPage(1);
          }}
          aria-label="Filtrar por estado de cuenta"
          className="min-w-0 flex-grow rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
        >
          {ESTADOS.map((e) => (
            <option key={e.valor} value={e.valor}>
              {e.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[12px] text-text-2" data-testid="rango-usuarios">
        {total === 0 ? "Sin resultados" : `Mostrando ${desde}–${hasta} de ${total} usuario${total === 1 ? "" : "s"}`}
      </p>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      <div className="flex flex-col gap-2.5">
        {usuarios.length === 0 && !error && (
          <p className="py-6 text-center text-[13px] text-text-2">No hay usuarios con estos filtros.</p>
        )}
        {usuarios.map((u) => (
          <div key={u.id} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <span className="text-[14px] font-semibold">{u.nombre}</span>
                <span className="truncate text-[12px] text-text-2">{u.email}</span>
              </div>
              <span
                className={`flex-shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-bold ${
                  u.plan === "free" ? "bg-placeholder text-text-2" : "bg-accent text-white"
                }`}
              >
                {u.plan.toUpperCase()}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-text-2">
              {u.esComprador && <span className="rounded-pill bg-placeholder px-2 py-0.5">Comprador</span>}
              {u.esVendedor && <span className="rounded-pill bg-placeholder px-2 py-0.5">Vendedor</span>}
              {u.esAdmin && <span className="rounded-pill bg-placeholder px-2 py-0.5">Admin</span>}
              {u.esTester && <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-primary-dark">Tester</span>}
              {u.estadoCuenta !== "activa" && (
                <span className="rounded-pill bg-estado-rechazado-bg px-2 py-0.5 font-bold text-estado-rechazado-text">
                  {u.estadoCuenta === "pausada" ? "PAUSADA" : "BANEADA"}
                </span>
              )}
            </div>
            {u.motivoSuspension && <p className="text-[12px] italic text-text-2">Motivo: {u.motivoSuspension}</p>}

            {u.tiendas.map((tienda) => (
              <div key={tienda.id} className="flex flex-col gap-2 rounded-control bg-bg p-2.5">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate font-semibold">
                    {tienda.nombre}{" "}
                    <span className={`text-[11px] font-bold ${tienda.plan === "premium" ? "text-accent-text" : "text-text-2"}`}>
                      {tienda.plan === "premium" ? "PREMIUM" : "FREE"}
                    </span>
                  </span>
                  {tienda.verificada ? (
                    <span className="flex-shrink-0 text-[12px] font-semibold text-primary">✓ Verificada</span>
                  ) : (
                    <span className="flex-shrink-0 text-[12px] text-text-2">Sin verificar</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={procesando === u.id}
                    onClick={() => cambiarPlan(u, tienda)}
                    className={`press h-9 flex-1 rounded-control text-[12px] font-semibold disabled:opacity-50 ${
                      tienda.plan === "premium" ? "border border-border bg-surface text-text" : "bg-accent text-white"
                    }`}
                  >
                    {tienda.plan === "premium" ? "Volver a Free" : "Pasar a Premium"}
                  </button>
                  <button
                    type="button"
                    disabled={procesando === u.id}
                    onClick={() => alternarVerificacion(u, tienda)}
                    className={`press h-9 flex-1 rounded-control text-[12px] font-semibold disabled:opacity-50 ${
                      tienda.verificada ? "border border-border bg-surface text-text" : "bg-primary text-white"
                    }`}
                  >
                    {tienda.verificada ? "Quitar verificación" : "Verificar tienda"}
                  </button>
                </div>
                <span className="flex gap-3 text-[13px]">
                  <Link href={`/admin/productos?tiendaId=${tienda.id}`} className="font-semibold text-accent-text">
                    Productos
                  </Link>
                  <Link href={`/tiendas/${tienda.id}`} className="font-semibold text-accent-text">
                    Ver tienda →
                  </Link>
                </span>
              </div>
            ))}

            <label className="flex items-center justify-between gap-2 text-[13px] text-text">
              <span>Plan del usuario (radio de alcance)</span>
              <select
                value={u.plan}
                disabled={procesando === u.id}
                onChange={(e) => cambiarPlanUsuario(u, e.target.value as PlanUsuario)}
                aria-label={`Plan de ${u.nombre}`}
                className="h-9 rounded-control border border-border bg-surface px-2 text-[13px] font-semibold"
              >
                <option value="free">Free</option>
                <option value="premium">Premium</option>
                <option value="plata">Plata</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-text">
              <input
                type="checkbox"
                checked={u.esTester}
                disabled={procesando === u.id}
                onChange={() => alternarTester(u)}
                className="h-4 w-4 accent-primary"
              />
              Tester (cura el banco de fotos)
            </label>
            {!u.esAdmin && (
              <div className="flex flex-wrap gap-2">
                {u.estadoCuenta === "activa" ? (
                  <>
                    <button
                      type="button"
                      disabled={procesando === u.id}
                      onClick={() => cambiarEstado(u, "pausada")}
                      className="press h-9 flex-1 rounded-control border border-border bg-surface text-[12px] font-semibold disabled:opacity-50"
                    >
                      Pausar
                    </button>
                    <button
                      type="button"
                      disabled={procesando === u.id}
                      onClick={() => cambiarEstado(u, "baneada")}
                      className="press h-9 flex-1 rounded-control border border-estado-rechazado-text/40 bg-surface text-[12px] font-semibold text-estado-rechazado-text disabled:opacity-50"
                    >
                      Banear
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={procesando === u.id}
                    onClick={() => cambiarEstado(u, "activa")}
                    className="press h-9 flex-1 rounded-control bg-primary text-[12px] font-semibold text-white disabled:opacity-50"
                  >
                    Reactivar
                  </button>
                )}
                <button
                  type="button"
                  disabled={procesando === u.id}
                  onClick={() => {
                    setAEliminar(u);
                    setConfirmacion("");
                  }}
                  className="press h-9 flex-1 rounded-control bg-estado-rechazado-text text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  Eliminar
                </button>
              </div>
            )}
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">
                {u.cantidadVentas} venta{u.cantidadVentas !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="press h-10 flex-1 rounded-control border border-border bg-surface text-[13px] font-semibold disabled:opacity-40"
          >
            ← Anteriores
          </button>
          <span className="text-[12px] text-text-2">
            {page} / {ultimaPagina}
          </span>
          <button
            type="button"
            disabled={page >= ultimaPagina}
            onClick={() => setPage((p) => p + 1)}
            className="press h-10 flex-1 rounded-control border border-border bg-surface text-[13px] font-semibold disabled:opacity-40"
          >
            Siguientes →
          </button>
        </div>
      )}
      {aEliminar && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/40 p-4 sm:items-center" role="presentation" onClick={() => setAEliminar(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="eliminar-titulo"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-md flex-col gap-3 rounded-card bg-surface p-5 shadow-float"
          >
            <h2 id="eliminar-titulo" className="font-display text-[20px] font-bold text-estado-rechazado-text">
              Eliminar a {aEliminar.nombre}
            </h2>
            <p className="text-[13px] text-text-2">
              Se borra la cuenta
              {aEliminar.tiendas.length > 0
                ? `, ${aEliminar.tiendas.length === 1 ? "la tienda" : "las tiendas"} ${aEliminar.tiendas.map((t) => `"${t.nombre}"`).join(", ")} con sus productos, pedidos y ventas`
                : ""}{" "}
              y
              todos sus datos. <strong>No se puede deshacer.</strong> Si solo querés impedir que entre, usá Pausar o Banear.
            </p>
            <label className="flex flex-col gap-1 text-[12px] text-text-2">
              Para confirmar, escribí su email: <strong className="text-text">{aEliminar.email}</strong>
              <input
                value={confirmacion}
                onChange={(e) => setConfirmacion(e.target.value)}
                aria-label="Email de confirmación"
                className="h-11 rounded-control border border-border bg-surface px-3 text-[14px] text-text focus:border-primary focus:outline-none"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAEliminar(null)}
                className="press h-11 flex-1 rounded-control border border-border bg-surface text-[14px] font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={confirmacion.trim().toLowerCase() !== aEliminar.email || procesando === aEliminar.id}
                onClick={confirmarEliminacion}
                className="press h-11 flex-1 rounded-control bg-estado-rechazado-text text-[14px] font-semibold text-white disabled:opacity-40"
              >
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
