'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useMutation, gql } from '@apollo/client';

const SIGN_IN = gql`
  mutation signIn($input: SignInInput!) {
    signIn(input: $input) {
      token
      user { id email name avatarUrl createdAt }
    }
  }
`;

const SIGN_UP = gql`
  mutation signUp($input: SignUpInput!) {
    signUp(input: $input) {
      token
      user { id email name avatarUrl createdAt }
    }
  }
`;

const SIGN_OUT = gql`
  mutation signOut {
    signOut
  }
`;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [signInMutation] = useMutation(SIGN_IN);
  const [signUpMutation] = useMutation(SIGN_UP);
  const [signOutMutation] = useMutation(SIGN_OUT);

  // Restore session from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('mock_token');
      const storedUser = localStorage.getItem('mock_user');
      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } catch {
          // Ignore
        }
      }
    }
    setIsLoading(false);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data } = await signInMutation({ variables: { input: { email, password } } });
    const { token: t, user: u } = data.signIn;
    setToken(t);
    setUser(u);
    localStorage.setItem('mock_token', t);
    localStorage.setItem('mock_user', JSON.stringify(u));
  }, [signInMutation]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { data } = await signUpMutation({ variables: { input: { name, email, password } } });
    const { token: t, user: u } = data.signUp;
    setToken(t);
    setUser(u);
    localStorage.setItem('mock_token', t);
    localStorage.setItem('mock_user', JSON.stringify(u));
  }, [signUpMutation]);

  const signOut = useCallback(async () => {
    await signOutMutation();
    setUser(null);
    setToken(null);
    localStorage.removeItem('mock_token');
    localStorage.removeItem('mock_user');
  }, [signOutMutation]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
