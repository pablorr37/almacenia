import { describe, expect, it, vi, beforeEach } from 'vitest';
import { normalizePagination } from './overview-normalizar-paginacion';

describe('normalizePagination', () => {
  const originalConsoleError = console.error;
  let errorSpy: any;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation((msg: any) => {
      // eslint-disable-next-line no-console
      originalConsoleError(msg);
    });
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('normaliza paginación válida', async () => {
    const result = await normalizePagination({ page: 2, pageSize: 25 });
    expect(result).toEqual({ page: 2, pageSize: 25 });
  });

  it('normaliza con valores por defecto', async () => {
    const result = await normalizePagination({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('normaliza pageSize > 100', async () => {
    const result = await normalizePagination({ pageSize: 150 });
    expect(result).toEqual({ page: 1, pageSize: 100 });
  });

  it('normaliza page y pageSize fuera de rangos', async () => {
    const result = await normalizePagination({ page: 100, pageSize: 0 });
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('lanza error por page no numérico', async () => {
    await expect(normalizePagination({ page: 'abc', pageSize: 10 })).rejects.toMatchObject({
      message: 'page debe ser un número entero mayor o igual a 1.',
      code: 'PAGINACION_PARAMETROS_INVALIDOS'
    });
  });

  it('lanza error por page < 1', async () => {
    await expect(normalizePagination({ page: 0, pageSize: 10 })).rejects.toMatchObject({
      message: 'page debe ser un número entero mayor o igual a 1.',
      code: 'PAGINACION_PARAMETROS_INVALIDOS'
    });
  });

  it('lanza error por page flotante', async () => {
    await expect(normalizePagination({ page: 2.5, pageSize: 10 })).rejects.toMatchObject({
      message: 'page debe ser un número entero.',
      code: 'PAGINACION_PAGE_TUPLA'
    });
  });

  it('lanza error por pageSize no numérico', async () => {
    await expect(normalizePagination({ pageSize: 'abc', page: 1 })).rejects.toMatchObject({
      message: 'pageSize debe ser un número entero mayor o igual a 1 y menor o igual a 100.',
      code: 'PAGINACION_PARAMETROS_INVALIDOS'
    });
  });

  it('lanza error por pageSize < 1', async () => {
    await expect(normalizePagination({ pageSize: 0, page: 1 })).rejects.toMatchObject({
      message: 'pageSize debe ser un número entero mayor o igual a 1 y menor o igual a 100.',
      code: 'PAGINACION_PARAMETROS_INVALIDOS'
    });
  });

  it('lanza error por pageSize > 100', async () => {
    await expect(normalizePagination({ pageSize: 101, page: 1 })).rejects.toMatchObject({
      message: 'pageSize debe ser un número entero mayor o igual a 1 y menor o igual a 100.',
      code: 'PAGINACION_PARAMETROS_INVALIDOS'
    });
  });

  it('lanza error por page no entero (string)', async () => {
    await expect(normalizePagination({ page: "2", pageSize: 10 })).rejects.toMatchObject({
      message: 'page debe ser un número entero mayor o igual a 1.',
      code: 'PAGINACION_PAGE_TUPLA'
    });
  });

  it('lanza error por page negativo', async () => {
    await expect(normalizePagination({ page: -1, pageSize: 10 })).rejects.toMatchObject({
      message: 'page debe ser un número entero mayor o igual a 1.',
      code: 'PAGINACION_PAGE_TUPLA'
    });
  });

  it('lanza error por page cero', async () => {
    await expect(normalizePagination({ page: 0, pageSize: 10 })).rejects.toMatchObject({
      message: 'page debe ser un número entero mayor o igual a 1.',
      code: 'PAGINACION_PAGE_TUPLA'
    });
  });

  it('lanza error por pageSize no entero (flotante)', async () => {
    await expect(normalizePagination({ pageSize: 25.5, page: 1 })).rejects.toMatchObject({
      message: 'pageSize debe ser un número entero mayor o igual a 1 y menor o igual a 100.',
      code: 'PAGINACION_PARAMETROS_INVALIDOS'
    });
  });

  it('registra el error en consola', async () => {
    await normalizePagination({ page: 0, pageSize: 10 });
    expect(errorSpy).toHaveBeenCalledWith('page debe ser un número entero mayor o igual a 1.');
  });
});