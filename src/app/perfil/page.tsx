"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ImageUploadField } from "@/components/ui/ImageUploadField";
import { apiGet, apiPatch, ApiError } from "@/lib/api-client";
import { formatoPuntos } from "@/components/ui/PuntosChip";
import { Estrellas } from "@/components/ui/Estrellas";
import { useConteo } from "@/lib/hooks/useConteo";

function FilaNavegacion({ href, titulo, detalle, i }: { href: string; titulo: string; detalle?: string; i: number }) {
  return (
    <Link
      href={href}
      style={{ "--i": i } as React.CSSProperties}
      className="press-soft stagger flex animate-fade-up items-center justify-between rounded-card border border-border bg-surface px-4 py-3.5 shadow-card"
    >
      <span className="flex flex-col">
        <span className="text-[15px] font-semibold text-text">{titulo}</span>
        {detalle && <span className="text-[12px] text-text-2">{detalle}</span>}
      </span>
      <svg viewBox="0 0 20 20" className="h-5 w-5 text-text-2" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m8 5 5 5-5 5" />
      </svg>
    </Link>
  );
}

export default function PerfilPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [puntos, setPuntos] = useState<number | null>(null);
  const [reputacion, setReputacion] = useState<{ promedio: number | null; cantidad: number } | null>(null);
  const puntosAnimados = useConteo(puntos ?? 0);

  useEffect(() => {
    if (session?.user?.name) setNombre(session.user.name);
  }, [session?.user?.name]);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<{ total: number }>("/api/gamificacion/puntos").then((r) => setPuntos(r.total)).catch(() => {});
    apiGet<{ promedio: number | null; cantidad: number }>("/api/auth/perfil/valoracion").then(setReputacion).catch(() => {});
  }, [status]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setGuardado(false);
    setCargando(true);
    try {
      await apiPatch("/api/auth/perfil", { nombre });
      await update({ name: nombre });
      setGuardado(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo guardar el cambio.");
    } finally {
      setCargando(false);
    }
  }

  async function onSignOut() {
    await signOut({ redirect: false });
    router.push("/");
  }

  if (status === "unauthenticated") {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-text-2">Necesitás iniciar sesión para ver tu perfil.</p>
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-5 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Volver al mapa" className="press flex h-11 w-11 items-center justify-center rounded-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Mi cuenta</h1>
      </div>

      {/* Puntos: tocar lleva al historial (12-gamificacion.md) */}
      <Link
        href="/perfil/puntos"
        aria-label="Ver historial de puntos"
        className="press-soft flex animate-scale-in items-center justify-between rounded-card bg-primary px-5 py-4 text-white shadow-cta"
      >
        <span className="flex flex-col">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-primary-soft">Mis puntos</span>
          <span className="font-display text-[32px] font-bold leading-tight tabular-nums">
            {puntos === null ? "—" : formatoPuntos(Math.round(puntosAnimados * 10) / 10)}
          </span>
          <span className="text-[12px] text-primary-soft">Tocá para ver el historial</span>
        </span>
        <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden="true">
          <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="m8 5 5 5-5 5" />
        </svg>
      </Link>

      {reputacion && (
        <div className="flex animate-fade-up items-center justify-between rounded-card border border-border bg-surface px-4 py-3.5 shadow-card">
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold text-text">Tu reputación como cliente</span>
            <span className="text-[12px] text-text-2">Según las tiendas donde compraste</span>
          </span>
          {reputacion.promedio !== null ? (
            <span className="flex items-center gap-1.5 text-[13px] font-semibold tabular-nums">
              <Estrellas valor={Math.round(reputacion.promedio)} tamano={14} />
              {reputacion.promedio.toFixed(1)}
            </span>
          ) : (
            <span className="text-[12px] text-text-2">Sin valoraciones</span>
          )}
        </div>
      )}

      <nav className="flex flex-col gap-2" aria-label="Secciones de mi cuenta">
        <FilaNavegacion i={0} href="/perfil/pedidos" titulo="Mis pedidos" />
        <FilaNavegacion i={1} href="/listas" titulo="Mis listas de compras" detalle="Armá listas y compará precios entre tiendas" />
        <FilaNavegacion i={2} href="/perfil/puntos" titulo="Historial de puntos" />
      </nav>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <h2 className="text-[15px] font-semibold text-text">Mis datos</h2>
        <Input
          id="perfil-nombre"
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <Input id="perfil-email" label="Email" value={session?.user?.email ?? ""} disabled readOnly />

        <ImageUploadField
          tipo="avatar"
          entidadId=""
          valorActual={session?.user?.image ?? null}
          label="Foto de perfil"
          onSubido={async (url) => {
            try {
              await apiPatch("/api/auth/perfil", { avatarUrl: url });
              await update({ image: url });
            } catch (err) {
              setError(err instanceof ApiError ? err.message : "No se pudo guardar la foto.");
            }
          }}
        />

        {error && <p className="text-[13px] text-estado-rechazado-text">{error}</p>}
        {guardado && (
          <p className="text-[13px] font-semibold text-estado-entregado-text">Cambios guardados.</p>
        )}

        <Button type="submit" disabled={cargando}>
          {cargando ? "Guardando..." : "Guardar cambios"}
        </Button>
      </form>

      <div className="flex-grow" />

      <Button variant="outline" onClick={onSignOut}>
        Cerrar sesión
      </Button>
    </div>
  );
}
