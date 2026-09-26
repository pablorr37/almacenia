// Ícono de tienda (toldo + vidriera), trazo SVG inline. Se usa en los pines del
// mapa (como string, ver TiendaMap) y en listas (como componente).
export const PATH_ICONO_TIENDA =
  "M4 9.5 5.5 4h13L20 9.5M4 9.5c0 1.4 1.1 2.5 2.5 2.5S9 10.9 9 9.5c0 1.4 1.1 2.5 2.5 2.5h1c1.4 0 2.5-1.1 2.5-2.5 0 1.4 1.1 2.5 2.5 2.5S20 10.9 20 9.5M4 9.5h16M5.5 12v8h13v-8M10 20v-4.5h4V20";

export function IconoTienda({ className = "h-5 w-5" }: { className?: string }) {
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
      <path d={PATH_ICONO_TIENDA} />
    </svg>
  );
}
