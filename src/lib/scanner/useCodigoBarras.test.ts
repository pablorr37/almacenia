import { manejarResultadoEscaneo } from "./useCodigoBarras";

describe("manejarResultadoEscaneo", () => {
  it("llama a onDetectado con el texto decodificado", () => {
    const onDetectado = vi.fn();
    manejarResultadoEscaneo({ getText: () => "7791234567890" }, onDetectado);
    expect(onDetectado).toHaveBeenCalledWith("7791234567890");
  });

  it("no llama a onDetectado si no hay resultado (frame sin código legible)", () => {
    const onDetectado = vi.fn();
    manejarResultadoEscaneo(undefined, onDetectado);
    expect(onDetectado).not.toHaveBeenCalled();
  });
});
