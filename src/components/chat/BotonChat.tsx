"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api-client";

// Abre (o retoma) el chat del comprador con una tienda (24-chat.md).
export function BotonChat({ tiendaId, className = "", texto = "Chat con la tienda" }: { tiendaId: string; className?: string; texto?: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          setError(null);
          try {
            const c = await apiPost<{ id: string }>("/api/chat/conversaciones", { tiendaId });
            router.push(`/chat/${c.id}`);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "No se pudo abrir el chat.");
            setOcupado(false);
          }
        }}
        className={`press flex h-11 items-center justify-center gap-1.5 rounded-pill border border-border bg-surface px-3.5 text-[13px] font-semibold text-text disabled:opacity-50 ${className}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 21l1.9-5.4A8 8 0 1 1 21 12z" />
        </svg>
        {texto}
      </button>
      {error && <span className="text-[12px] text-estado-rechazado-text">{error}</span>}
    </>
  );
}
