"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { apiGet, ApiError } from "@/lib/api-client";

type Rol = "comprador" | "vendedor" | "admin";
type Plan = "free" | "premium";

type UsuarioAdmin = {
  id: string;
  nombre: string;
  email: string;
  esComprador: boolean;
  esVendedor: boolean;
  esAdmin: boolean;
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

export default function AdminUsuariosPage() {
  const { status } = useSession();
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [rol, setRol] = useState<Rol | "">("");
  const [plan, setPlan] = useState<Plan | "">("");
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    const sp = new URLSearchParams();
    if (rol) sp.set("rol", rol);
    if (plan) sp.set("plan", plan);

    apiGet<UsuarioAdmin[]>(`/api/admin/usuarios?${sp.toString()}`)
      .then(setUsuarios)
      .catch((err) => {
        if (err instanceof ApiError && err.code === "FORBIDDEN") {
          setForbidden(true);
        } else {
          setError(err instanceof ApiError ? err.message : "No se pudieron cargar los usuarios.");
        }
      });
  }, [status, rol, plan]);

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

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="Volver al panel" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Usuarios</h1>
      </div>

      <div className="flex gap-2">
        <select
          value={rol}
          onChange={(e) => setRol(e.target.value as Rol | "")}
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
          onChange={(e) => setPlan(e.target.value as Plan | "")}
          className="min-w-0 flex-grow rounded-control border border-border bg-surface px-2.5 py-2 text-[13px]"
        >
          {PLANES.map((p) => (
            <option key={p.valor} value={p.valor}>
              {p.etiqueta}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}

      <div className="flex flex-col gap-2.5">
        {usuarios.length === 0 && !error && (
          <p className="py-6 text-center text-[13px] text-text-2">No hay usuarios con estos filtros.</p>
        )}
        {usuarios.map((u) => (
          <div key={u.id} className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold">{u.nombre}</span>
              {u.tienda && (
                <span
                  className={`rounded-pill px-2.5 py-1 text-[11px] font-bold ${
                    u.tienda.plan === "premium" ? "bg-accent text-white" : "bg-placeholder text-text-2"
                  }`}
                >
                  {u.tienda.plan === "premium" ? "PREMIUM" : "FREE"}
                </span>
              )}
            </div>
            <div className="text-[12px] text-text-2">{u.email}</div>
            <div className="flex flex-wrap gap-1.5 text-[11px] text-text-2">
              {u.esComprador && <span className="rounded-pill bg-placeholder px-2 py-0.5">Comprador</span>}
              {u.esVendedor && <span className="rounded-pill bg-placeholder px-2 py-0.5">Vendedor</span>}
              {u.esAdmin && <span className="rounded-pill bg-placeholder px-2 py-0.5">Admin</span>}
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-text-2">{u.cantidadVentas} venta{u.cantidadVentas !== 1 ? "s" : ""}</span>
              {u.tienda && (
                <Link href={`/admin/productos?tiendaId=${u.tienda.id}`} className="font-semibold text-accent-text">
                  Ver productos →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
