"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGetPaginado, apiPatch, ApiError } from "@/lib/api-client";

type Rol = "comprador" | "vendedor" | "admin";
type Plan = "free" | "premium";

type UsuarioAdmin = {
  id: string;
  nombre: string;
  email: string;
  esComprador: boolean;
  esVendedor: boolean;
  esAdmin: boolean;
  esTester: boolean;
  tienda: { id: string; nombre: string; plan: Plan; verificada: boolean } | null;
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
  }, [status, q, rol, plan, page]);

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
  function cambiarPlan(u: UsuarioAdmin) {
    if (!u.tienda) return;
    const nuevo: Plan = u.tienda.plan === "premium" ? "free" : "premium";
    const texto =
      nuevo === "premium"
        ? `¿Pasar "${u.tienda.nombre}" a Premium? Va a poder subir fotos propias y aparecer primero en el mapa.`
        : `¿Volver "${u.tienda.nombre}" a Free?`;
    if (!window.confirm(texto)) return;
    const tienda = u.tienda;
    return ejecutar(
      u.id,
      async () => {
        await apiPatch(`/api/admin/tiendas/${tienda.id}/plan`, { plan: nuevo });
        reemplazar(u.id, { tienda: { ...tienda, plan: nuevo } });
      },
      "No se pudo cambiar el plan."
    );
  }

  function alternarVerificacion(u: UsuarioAdmin) {
    if (!u.tienda) return;
    const tienda = u.tienda;
    const verificada = !tienda.verificada;
    if (!verificada && !window.confirm(`¿Quitar la verificación de "${tienda.nombre}"?`)) return;
    return ejecutar(
      u.id,
      async () => {
        await apiPatch(`/api/admin/tiendas/${tienda.id}/verificacion`, { verificada });
        reemplazar(u.id, { tienda: { ...tienda, verificada } });
      },
      "No se pudo cambiar la verificación."
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
          Volver al mapa
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
      </div>

      <p className="text-[12px] text-text-2" data-testid="rango-usuarios">
        {total === 0 ? "Sin resultados" : `Mostrando ${desde}–${hasta} de ${total} usuarios`}
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
              {u.tienda && (
                <span
                  className={`flex-shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-bold ${
                    u.tienda.plan === "premium" ? "bg-accent text-white" : "bg-placeholder text-text-2"
                  }`}
                >
                  {u.tienda.plan === "premium" ? "PREMIUM" : "FREE"}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-text-2">
              {u.esComprador && <span className="rounded-pill bg-placeholder px-2 py-0.5">Comprador</span>}
              {u.esVendedor && <span className="rounded-pill bg-placeholder px-2 py-0.5">Vendedor</span>}
              {u.esAdmin && <span className="rounded-pill bg-placeholder px-2 py-0.5">Admin</span>}
              {u.esTester && <span className="rounded-pill bg-primary-soft px-2 py-0.5 text-primary-dark">Tester</span>}
            </div>

            {u.tienda && (
              <div className="flex flex-col gap-2 rounded-control bg-bg p-2.5">
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate font-semibold">{u.tienda.nombre}</span>
                  {u.tienda.verificada ? (
                    <span className="flex-shrink-0 text-[12px] font-semibold text-primary">✓ Verificada</span>
                  ) : (
                    <span className="flex-shrink-0 text-[12px] text-text-2">Sin verificar</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={procesando === u.id}
                    onClick={() => cambiarPlan(u)}
                    className={`press h-9 flex-1 rounded-control text-[12px] font-semibold disabled:opacity-50 ${
                      u.tienda.plan === "premium" ? "border border-border bg-surface text-text" : "bg-accent text-white"
                    }`}
                  >
                    {u.tienda.plan === "premium" ? "Volver a Free" : "Pasar a Premium"}
                  </button>
                  <button
                    type="button"
                    disabled={procesando === u.id}
                    onClick={() => alternarVerificacion(u)}
                    className={`press h-9 flex-1 rounded-control text-[12px] font-semibold disabled:opacity-50 ${
                      u.tienda.verificada ? "border border-border bg-surface text-text" : "bg-primary text-white"
                    }`}
                  >
                    {u.tienda.verificada ? "Quitar verificación" : "Verificar tienda"}
                  </button>
                </div>
              </div>
            )}

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
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">
                {u.cantidadVentas} venta{u.cantidadVentas !== 1 ? "s" : ""}
              </span>
              {u.tienda && (
                <span className="flex gap-3">
                  <Link href={`/admin/productos?tiendaId=${u.tienda.id}`} className="font-semibold text-accent-text">
                    Productos
                  </Link>
                  <Link href={`/tiendas/${u.tienda.id}`} className="font-semibold text-accent-text">
                    Ver tienda →
                  </Link>
                </span>
              )}
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
    </div>
  );
}
