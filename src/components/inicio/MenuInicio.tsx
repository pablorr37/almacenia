"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api-client";
import { ETIQUETA_PLAN, MAX_TIENDAS, planSiguiente, type PlanNombre } from "@/lib/planes/limites";
import { useSession } from "next-auth/react";
import { PuntosChip } from "@/components/ui/PuntosChip";
import { Campanita } from "@/components/notificaciones/Campanita";
import { EspacioPublicitario } from "@/components/publicidad/EspacioPublicitario";
import { useMisTiendas } from "@/lib/hooks/useMisTiendas";
import { ETIQUETA_ROL, puede, type Permiso } from "@/lib/equipo/permisos";

// Menú de inicio del usuario logueado (19-equipo-tienda.md): enlaza a cada función o
// grupo de funciones. "Mi negocio" va primero si gestiona alguna tienda; el mapa es
// un acceso más de "Comprar".

type TiendaMenu = { id: string; nombre: string; activa: boolean };

// Íconos de 24×24 con trazo (mismo estilo que el resto de la app).
const ICONOS = {
  venta: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6M10 21h.01M17 21h.01",
  stock: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  pedidos: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 13l2 2 4-4",
  usuarios: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  balance: "M3 3v18h18M7 15l4-4 3 3 5-6",
  datos: "M3 9 12 3l9 6v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM9 21v-7h6v7",
  sucursal: "M12 5v14M5 12h14",
  mapa: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  lista: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  misPedidos: "M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0",
  puntos: "m12 2 3 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.9 21l1.2-6.8-5-4.9 6.9-1z",
  perfil: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6",
  publicidad: "M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13",
} as const;

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

function Acceso({
  href,
  icono,
  titulo,
  detalle,
  destacado = false,
  i = 0,
}: {
  href: string;
  icono: string;
  titulo: string;
  detalle?: string;
  destacado?: boolean;
  i?: number;
}) {
  return (
    <Link
      href={href}
      style={{ "--i": i } as React.CSSProperties}
      className={`press-soft stagger flex animate-fade-up flex-col gap-2 rounded-card p-3.5 shadow-card ${
        destacado ? "bg-primary text-white" : "border border-border bg-surface text-text"
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-control ${destacado ? "bg-white/15" : "bg-primary-soft text-primary-dark"}`}
      >
        <Icono d={icono} />
      </span>
      <span className="text-[15px] font-semibold leading-tight">{titulo}</span>
      {detalle && <span className={`text-[12px] leading-snug ${destacado ? "text-white/80" : "text-text-2"}`}>{detalle}</span>}
    </Link>
  );
}

