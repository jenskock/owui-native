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
  defaultModelId: string | null;
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
  setDefaultModel: (modelId: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    baseUrl: null,
    username: null,
    defaultModelId: null,
  });

  const loadStoredAuth = useCallback(async () => {
    try {
      const [token, baseUrl, user, defaultModelId] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN),
        AsyncStorage.getItem(STORAGE_KEYS.BASE_URL),
        AsyncStorage.getItem(STORAGE_KEYS.USER),
        AsyncStorage.getItem(STORAGE_KEYS.DEFAULT_MODEL),
      ]);
      if (token && baseUrl) {
        apiClient.setToken(token);
        apiClient.setBaseUrl(baseUrl);
        setState({
          isAuthenticated: true,
          isLoading: false,
          baseUrl,
          username: user ?? null,
          defaultModelId: defaultModelId ?? null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          defaultModelId: defaultModelId ?? null,
        }));
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
          email: username,
          password,
        });
        const token = response.token;
        const normalizedUrl = baseUrl.replace(/\/$/, '');
        await Promise.all([
          AsyncStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token),
          AsyncStorage.setItem(STORAGE_KEYS.BASE_URL, normalizedUrl),
          AsyncStorage.setItem(STORAGE_KEYS.USER, username),
        ]);
        apiClient.setToken(token);
        apiClient.setBaseUrl(normalizedUrl);
        const storedDefault = await AsyncStorage.getItem(STORAGE_KEYS.DEFAULT_MODEL);
        setState({
          isAuthenticated: true,
          isLoading: false,
          baseUrl: normalizedUrl,
          username,
          defaultModelId: storedDefault ?? null,
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
      defaultModelId: state.defaultModelId,
    });
  }, [state.defaultModelId]);

  const setDefaultModel = useCallback(async (modelId: string | null) => {
    if (modelId !== null) {
      await AsyncStorage.setItem(STORAGE_KEYS.DEFAULT_MODEL, modelId);
    } else {
      await AsyncStorage.removeItem(STORAGE_KEYS.DEFAULT_MODEL);
    }
    setState((prev) => ({ ...prev, defaultModelId: modelId }));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        setBaseUrl,
        updateInstanceUrl,
        setDefaultModel,
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
