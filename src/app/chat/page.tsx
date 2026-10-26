"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { apiGet } from "@/lib/api-client";
import { useAlVolver } from "@/lib/hooks/useAlVolver";
import { haceCuanto } from "@/components/pedidos/DetallePedido";

// Lista de chats (24-chat.md): los del usuario como comprador y los de cada tienda
// que atiende (permiso pedidos).
type Resumen = {
  id: string;
  otraParte: { id: string; nombre: string };
  ultimoMensaje: { texto: string; creadoEn: string; deTienda: boolean } | null;
  noLeidos: number;
};
type MiTienda = { tienda: { id: string; nombre: string }; permisos: string[] };

function Contenido() {
  const { status } = useSession();
  const params = useSearchParams();
  const [tiendas, setTiendas] = useState<MiTienda[]>([]);
  const [vista, setVista] = useState<string>(params.get("tienda") ?? "comprador");
  const [lista, setLista] = useState<Resumen[] | null>(null);

  const cargar = useCallback(() => {
    const url = vista === "comprador" ? "/api/chat/conversaciones" : `/api/chat/conversaciones?tiendaId=${vista}`;
    apiGet<Resumen[]>(url).then(setLista).catch(() => setLista([]));
  }, [vista]);

  useEffect(() => {
    if (status !== "authenticated") return;
    apiGet<MiTienda[]>("/api/tiendas/mias")
      .then((m) => setTiendas(m.filter((t) => t.permisos.includes("pedidos"))))
      .catch(() => {});
  }, [status]);
  useEffect(() => {
    if (status === "authenticated") cargar();
  }, [status, cargar]);
  useAlVolver(cargar);

  if (status === "unauthenticated") {
    return (
      <p className="p-6 text-center text-text-2">
        <Link href="/login" className="font-semibold text-accent-text">
          Iniciá sesión
        </Link>{" "}
        para ver tus chats.
      </p>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 py-6">
      <div className="flex items-center gap-2">
        <Link href="/" aria-label="Volver al inicio" className="press flex h-11 w-11 items-center justify-center rounded-pill">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="font-display text-[22px] font-bold text-primary-dark">Chats</h1>
      </div>
      {tiendas.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[{ id: "comprador", nombre: "Mis compras" }, ...tiendas.map((t) => t.tienda)].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setLista(null);
                setVista(t.id);
              }}
              className={`flex-shrink-0 rounded-pill px-3.5 py-1.5 text-[13px] font-semibold ${vista === t.id ? "bg-primary text-white" : "border border-border bg-surface text-text"}`}
            >
              {t.nombre}
            </button>
          ))}
        </div>
      )}
      {lista === null ? (
        <div className="h-32 animate-pulse rounded-card bg-placeholder" />
      ) : lista.length === 0 ? (
        <p className="rounded-card border border-border bg-surface p-5 text-center text-[14px] text-text-2">
          {vista === "comprador" ? "Todavía no escribiste a ninguna tienda. Abrí una tienda y tocá «Chat con la tienda»." : "Todavía no te escribió nadie."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((c) => (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className="press-soft flex items-center gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card" data-testid="conversacion">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px] font-semibold text-text">{c.otraParte.nombre}</span>
                  {c.ultimoMensaje && <span className="truncate text-[13px] text-text-2">{c.ultimoMensaje.texto}</span>}
                </span>
                <span className="flex flex-shrink-0 flex-col items-end gap-1">
                  {c.ultimoMensaje && <span className="text-[11px] text-text-2">{haceCuanto(c.ultimoMensaje.creadoEn)}</span>}
                  {c.noLeidos > 0 && <span className="rounded-pill bg-accent px-2 py-0.5 text-[11px] font-bold text-white">{c.noLeidos}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChatsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-text-2">Cargando...</p>}>
      <Contenido />
    </Suspense>
  );
}
