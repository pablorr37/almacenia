"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { apiPatch, ApiError } from "@/lib/api-client";

export default function PerfilPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (session?.user?.name) setNombre(session.user.name);
  }, [session?.user?.name]);

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
        <Link href="/login" className="font-semibold text-accent">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-8 px-6 py-8">
      <div className="flex items-center gap-3">
        <Link href="/" aria-label="Volver al mapa" className="flex h-8 w-8 items-center justify-center">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#201A15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[20px] font-bold text-primary-dark">Mi cuenta</h1>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input
          id="perfil-nombre"
          label="Nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
        <Input id="perfil-email" label="Email" value={session?.user?.email ?? ""} disabled readOnly />

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
