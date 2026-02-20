/**
 * Central color palette – semantic tokens used across the app.
 * All screens and components should import from here.
 * Theming (light/dark) will provide alternate values for these keys.
 */

export type ColorPalette = {
  background: string;
  surface: string;
  surfaceVariant: string;
  border: string;
  text: string;
  textSecondary: string;
  placeholder: string;
  primary: string;
  buttonPrimary: string;
  buttonPrimaryText: string;
  error: string;
  destructive: string;
  destructiveText: string;
  overlay: string;
  overlayHeavy: string;
  shadow: string;
  codeBackground: string;
  codeText: string;
  codeAccent: string;
  link: string;
  glassHighlight: string;
};

/** Dark theme palette (current default). */
export const darkPalette: ColorPalette = {
  background: '#0d1117',
  surface: '#161b22',
  surfaceVariant: '#21262d',
  border: '#30363d',
  text: '#f0f6fc',
  textSecondary: '#8b949e',
  placeholder: '#8b949e',
  primary: '#58a6ff',
  buttonPrimary: '#238636',
  buttonPrimaryText: '#fff',
  error: '#f85149',
  destructive: '#da3633',
  destructiveText: '#fff',
  overlay: 'rgba(0,0,0,0.5)',
  overlayHeavy: 'rgba(0,0,0,0.7)',
  shadow: '#000',
  codeBackground: '#161b22',
  codeText: '#c9d1d9',
  codeAccent: '#79c0ff',
  link: '#58a6ff',
  glassHighlight: 'rgba(255,255,255,0.25)',
};

/** Light theme palette. */
export const lightPalette: ColorPalette = {
  background: '#ffffff',
  surface: '#f6f8fa',
  surfaceVariant: '#eaeef2',
  border: '#d0d7de',
  text: '#1f2328',
  textSecondary: '#656d76',
  placeholder: '#656d76',
  primary: '#0969da',
  buttonPrimary: '#116329',
  buttonPrimaryText: '#fff',
  error: '#cf222e',
  destructive: '#cf222e',
  destructiveText: '#fff',
  overlay: 'rgba(0,0,0,0.4)',
  overlayHeavy: 'rgba(0,0,0,0.6)',
  shadow: '#000',
  codeBackground: '#f6f8fa',
  codeText: '#24292f',
  codeAccent: '#0550ae',
  link: '#0969da',
  glassHighlight: 'rgba(255,255,255,0.7)',
};

/** User-selectable theme mode. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** Default export for non-themed usage (e.g. tests). */
export const colors: ColorPalette = darkPalette;
