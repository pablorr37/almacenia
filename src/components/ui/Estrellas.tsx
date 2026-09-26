"use client";

// Selector/visor de 1 a 5 estrellas. Con `onChange` es interactivo (botones de
// 44px de área táctil, HIG); sin él, solo muestra el valor.
export function Estrellas({
  valor,
  onChange,
  tamano = 20,
}: {
  valor: number;
  onChange?: (v: number) => void;
  tamano?: number;
}) {
  return (
    <div className="flex items-center" role={onChange ? "radiogroup" : "img"} aria-label={`${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const estrella = (
          <svg viewBox="0 0 20 20" width={tamano} height={tamano} aria-hidden="true">
            <path
              d="m10 1.8 2.5 5.2 5.7.8-4.1 4 1 5.6L10 14.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z"
              className={`transition-colors duration-150 ${n <= valor ? "fill-accent" : "fill-placeholder"}`}
            />
          </svg>
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === valor}
            aria-label={`${n} ${n === 1 ? "estrella" : "estrellas"}`}
            onClick={() => onChange(n)}
            className="press flex h-11 w-9 items-center justify-center"
          >
            {estrella}
          </button>
        ) : (
          <span key={n}>{estrella}</span>
        );
      })}
    </div>
  );
}
