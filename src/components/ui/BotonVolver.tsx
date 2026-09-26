import Link from "next/link";

export function BotonVolver({ href, etiqueta }: { href: string; etiqueta: string }) {
  return (
    <Link href={href} aria-label={etiqueta} className="press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-pill">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </Link>
  );
}
