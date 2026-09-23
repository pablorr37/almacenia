import { esComprable } from './es-comprable';

interface Producto {
  id: string;
  tiendaId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
  disponible: boolean;
}

describe('esComprable', () => {
  it('should return true for a product that is available and has positive stock', () => {
    const producto: Producto = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: 5, 
      disponible: true 
    };
    expect(esComprable(producto)).toBe(true);
  });

  it('should return false for a product that is available but stock is zero', () => {
    const producto: Producto = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: 0, 
      disponible: true 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false for a product that is not available even if stock is positive', () => {
    const producto: Producto = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: 5, 
      disponible: false 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when stock is a string', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: '5', 
      disponible: true 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when disponible is a string', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: 5, 
      disponible: 'true' 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when stock is negative', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: -1, 
      disponible: true 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when disponible is a number', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: 5, 
      disponible: 1 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when stock is missing', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      disponible: true 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when disponible is missing', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: null, 
      precio: 2.5, 
      stock: 5 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when product is missing any property', () => {
    const producto: any = { id: '1', tiendaId: '2', nombre: 'Lechuga', precio: 2.5 };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when product has incorrect types', () => {
    const producto: any = { 
      id: '1', 
      tiendaId: '2', 
      nombre: 'Lechuga', 
      descripcion: 'string', 
      precio: '2.5', 
      stock: true, 
      disponible: 'true' 
    };
    expect(esComprable(producto)).toBe(false);
  });

  it('should return false when product is not an object', () => {
    const producto: any = 'string' as any;
    expect(esComprable(producto)).toBe(false);
  });
});