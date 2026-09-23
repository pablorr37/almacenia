import { describe, test, expect } from 'vitest';
import { transicionPermitida } from './pedidos-transicion-permitida';

describe('pedidos-transicion-permitida', () => {
  const estados: EstadoPedido[] = [
    'pendiente',
    'confirmado',
    'listo_para_retirar',
    'entregado',
    'rechazado',
    'cancelado'
  ];

  const acciones: AccionPedido[] = [
    'confirmar',
    'rechazar',
    'marcarListo',
    'entregar',
    'cancelar'
  ];

  describe('Transiciones permitidas', () => {
    test('pendiente a confirmado', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(true);
    });

    test('pendiente a rechazado', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(true);
    });

    test('pendiente a cancelado', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(true);
    });

    test('confirmado a listo_para_retirar', () => {
      const estadoActual = 'confirmado' as EstadoPedido;
      const accion = 'marcarListo' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(true);
    });

    test('listo_para_retirar a entregado', () => {
      const estadoActual = 'listo_para_retirar' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(true);
    });
  });

  describe('Transiciones no permitidas', () => {
    test('entregar desde pendiente', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('confirmar desde confirmado', () => {
      const estadoActual = 'confirmado' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('rechazar desde listo_para_retirar', () => {
      const estadoActual = 'listo_para_retirar' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('cancelar desde entregado', () => {
      const estadoActual = 'entregado' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('confirmar desde cancelado', () => {
      const estadoActual = 'cancelado' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });
  });

  describe('Combinaciones no permitidas', () => {
    test('acciones inválidas en entregado', () => {
      const estadoActual = 'entregado' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en entregado', () => {
      const estadoActual = 'entregado' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en entregado', () => {
      const estadoActual = 'entregado' as EstadoPedido;
      const accion = 'marcarListo' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en entregado', () => {
      const estadoActual = 'entregado' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en entregado', () => {
      const estadoActual = 'entregado' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en rechazado', () => {
      const estadoActual = 'rechazado' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en rechazado', () => {
      const estadoActual = 'rechazado' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en rechazado', () => {
      const estadoActual = 'rechazado' as EstadoPedido;
      const accion = 'marcarListo' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en rechazado', () => {
      const estadoActual = 'rechazado' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en rechazado', () => {
      const estadoActual = 'rechazado' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en cancelado', () => {
      const estadoActual = 'cancelado' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en cancelado', () => {
      const estadoActual = 'cancelado' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en cancelado', () => {
      const estadoActual = 'cancelado' as EstadoPedido;
      const accion = 'marcarListo' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en cancelado', () => {
      const estadoActual = 'cancelado' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en cancelado', () => {
      const estadoActual = 'cancelado' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en confirmado', () => {
      const estadoActual = 'confirmado' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en confirmado', () => {
      const estadoActual = 'confirmado' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en confirmado', () => {
      const estadoActual = 'confirmado' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en confirmado', () => {
      const estadoActual = 'confirmado' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en listo_para_retirar', () => {
      const estadoActual = 'listo_para_retirar' as EstadoPedido;
      const accion = 'confirmar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en listo_para_retirar', () => {
      const estadoActual = 'listo_para_retirar' as EstadoPedido;
      const accion = 'rechazar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en listo_para_retirar', () => {
      const estadoActual = 'listo_para_retirar' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en pendiente', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'marcarListo' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en pendiente', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'entregar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(false);
    });

    test('acciones inválidas en pendiente', () => {
      const estadoActual = 'pendiente' as EstadoPedido;
      const accion = 'cancelar' as AccionPedido;
      expect(transicionPermitida(estadoActual, accion)).toBe(true);
    });
  });
});