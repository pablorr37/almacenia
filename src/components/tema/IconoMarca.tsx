"use client";

// Ícono de marca según el rubro del tema: tienda, botella, copa o planta.
import { IconoTienda, PATH_ICONO_TIENDA } from "@/components/ui/IconoTienda";
import type { IconoMarca as TipoIcono } from "@/lib/tema/tema";
import { useTema } from "./TemaProvider";

const PATHS: Record<Exclude<TipoIcono, "tienda">, string> = {
  botella: "M10 2h4M10.5 2v3.2c0 .9-.4 1.7-1 2.3A4 4 0 0 0 8 10.6V20a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-9.4a4 4 0 0 0-1.5-3.1c-.6-.6-1-1.4-1-2.3V2M8 13h8M8 17h8",
  copa: "M7 2h10l-.6 5.5A4.4 4.4 0 0 1 12 11.5a4.4 4.4 0 0 1-4.4-4L7 2ZM7.4 6h9.2M12 11.5V21M8 21h8",
  planta: "M12 21v-8M12 13c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6ZM12 15c0-3-2.2-5-5-5 0 3 2.2 5 5 5ZM7 21h10l-1-4H8l-1 4Z",
};

// Para los pines del mapa, que se arman como string HTML (ver TiendaMap).
export function pathIconoMarca(icono: TipoIcono): string {
  return icono === "tienda" ? PATH_ICONO_TIENDA : PATHS[icono];
}

export function IconoMarca({ className = "h-5 w-5" }: { className?: string }) {
  const { icono } = useTema();
  if (icono === "tienda") return <IconoTienda className={className} />;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[icono]} />
    </svg>
  );
}
