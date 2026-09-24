"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, ApiError } from "@/lib/api-client";

// Centro de San Juan capital — solo para mostrar una vista previa de tiendas
// sin pedirle permiso de geolocalización a alguien que todavía no inició sesión
// (no tiene sentido pedirlo antes de que pueda hacer algo con el resultado).
const LAT_SAN_JUAN = -31.5375;
const LON_SAN_JUAN = -68.5364;

type Tienda = {
  id: string;
  nombre: string;
  direccion: string;
  distanciaKm: number;
};

export function HomeInvitado() {
  const [tiendas, setTiendas] = useState<Tienda[]>([]);

  useEffect(() => {
    apiGet<Tienda[]>(`/api/tiendas/cercanas?lat=${LAT_SAN_JUAN}&lon=${LON_SAN_JUAN}&radioKm=50`)
      .then((data) => setTiendas(data.slice(0, 3)))
      .catch((err) => {
        if (err instanceof ApiError) console.error(err.message);
      });
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-bg px-5 pt-5">
      <div className="flex flex-col gap-1 pb-6">
        <span className="font-display text-[22px] font-bold text-primary-dark">
          Almacenia
        </span>
        <h1 className="font-display text-[26px] font-bold text-text">
          Bienvenido a Almacenia
        </h1>
        <p className="text-[15px] text-text-2">
          Comprá en los almacenes, kioscos y verdulerías de tu barrio.
        </p>
      </div>

      <div className="relative flex flex-grow flex-col gap-2.5 overflow-hidden">
        <div className="text-[13px] font-semibold text-text-2">Cerca tuyo</div>

        {tiendas.slice(0, 2).map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-[0_1px_3px_rgba(32,26,21,0.05)]"
          >
            <div className="h-11 w-11 flex-shrink-0 rounded-pill bg-primary-soft" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="text-[15px] font-semibold text-text">{t.nombre}</div>
              <div className="text-xs text-text-2">{t.direccion}</div>
            </div>
          </div>
        ))}

        {tiendas[2] && (
          <div className="relative h-14 overflow-hidden rounded-card border border-border bg-surface">
            <div className="flex items-center gap-3 p-3.5">
              <div className="h-11 w-11 flex-shrink-0 rounded-pill bg-primary-soft" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="text-[15px] font-semibold text-text">{tiendas[2].nombre}</div>
                <div className="text-xs text-text-2">{tiendas[2].direccion}</div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-bg to-transparent" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg via-bg/90 to-transparent" />
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-bg py-4 text-center">
        <Link
          href="/login"
          className="w-full rounded-control bg-primary px-5 py-4 text-[15px] font-semibold text-white shadow-[0_4px_12px_rgba(14,107,92,0.25)]"
        >
          Iniciá sesión para ver todas las tiendas cerca tuyo
        </Link>
        <p className="text-[13px] text-text-2">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="font-semibold text-accent">
            Creá una
          </Link>
        </p>
      </div>
    </div>
  );
}
