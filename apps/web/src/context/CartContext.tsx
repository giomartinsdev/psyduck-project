'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';

export interface CartProduct {
  id: string;
  title: string;
  price: string;
  imageUrl: string;
  stockStatus: string;
  inventoryCount: number;
}

export interface CartLineItem {
  product: CartProduct;
  quantity: number;
}

interface CartState {
  items: CartLineItem[];
}

type CartAction =
  | { type: 'ADD_ITEM'; product: CartProduct }
  | { type: 'REMOVE_ITEM'; productId: string }
  | { type: 'SET_QUANTITY'; productId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'RESTORE'; items: CartLineItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.product.id === action.product.id);
      if (existing) {
        return {
          items: state.items.map(i =>
            i.product.id === action.product.id
              ? { ...i, quantity: Math.min(i.quantity + 1, action.product.inventoryCount) }
              : i
          ),
        };
      }
      return { items: [...state.items, { product: action.product, quantity: 1 }] };
    }
    case 'REMOVE_ITEM':
      return { items: state.items.filter(i => i.product.id !== action.productId) };
    case 'SET_QUANTITY':
      if (action.quantity <= 0) {
        return { items: state.items.filter(i => i.product.id !== action.productId) };
      }
      return {
        items: state.items.map(i =>
          i.product.id === action.productId ? { ...i, quantity: action.quantity } : i
        ),
      };
    case 'CLEAR':
      return { items: [] };
    case 'RESTORE':
      return { items: action.items };
    default:
      return state;
  }
}

interface CartContextValue {
  items: CartLineItem[];
  itemCount: number;
  subtotal: number;
  addItem: (product: CartProduct) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  // Restore from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('cart');
      if (stored) {
        try {
          const items = JSON.parse(stored) as CartLineItem[];
          dispatch({ type: 'RESTORE', items });
        } catch { /* ignore */ }
      }
    }
  }, []);

  // Persist to sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('cart', JSON.stringify(state.items));
    }
  }, [state.items]);

  const addItem = useCallback((product: CartProduct) => dispatch({ type: 'ADD_ITEM', product }), []);
  const removeItem = useCallback((productId: string) => dispatch({ type: 'REMOVE_ITEM', productId }), []);
  const setQuantity = useCallback((productId: string, quantity: number) => dispatch({ type: 'SET_QUANTITY', productId, quantity }), []);
  const clear = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  const itemCount = state.items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = state.items.reduce((s, i) => s + parseFloat(i.product.price) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items: state.items, itemCount, subtotal, addItem, removeItem, setQuantity, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
