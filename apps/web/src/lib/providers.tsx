'use client';

import React from 'react';
import { ApolloProvider } from '@apollo/client';
import { getApolloClient } from '../lib/apollo-client';
import { AuthProvider } from '../context/AuthContext';
import { CartProvider } from '../context/CartContext';
import { AIProvider } from '../context/AIContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const client = getApolloClient();
  return (
    <ApolloProvider client={client}>
      <AuthProvider>
        <CartProvider>
          <AIProvider>
            {children}
          </AIProvider>
        </CartProvider>
      </AuthProvider>
    </ApolloProvider>
  );
}
