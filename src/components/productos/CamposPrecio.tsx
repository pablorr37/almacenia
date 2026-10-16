"use client";

import {
  ALICUOTAS,
  ETIQUETA_ALICUOTA,
  calcularPrecio,
  desglosar,
  margenDesde,
  type AlicuotaIva,
  type CondicionIva,
} from "@/lib/precios/precios";

// Precio = costo + ganancia + impuestos (20-precios-facturacion.md). Costo, margen y
// precio final están enlazados: al cambiar costo o margen se recalcula el precio; al
// cambiar el precio, el margen. El desglose (neto, IVA, internos) se ve en vivo.

export type ValorPrecio = {
  precio: string;
  costo: string;
  margen: string;
  alicuotaIva: AlicuotaIva;
  impuestosInternos: string;
};

export const PRECIO_VACIO: ValorPrecio = { precio: "", costo: "", margen: "", alicuotaIva: "iva_21", impuestosInternos: "0" };

const num = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));
const texto = (n: number | null) => (n === null || !Number.isFinite(n) ? "" : String(n));

export function valorDesdeProducto(p: {
  precio: number;
  costo: number | null;
  margen: number | null;
  alicuotaIva: AlicuotaIva;
  impuestosInternos: number;
}): ValorPrecio {
  return {
    precio: String(p.precio),
    costo: texto(p.costo),
    margen: texto(p.margen),
    alicuotaIva: p.alicuotaIva,
    impuestosInternos: String(p.impuestosInternos),
  };
}

// Lo que se manda a la API: el precio manda; costo y margen viajan si están (null para borrarlos).
export function aPayloadPrecio(v: ValorPrecio) {
  return {
    precio: num(v.precio) ?? undefined,
    costo: num(v.costo),
    margen: num(v.margen),
    alicuotaIva: v.alicuotaIva,
    impuestosInternos: num(v.impuestosInternos) ?? 0,
  };
}

const formatoARS = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const claseInput =
  "h-11 w-full min-w-0 rounded-control border border-border bg-surface px-3 text-[14px] focus:border-primary focus:outline-none disabled:bg-placeholder disabled:text-text-2";

export function CamposPrecio({
  valor,
  onChange,
  condicion,
  porKg = false,
  disabled = false,
  idPrefijo = "precio",
}: {
  valor: ValorPrecio;
  onChange: (v: ValorPrecio) => void;
  condicion: CondicionIva;
  porKg?: boolean;
  disabled?: boolean;
  idPrefijo?: string;
}) {
  const ri = condicion === "responsable_inscripto";
  const fiscal = (v: ValorPrecio) => ({ condicion, alicuota: v.alicuotaIva, internos: num(v.impuestosInternos) ?? 0 });

  // Recalcula el precio con costo y margen, si están los dos.
  const conPrecio = (v: ValorPrecio): ValorPrecio => {
    const costo = num(v.costo);
    const margen = num(v.margen);
    if (costo === null || margen === null || margen <= -100) return v;
    return { ...v, precio: String(calcularPrecio({ ...fiscal(v), costo, margen })) };
  };
  // Recalcula el margen desde el precio, si hay costo.
  const conMargen = (v: ValorPrecio): ValorPrecio => {
    const costo = num(v.costo);
    const precio = num(v.precio);
    if (costo === null || precio === null) return v;
    return { ...v, margen: texto(margenDesde(precio, { ...fiscal(v), costo })) };
  };

  const precio = num(valor.precio);
  const margen = num(valor.margen);
  const d = precio !== null ? desglosar(precio, fiscal(valor)) : null;
  const unidad = porKg ? " por kg" : "";

  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Costo{unidad} {ri ? "(sin IVA)" : "(con IVA)"}
          <input
            id={`${idPrefijo}-costo`}
            value={valor.costo}
            onChange={(e) => {
              const v = { ...valor, costo: e.target.value };
              onChange(num(v.margen) !== null ? conPrecio(v) : conMargen(v));
            }}
            inputMode="decimal"
            placeholder="Opcional"
            className={claseInput}
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Ganancia %
          <input
            id={`${idPrefijo}-margen`}
            value={valor.margen}
            onChange={(e) => onChange(conPrecio({ ...valor, margen: e.target.value }))}
            inputMode="decimal"
            placeholder="Ej. 30"
            className={claseInput}
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
        Precio final{unidad}
        <input
          id={idPrefijo === "p" ? "p-precio" : `${idPrefijo}-final`}
          name="precio"
          value={valor.precio}
          onChange={(e) => onChange(conMargen({ ...valor, precio: e.target.value }))}
          inputMode="decimal"
          required
          className={claseInput}
        />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        {ri && (
          <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
            Alícuota de IVA
            <select
              id={`${idPrefijo}-alicuota`}
              value={valor.alicuotaIva}
              onChange={(e) => onChange(conPrecio({ ...valor, alicuotaIva: e.target.value as AlicuotaIva }))}
              className={claseInput}
            >
              {ALICUOTAS.map((a) => (
                <option key={a} value={a}>
                  {ETIQUETA_ALICUOTA[a]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-[12px] font-semibold text-text-2">
          Impuestos internos %
          <input
            id={`${idPrefijo}-internos`}
            value={valor.impuestosInternos}
            onChange={(e) => onChange(conPrecio({ ...valor, impuestosInternos: e.target.value }))}
            inputMode="decimal"
            className={claseInput}
          />
        </label>
      </div>
      {d && (
        <p className="text-[12px] text-text-2 tabular-nums" data-testid="desglose-precio">
          Neto {formatoARS(d.neto)}
          {ri ? ` · IVA ${formatoARS(d.iva)}` : " · IVA incluido (no se discrimina)"}
          {d.internos > 0 ? ` · Internos ${formatoARS(d.internos)}` : ""}
        </p>
      )}
      {margen !== null && margen < 0 && (
        <p role="alert" className="text-[12px] font-semibold text-estado-rechazado-text">
          Ojo: con este precio vendés por debajo del costo ({margen} %).
        </p>
      )}
    </fieldset>
  );
}
