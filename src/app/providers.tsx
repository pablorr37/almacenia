"use client";

import { SessionProvider } from "next-auth/react";
import { TemaProvider } from "@/components/tema/TemaProvider";
import type { Tema } from "@/lib/tema/tema";

export function Providers({ tema, children }: { tema: Tema; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <TemaProvider tema={tema}>{children}</TemaProvider>
    </SessionProvider>
  );
}