export function MenuInicio() {
  const { data: session } = useSession();
  const { lista, activa, elegir } = useMisTiendas<TiendaMenu>(true);
  // Tope de tiendas del plan del usuario (20-precios-facturacion.md).
  const [plan, setPlan] = useState<PlanNombre | null>(null);
  useEffect(() => {
    apiGet<{ plan: PlanNombre }>("/api/alcance")
      .then((a) => setPlan(a.plan))
      .catch(() => {});
  }, []);
  const propias = lista?.filter((m) => m.rol === "propietario").length ?? 0;
  const tope = plan ? MAX_TIENDAS[plan] : null;
  const llegoAlTope = tope !== null && propias >= tope;
  const siguiente = plan ? planSiguiente(plan) : null;
  const nombre = session?.user?.name?.split(" ")[0];

  const t = activa?.tienda.id;
  const conPermiso = (permiso: Permiso | Permiso[] | "propietario") => !!activa && puede(activa, permiso);
  const accesosNegocio = activa
    ? [
        conPermiso("vender") && { href: `/mi-tienda?tienda=${t}&seccion=vender`, icono: ICONOS.venta, titulo: "Nueva venta", detalle: "Punto de venta", destacado: true },
        conPermiso(["productos", "stock", "precios"]) && { href: `/mi-tienda?tienda=${t}&seccion=productos`, icono: ICONOS.stock, titulo: "Stock", detalle: "Productos, precios y stock" },
        conPermiso("pedidos") && { href: `/mi-tienda?tienda=${t}&seccion=pedidos`, icono: ICONOS.pedidos, titulo: "Pedidos", detalle: "Para retirar" },
        conPermiso("usuarios") && { href: `/mi-tienda/equipo?tienda=${t}`, icono: ICONOS.usuarios, titulo: "Usuarios", detalle: "Equipo y permisos" },
        conPermiso("balance") && { href: `/mi-tienda/balance?tienda=${t}`, icono: ICONOS.balance, titulo: "Balance", detalle: "Ventas y cobros" },
        conPermiso("publicidad") && { href: `/mi-tienda/publicidad?tienda=${t}`, icono: ICONOS.publicidad, titulo: "Publicidad", detalle: "Con puntos o pesos" },
        conPermiso("propietario") && { href: `/mi-tienda?tienda=${t}&seccion=tienda`, icono: ICONOS.datos, titulo: "Datos de la tienda", detalle: "Horarios, rubro y más" },
      ].filter((a): a is Exclude<typeof a, false> => !!a)
    : [];

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 bg-bg px-5 pb-10 pt-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-display text-[24px] font-bold leading-tight text-primary-dark">Almacenia</span>
          {nombre && <span className="truncate text-[14px] text-text-2">Hola, {nombre}</span>}
        </div>
        <div className="flex items-center gap-2">
          <PuntosChip />
          <Campanita />
          <Link
            href="/perfil"
            className="press flex h-11 w-11 items-center justify-center rounded-pill border border-border bg-surface text-text shadow-card"
            aria-label="Ir a mi cuenta"
          >
            <Icono d={ICONOS.perfil} />
          </Link>
        </div>
      </header>

      {lista === null ? (
        <div className="h-40 animate-pulse rounded-card bg-placeholder" aria-label="Cargando tus tiendas" />
      ) : lista.length > 0 && activa ? (
        <section aria-labelledby="mi-negocio" className="flex flex-col gap-3">
          <div className="flex items-end justify-between gap-2">
            <div className="flex min-w-0 flex-col">
              <h2 id="mi-negocio" className="text-[12px] font-bold uppercase tracking-wide text-text-2">
                Mi negocio
              </h2>
              {lista.length > 1 ? (
                <select
                  value={activa.tienda.id}
                  onChange={(e) => elegir(e.target.value)}
                  aria-label="Tienda activa"
                  className="mt-1 max-w-full truncate rounded-control border border-border bg-surface px-2 py-1.5 font-display text-[18px] font-bold text-text"
                >
                  {lista.map((m) => (
                    <option key={m.tienda.id} value={m.tienda.id}>
                      {m.tienda.nombre}
                      {m.rol !== "propietario" ? ` (${ETIQUETA_ROL[m.rol].toLowerCase()})` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="truncate font-display text-[20px] font-bold text-text">{activa.tienda.nombre}</span>
              )}
            </div>
            <span className="flex-shrink-0 rounded-pill bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary-dark">
              {ETIQUETA_ROL[activa.rol]}
            </span>
          </div>
          {!activa.tienda.activa && (
            <p className="rounded-control bg-estado-rechazado-bg px-3 py-2 text-[12px] font-semibold text-estado-rechazado-text">
              Esta tienda está desactivada: los compradores no la ven.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            {accesosNegocio.map((a, i) => (
              <Acceso key={a.titulo} {...a} i={i} />
            ))}
          </div>
          {accesosNegocio.length === 0 && (
            <p className="text-[13px] text-text-2">Todavía no tenés permisos en esta tienda. Pedíselos a quien la administra.</p>
          )}
          {llegoAlTope ? (
            <p className="text-[12px] text-text-2" data-testid="tope-sucursales">
              Tenés {propias} de {tope} {tope === 1 ? "tienda" : "tiendas"} de tu plan {ETIQUETA_PLAN[plan!]}.
              {siguiente
                ? ` Con ${ETIQUETA_PLAN[siguiente]} podés tener hasta ${MAX_TIENDAS[siguiente]}.`
                : ""}
            </p>
          ) : (
            <Link href="/mi-tienda?nueva=1" className="press-soft flex items-center gap-2 self-start text-[13px] font-semibold text-accent-text">
              <span className="flex h-6 w-6 items-center justify-center rounded-pill border border-current">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                  <path d={ICONOS.sucursal} />
                </svg>
              </span>
              Nueva sucursal{tope !== null && propias > 0 ? ` (${propias} de ${tope})` : ""}
            </Link>
          )}
        </section>
      ) : (
        <Link
          href="/mi-tienda?nueva=1"
          className="press-soft flex items-center justify-between gap-3 rounded-card border border-dashed border-primary/50 bg-primary-soft/50 px-4 py-3.5"
        >
          <span className="flex flex-col">
            <span className="text-[15px] font-semibold text-primary-dark">¿Tenés un comercio?</span>
            <span className="text-[12px] text-text-2">Publicá tu tienda y vendé desde el celular.</span>
          </span>
          <span className="text-[13px] font-bold text-primary-dark">Publicar →</span>
        </Link>
      )}

      <section aria-labelledby="comprar" className="flex flex-col gap-3">
        <h2 id="comprar" className="text-[12px] font-bold uppercase tracking-wide text-text-2">
          Comprar
        </h2>
        <div className="grid grid-cols-2 gap-2.5">
          <Acceso href="/mapa" icono={ICONOS.mapa} titulo="Mapa" detalle="Tiendas en tu alcance" destacado={!activa} i={0} />
          <Acceso href="/listas" icono={ICONOS.lista} titulo="Listas de compras" detalle="Compará precios" i={1} />
          <Acceso href="/perfil/pedidos" icono={ICONOS.misPedidos} titulo="Mis pedidos" i={2} />
          <Acceso href="/perfil/puntos" icono={ICONOS.puntos} titulo="Mis puntos" detalle="Alcance y canjes" i={3} />
        </div>
      </section>

      {/* 21-publicidad.md: debajo de "Comprar", lejos de los accesos del negocio. */}
      <EspacioPublicitario espacio="inicio" />
    </div>
  );
}
