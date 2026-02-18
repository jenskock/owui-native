/**
 * Authentication context
 * Manages auth state and token persistence
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../api/client';
import { STORAGE_KEYS } from '../constants/config';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  baseUrl: string | null;
  username: string | null;
}

interface AuthContextType extends AuthState {
  login: (
    baseUrl: string,
    username: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  setBaseUrl: (url: string) => void;
  updateInstanceUrl: (url: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    baseUrl: null,
    username: null,
  });

  const loadStoredAuth = useCallback(async () => {
    try {
      const [token, baseUrl, user] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.BASE_URL),
        AsyncStorage.getItem(STORAGE_KEYS.USER),
      ]);
      if (token && baseUrl) {
        apiClient.setToken(token);
        apiClient.setBaseUrl(baseUrl);
        setState({
          isAuthenticated: true,
          isLoading: false,
          baseUrl,
          username: user ?? null,
        });
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    } catch {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, []);

  useEffect(() => {
    loadStoredAuth();
  }, [loadStoredAuth]);

  const login = useCallback(
    async (baseUrl: string, username: string, password: string) => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const response = await apiClient.login(baseUrl, {
          username,
          password,
        });
        const token = response.access_token;
        const normalizedUrl = baseUrl.replace(/\/$/, '');
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token),
          AsyncStorage.setItem(STORAGE_KEYS.BASE_URL, normalizedUrl),
          AsyncStorage.setItem(STORAGE_KEYS.USER, username),
        ]);
        apiClient.setToken(token);
        apiClient.setBaseUrl(normalizedUrl);
        setState({
          isAuthenticated: true,
          isLoading: false,
          baseUrl: normalizedUrl,
          username,
        });
      } finally {
        setState((prev) => (prev.isLoading ? { ...prev, isLoading: false } : prev));
      }
    },
    []
  );

  const logout = useCallback(async () => {
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEYS.BASE_URL),
      AsyncStorage.removeItem(STORAGE_KEYS.USER),
    ]);
    apiClient.setToken(null);
    setState({
      isAuthenticated: false,
      isLoading: false,
      baseUrl: null,
      username: null,
    });
  }, []);

  const setBaseUrl = useCallback((url: string) => {
    const normalized = url.replace(/\/$/, '');
    setState((prev) => ({ ...prev, baseUrl: normalized }));
  }, []);

  const updateInstanceUrl = useCallback(async (newUrl: string) => {
    const normalized = newUrl.replace(/\/$/, '');
    await AsyncStorage.setItem(STORAGE_KEYS.BASE_URL, normalized);
    await AsyncStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
    apiClient.setToken(null);
    apiClient.setBaseUrl(normalized);
    setState({
      isAuthenticated: false,
      isLoading: false,
      baseUrl: normalized,
      username: null,
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        setBaseUrl,
        updateInstanceUrl,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
