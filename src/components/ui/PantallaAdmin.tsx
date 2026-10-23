"use client";

import Link from "next/link";

// Estructura común de las secciones del admin de la ronda 4 y 5.
export function PantallaAdmin({
  titulo,
  forbidden,
  sinSesion,
  children,
}: {
  titulo: string;
  forbidden: boolean;
  sinSesion: boolean;
  children: React.ReactNode;
}) {
  if (sinSesion || forbidden) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-text-2">{sinSesion ? "Necesitás iniciar sesión." : "Esta sección es solo para administradores."}</p>
        <Link href={sinSesion ? "/login" : "/"} className="font-semibold text-accent-text">
          {sinSesion ? "Iniciar sesión" : "Volver al inicio"}
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-5 py-6">
      <Link href="/admin" className="text-[13px] font-semibold text-accent-text">
        ← Panel admin
      </Link>
      <h1 className="font-display text-[20px] font-bold text-primary-dark">{titulo}</h1>
      {children}
    </div>
  );
}
