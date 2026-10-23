"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Aviso de cookies (21-publicidad.md, Ley 25.326): la elección queda en el navegador.
// Los proveedores de publicidad de terceros (en espera) solo se cargan si se aceptan.
export const CLAVE_COOKIES = "almacenia.cookies";

export function cookiesPublicitariasAceptadas(): boolean {
  try {
    return localStorage.getItem(CLAVE_COOKIES) === "aceptadas";
  } catch {
    return false;
  }
}

export function AvisoCookies() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- el localStorage solo existe en el navegador
      setVisible(localStorage.getItem(CLAVE_COOKIES) === null);
    } catch {
      setVisible(false);
    }
  }, []);

  // No tapar herramientas de trabajo (punto de venta, admin).
  if (!visible || pathname.startsWith("/mi-tienda") || pathname.startsWith("/admin")) return null;

  const elegir = (valor: "aceptadas" | "rechazadas") => {
    try {
      localStorage.setItem(CLAVE_COOKIES, valor);
    } catch {
      // modo privado: se vuelve a preguntar la próxima vez
    }
    setVisible(false);
  };

  return (
    <div role="region" aria-label="Aviso de cookies" className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3">
      <div className="flex w-full max-w-md animate-slide-up flex-col gap-2 rounded-card border border-border bg-surface p-3.5 shadow-float">
        <p className="text-[13px] text-text-2">
          Usamos cookies para tu sesión. Para publicidad de terceros pedimos tu permiso.{" "}
          <Link href="/privacidad" className="font-semibold text-primary-dark underline">
            Más info
          </Link>
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => elegir("rechazadas")} className="press h-11 flex-1 rounded-control border border-border text-[14px] font-semibold text-text">
            Rechazar
          </button>
          <button type="button" onClick={() => elegir("aceptadas")} className="press h-11 flex-1 rounded-control bg-primary text-[14px] font-semibold text-white">
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
