import { estadoApertura, textoEstadoApertura, horariosPorDia, type HorarioTienda } from "./horarios";

// San Juan (Argentina) es UTC-3 todo el año. 2026-09-26 es sábado (6),
// 2026-09-27 domingo (0), 2026-09-28 lunes (1).
function local(fechaHora: string): Date {
  return new Date(`${fechaHora}:00-03:00`);
}

function semana(overrides: Partial<Record<number, Partial<HorarioTienda>>> = {}): HorarioTienda[] {
  return Array.from({ length: 7 }, (_, diaSemana) => ({
    diaSemana,
    abre: "09:00",
    cierra: "21:00",
    ...overrides[diaSemana],
  }));
}

describe("estadoApertura", () => {
  it("sin horarios cargados devuelve desconocido", () => {
    expect(estadoApertura([], local("2026-09-26T10:00"))).toEqual({ estado: "desconocido" });
  });

  it("dentro del horario devuelve abierta con la hora de cierre", () => {
    expect(estadoApertura(semana(), local("2026-09-26T10:00"))).toEqual({
      estado: "abierta",
      cierraA: "21:00",
    });
  });

  it("usa la hora local del negocio, no UTC", () => {
    // 23:30 UTC = 20:30 en San Juan: todavía abierta.
    expect(estadoApertura(semana(), new Date("2026-09-26T23:30:00Z")).estado).toBe("abierta");
  });

  it("antes de abrir: cerrada, abre hoy", () => {
    expect(estadoApertura(semana(), local("2026-09-26T07:30"))).toEqual({
      estado: "cerrada",
      proximaApertura: { diaSemana: 6, hora: "09:00", enDias: 0 },
    });
  });

  it("a la hora exacta de cierre ya está cerrada y abre mañana", () => {
    expect(estadoApertura(semana(), local("2026-09-26T21:00"))).toEqual({
      estado: "cerrada",
      proximaApertura: { diaSemana: 0, hora: "09:00", enDias: 1 },
    });
  });

  it("saltea días cerrados dando la vuelta a la semana", () => {
    const horarios = semana({ 0: { abre: null, cierra: null } });
    // Sábado 22:00 -> domingo cerrado -> abre lunes.
    expect(estadoApertura(horarios, local("2026-09-26T22:00"))).toEqual({
      estado: "cerrada",
      proximaApertura: { diaSemana: 1, hora: "09:00", enDias: 2 },
    });
  });

  it("día cerrado hoy: cerrada aunque sea horario habitual", () => {
    const horarios = semana({ 0: { abre: null, cierra: null } });
    expect(estadoApertura(horarios, local("2026-09-27T12:00"))).toEqual({
      estado: "cerrada",
      proximaApertura: { diaSemana: 1, hora: "09:00", enDias: 1 },
    });
  });

  it("todos los días cerrados: proximaApertura null", () => {
    const horarios = Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, abre: null, cierra: null }));
    expect(estadoApertura(horarios, local("2026-09-26T12:00"))).toEqual({
      estado: "cerrada",
      proximaApertura: null,
    });
  });

  it("solo abre un día: después del cierre vuelve a abrir en 7 días", () => {
    const horarios = Array.from({ length: 7 }, (_, diaSemana) =>
      diaSemana === 6 ? { diaSemana, abre: "09:00", cierra: "13:00" } : { diaSemana, abre: null, cierra: null }
    );
    expect(estadoApertura(horarios, local("2026-09-26T14:00"))).toEqual({
      estado: "cerrada",
      proximaApertura: { diaSemana: 6, hora: "09:00", enDias: 7 },
    });
  });
});

describe("estadoApertura con abierto24hs", () => {
  it("24 hs: abierta a cualquier hora, sin horarios", () => {
    for (const h of ["2026-09-26T03:00", "2026-09-27T23:30"]) {
      expect(estadoApertura([], local(h), { abierto24hs: true })).toEqual({ estado: "abierta", cierraA: null });
    }
  });

  it("24 hs ignora horarios que dirían cerrado", () => {
    const horarios = Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, abre: null, cierra: null }));
    expect(estadoApertura(horarios, local("2026-09-26T12:00"), { abierto24hs: true }).estado).toBe("abierta");
  });

  it("sin el flag, los 7 días en null son cerrado", () => {
    const horarios = Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, abre: null, cierra: null }));
    expect(estadoApertura(horarios, local("2026-09-26T12:00")).estado).toBe("cerrada");
  });
});

