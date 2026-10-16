"use client";

import { useSession } from "next-auth/react";
import { HomeInvitado } from "@/components/ui/HomeInvitado";
import { MenuInicio } from "@/components/inicio/MenuInicio";

// Pantalla de inicio (19-equipo-tienda.md): sin sesión, la lista de negocios
// cercanos; con sesión, el menú que enlaza a cada función (el mapa es una de ellas).
export default function InicioPage() {
  const { status } = useSession();

  if (status === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-bg text-text-2">Cargando...</div>;
  }

  if (status !== "authenticated") {
    return <HomeInvitado />;
  }

  return <MenuInicio />;
}
