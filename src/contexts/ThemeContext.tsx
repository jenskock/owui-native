/**
 * Theme context
 * Manages light/dark mode with system default and persistence
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  darkPalette,
  lightPalette,
  type ColorPalette,
  type ThemeMode,
} from '../constants/colors';
import { STORAGE_KEYS } from '../constants/config';

interface ThemeContextType {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => Promise<void>;
  isDark: boolean;
  colors: ColorPalette;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getSystemIsDark(): boolean {
  return Appearance.getColorScheme() === 'dark';
}

function getColors(isDark: boolean): ColorPalette {
  return isDark ? darkPalette : lightPalette;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [systemDark, setSystemDark] = useState(getSystemIsDark);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.THEME_MODE).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeModeState(stored);
      }
    });
  }, []);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemDark(colorScheme === 'dark');
    });
    return () => sub.remove();
  }, []);

  const setThemeMode = useCallback(async (mode: ThemeMode) => {
    setThemeModeState(mode);
    await AsyncStorage.setItem(STORAGE_KEYS.THEME_MODE, mode);
  }, []);

  const isDark = useMemo(() => {
    if (themeMode === 'system') return systemDark;
    return themeMode === 'dark';
  }, [themeMode, systemDark]);

  const colors = useMemo(() => getColors(isDark), [isDark]);

  const value = useMemo<ThemeContextType>(
    () => ({ themeMode, setThemeMode, isDark, colors }),
    [themeMode, setThemeMode, isDark, colors]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