describe("textoEstadoApertura", () => {
  it("24 hs", () => {
    expect(textoEstadoApertura({ estado: "abierta", cierraA: null })).toBe("Abierto las 24 hs");
  });
  it("abierta", () => {
    expect(textoEstadoApertura({ estado: "abierta", cierraA: "21:00" })).toBe("Abierto · Cierra a las 21:00");
  });
  it("cerrada, abre hoy", () => {
    expect(
      textoEstadoApertura({ estado: "cerrada", proximaApertura: { diaSemana: 6, hora: "09:00", enDias: 0 } })
    ).toBe("Cerrado · Abre a las 09:00");
  });
  it("cerrada, abre mañana", () => {
    expect(
      textoEstadoApertura({ estado: "cerrada", proximaApertura: { diaSemana: 0, hora: "09:00", enDias: 1 } })
    ).toBe("Cerrado · Abre mañana 09:00");
  });
  it("cerrada, abre otro día", () => {
    expect(
      textoEstadoApertura({ estado: "cerrada", proximaApertura: { diaSemana: 1, hora: "08:30", enDias: 2 } })
    ).toBe("Cerrado · Abre el lunes 08:30");
  });
  it("cerrada sin próxima apertura", () => {
    expect(textoEstadoApertura({ estado: "cerrada", proximaApertura: null })).toBe("Cerrado");
  });
  it("desconocido", () => {
    expect(textoEstadoApertura({ estado: "desconocido" })).toBe("Horario no informado");
  });
});

describe("estadoApertura con horario partido", () => {
  // Todos los días 9-12 y 16-20, salvo domingo (0) cerrado. 2026-09-26 es sábado.
  const partido: HorarioTienda[] = [{ diaSemana: 0, abre: null, cierra: null }];
  for (let d = 1; d <= 6; d++) {
    partido.push({ diaSemana: d, abre: "16:00", cierra: "20:00" }, { diaSemana: d, abre: "09:00", cierra: "12:00" });
  }

  it("en la primera franja: abierta, cierra al fin de esa franja", () => {
    expect(estadoApertura(partido, local("2026-09-26T10:00"))).toEqual({ estado: "abierta", cierraA: "12:00" });
  });

  it("entre franjas: cerrada, abre hoy a las 16", () => {
    const estado = estadoApertura(partido, local("2026-09-26T14:00"));
    expect(estado).toEqual({ estado: "cerrada", proximaApertura: { diaSemana: 6, hora: "16:00", enDias: 0 } });
    expect(textoEstadoApertura(estado)).toBe("Cerrado · Abre a las 16:00");
  });

  it("en la segunda franja: abierta, cierra a las 20", () => {
    expect(estadoApertura(partido, local("2026-09-26T16:00"))).toEqual({ estado: "abierta", cierraA: "20:00" });
  });

  it("a la hora exacta de cierre de una franja ya está cerrada", () => {
    expect(estadoApertura(partido, local("2026-09-26T12:00")).estado).toBe("cerrada");
  });

  it("después de la última franja: la próxima apertura es la primera franja del siguiente día abierto", () => {
    // Sábado 21:00 → domingo cerrado → lunes 9:00.
    expect(estadoApertura(partido, local("2026-09-26T21:00"))).toEqual({
      estado: "cerrada",
      proximaApertura: { diaSemana: 1, hora: "09:00", enDias: 2 },
    });
  });
});

describe("horariosPorDia", () => {
  it("lista la semana de lunes a domingo con todas las franjas", () => {
    const h: HorarioTienda[] = [
      { diaSemana: 0, abre: null, cierra: null },
      ...[1, 2, 3, 4, 5, 6].flatMap((d) => [
        { diaSemana: d, abre: "16:00", cierra: "20:00" },
        { diaSemana: d, abre: "09:00", cierra: "12:00" },
      ]),
    ];
    const r = horariosPorDia(h);
    expect(r[0]).toEqual({ diaSemana: 1, dia: "Lunes", texto: "09:00–12:00 · 16:00–20:00" });
    expect(r[6]).toEqual({ diaSemana: 0, dia: "Domingo", texto: "Cerrado" });
    expect(r).toHaveLength(7);
  });

  it("sin horarios devuelve una lista vacía", () => {
    expect(horariosPorDia([])).toEqual([]);
  });
});
