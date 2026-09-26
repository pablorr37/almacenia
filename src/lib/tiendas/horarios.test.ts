import { estadoApertura, textoEstadoApertura, type HorarioTienda } from "./horarios";

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

describe("textoEstadoApertura", () => {
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
