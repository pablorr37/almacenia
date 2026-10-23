import Link from "next/link";

// Contenedor de las páginas legales (21-publicidad.md: requisito de la revisión de AdSense).
export function PaginaLegal({ titulo, actualizada, children }: { titulo: string; actualizada: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 px-5 py-6 text-[15px] leading-relaxed text-text">
      <Link href="/" className="press self-start text-[14px] font-semibold text-primary-dark">
        ← Almacenia
      </Link>
      <h1 className="font-display text-[26px] font-bold text-primary-dark">{titulo}</h1>
      <p className="text-[13px] text-text-2">Última actualización: {actualizada}</p>
      <div className="flex flex-col gap-4 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-[18px] [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </main>
  );
}
