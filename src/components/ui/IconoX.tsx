// Ícono × dibujado en SVG: el carácter "×" queda corrido según la fuente, el SVG queda
// centrado exacto en su botón. Hereda el color del texto (`currentColor`).
export function IconoX({ tamano = 14 }: { tamano?: number }) {
  return (
    <svg
      width={tamano}
      height={tamano}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      className="block"
    >
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}
