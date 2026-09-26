"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, ApiError } from "@/lib/api-client";
import { estadoApertura, type HorarioTienda } from "@/lib/tiendas/horarios";
import { useAhora } from "@/lib/hooks/useAhora";
import { EstadoAperturaPill } from "./EstadoAperturaPill";
import { IconoTienda } from "./IconoTienda";

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
  horarios: HorarioTienda[];
};

// Delay de entrada en ms, para la coreografía de la intro.
const d = (ms: number) => ({ animationDelay: `${ms}ms` });

// Home para no logueados con intro animada (docs/auditoria-ui-ux.md §5): el
// wordmark baja desde arriba (anclado al borde superior, como un header), el
// contenido de lectura sube en el sentido de lectura, las tiendas entran
// escalonadas y la barra de acción sube desde el borde inferior.
export function HomeInvitado() {
  const [tiendas, setTiendas] = useState<Tienda[] | null>(null);
  const ahora = useAhora();

  useEffect(() => {
    apiGet<Tienda[]>(`/api/tiendas/cercanas?lat=${LAT_SAN_JUAN}&lon=${LON_SAN_JUAN}&radioKm=50`)
      .then((data) => setTiendas(data.slice(0, 3)))
      .catch((err) => {
        if (err instanceof ApiError) console.error(err.message);
        setTiendas([]);
      });
  }, []);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden bg-bg px-5 pt-8">
      <header className="flex flex-col gap-3 pb-7">
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-11 w-11 animate-scale-in items-center justify-center rounded-control bg-primary text-white shadow-cta"
            style={d(0)}
            aria-hidden="true"
          >
            <IconoTienda className="h-6 w-6" />
          </span>
          <span
            className="animate-[fade-in-down_520ms_var(--ease-decelerate)_both] font-display text-[34px] font-extrabold leading-none tracking-[-0.02em] text-primary-dark"
            style={d(60)}
          >
            Almacenia
          </span>
        </div>
        <h1
          className="animate-fade-up font-display text-[28px] font-bold leading-[1.1] tracking-[-0.01em] text-text"
          style={d(180)}
        >
          Lo del barrio, a una cuadra.
        </h1>
        <p className="animate-fade-up text-[15px] leading-relaxed text-text-2" style={d(240)}>
          Encontrá almacenes, kioscos y verdulerías cerca tuyo, compará precios y armá tu recorrido de compras.
        </p>
      </header>

      <div className="relative flex flex-grow flex-col gap-2.5">
        <div className="animate-fade-in text-[13px] font-semibold text-text-2" style={d(300)}>
          Cerca tuyo
        </div>

        {tiendas === null &&
          [0, 1, 2].map((i) => <div key={i} className="h-[74px] animate-pulse rounded-card bg-placeholder" aria-hidden="true" />)}

        {tiendas?.map((t, i) => (
          <Link
            key={t.id}
            href="/login"
            aria-label={`${t.nombre}: iniciá sesión para ver la tienda`}
            style={d(340 + i * 40)}
            className={`press-soft flex animate-fade-up items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card ${
              i === 2 ? "opacity-60" : ""
            }`}
          >
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-dark">
              <IconoTienda />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="truncate text-[15px] font-semibold text-text">{t.nombre}</div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-2">
                <EstadoAperturaPill estado={estadoApertura(t.horarios, ahora)} />
              </div>
            </div>
          </Link>
        ))}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg to-transparent" />
      </div>

      <div className="sticky bottom-0 flex animate-slide-up flex-col gap-2 bg-bg pb-6 pt-4 text-center" style={d(380)}>
        <Link
          href="/login"
          className="press w-full rounded-control bg-primary px-5 py-4 text-[16px] font-semibold text-white shadow-cta"
        >
          Ver tiendas cerca mío
        </Link>
        <p className="text-[13px] text-text-2">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="font-semibold text-accent-text underline-offset-2 hover:underline">
            Creá una gratis
          </Link>
        </p>
      </div>
    </div>
  );
}
