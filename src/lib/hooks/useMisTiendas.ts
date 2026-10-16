"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";
import type { Permiso, RolEnTienda } from "@/lib/equipo/permisos";

// Tiendas propias y donde el usuario es parte del equipo (19-equipo-tienda.md), con la
// tienda activa. La activa es una preferencia del navegador (localStorage); el
// servidor igual chequea el permiso en cada pedido.

export type MiTienda<T> = { tienda: T; rol: RolEnTienda; permisos: Permiso[] };

const CLAVE = "almacenia.tiendaActiva";

function leerGuardada(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarTiendaActiva(id: string): void {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    // Sin almacenamiento (modo privado): se usa la primera.
  }
}

export function useMisTiendas<T extends { id: string }>(activo: boolean, preferida?: string | null) {
  const [lista, setLista] = useState<MiTienda<T>[] | null>(null);
  const [elegida, setElegida] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(
    () =>
      apiGet<MiTienda<T>[]>("/api/tiendas/mias")
        .then((l) => {
          setLista(l);
          setError(null);
        })
        .catch(() => {
          setError("No pudimos cargar tus tiendas.");
          setLista((l) => l ?? []);
        }),
    []
  );

  useEffect(() => {
    if (activo) recargar();
  }, [activo, recargar]);

  const candidata = preferida ?? elegida ?? leerGuardadaSiHayVentana();
  const activa = lista ? lista.find((m) => m.tienda.id === candidata) ?? lista[0] ?? null : null;

  const elegir = useCallback((id: string) => {
    guardarTiendaActiva(id);
    setElegida(id);
  }, []);

  return { lista, activa, elegir, recargar, error };
}

function leerGuardadaSiHayVentana(): string | null {
  return typeof window === "undefined" ? null : leerGuardada();
}
