"use client";

// Tema de la instalación para los componentes cliente (specs/sdd/21-temas.md). El
// layout lo resuelve en el server y lo pasa por Providers.
import { createContext, useContext } from "react";
import { TEMAS, type Tema } from "@/lib/tema/tema";

const TemaContext = createContext<Tema>(TEMAS.almacen);

export function TemaProvider({ tema, children }: { tema: Tema; children: React.ReactNode }) {
  return <TemaContext.Provider value={tema}>{children}</TemaContext.Provider>;
}

export function useTema(): Tema {
  return useContext(TemaContext);
}
