/**
 * Settings screen
 * Configure instance URL, default model, and theme
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, CommonActions } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import type { ModelInfo } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeMode } from '../constants/colors';
import type { ColorPalette } from '../constants/colors';
import { ListPicker, type ListPickerItem } from '../components/ListPicker';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Settings'
>;

const THEME_OPTIONS: ListPickerItem[] = [
  { id: 'system', label: 'System' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      paddingTop: 60,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
      gap: 12,
    },
    backText: {
      color: colors.primary,
      fontSize: 16,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    content: {
      padding: 24,
    },
    label: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 16,
      fontSize: 16,
      color: colors.text,
      marginBottom: 12,
    },
    hint: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 24,
      lineHeight: 20,
    },
    sectionSpacer: {
      marginTop: 32,
    },
    modelButtonText: {
      color: colors.text,
      fontSize: 16,
    },
    clearModelButton: {
      marginTop: 8,
      paddingVertical: 8,
    },
    clearModelText: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    logoutButton: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 8,
      padding: 16,
      alignItems: 'center',
    },
    logoutButtonText: {
      color: colors.error,
      fontSize: 16,
      fontWeight: '600',
    },
  });
}

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors, themeMode, setThemeMode } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { baseUrl, updateInstanceUrl, defaultModelId, setDefaultModel, logout } = useAuth();
  const [url, setUrl] = useState(baseUrl ?? '');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  const loadModels = useCallback(async () => {
    if (!baseUrl) return;
    setModelsLoading(true);
    try {
      const data = await apiClient.getModels();
      setModels(data);
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    if (baseUrl) loadModels();
  }, [baseUrl, loadModels]);

  useEffect(() => {
    setUrl(baseUrl ?? '');
  }, [baseUrl]);

  const handleSaveInstanceUrl = useCallback(
    async (onSuccess?: () => void) => {
      const trimmed = url.trim();
      if (!trimmed) {
        Alert.alert('Error', 'Please enter an instance URL');
        return false;
      }
      let fullUrl = trimmed;
      if (!fullUrl.startsWith('http')) {
        fullUrl = `https://${fullUrl}`;
      }
      try {
        await updateInstanceUrl(fullUrl);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Failed to update URL';
        Alert.alert('Error', message);
        return false;
      }
      Alert.alert(
        'Instance Updated',
        'You have been logged out. Please sign in with your credentials for the new instance.',
        [{ text: 'OK', onPress: onSuccess }]
      );
      return true;
    },
    [url, updateInstanceUrl]
  );

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      const trimmed = url.trim();
      const currentBase = (baseUrl ?? '').trim();
      if (trimmed === currentBase) return;
      e.preventDefault();
      if (!trimmed) {
        Alert.alert('Error', 'Please enter an instance URL');
        return;
      }
      handleSaveInstanceUrl(() =>
        navigation.dispatch(CommonActions.goBack())
      );
    });
    return unsubscribe;
  }, [navigation, url, baseUrl, handleSaveInstanceUrl]);

  const handleBack = () => {
    const trimmed = url.trim();
    const currentBase = (baseUrl ?? '').trim();
    if (trimmed !== currentBase) {
      if (!trimmed) {
        Alert.alert('Error', 'Please enter an instance URL');
        return;
      }
      handleSaveInstanceUrl(() => navigation.goBack());
      return;
    }
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Instance URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://openwebui.example.com"
          placeholderTextColor={colors.placeholder}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          Enter the URL of your Open WebUI instance. Changes apply when you leave
          this screen and will require signing in again.
        </Text>

        <Text style={[styles.label, styles.sectionSpacer]}>Default model</Text>
        <Text style={styles.hint}>
          Used for new chats when no model is set. Only available when signed in.
        </Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => baseUrl && setShowModelPicker(true)}
          disabled={!baseUrl || modelsLoading}
        >
          {modelsLoading ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : (
            <Text style={styles.modelButtonText} numberOfLines={1}>
              {defaultModelId
                ? models.find((m) => m.id === defaultModelId)?.name ?? defaultModelId
                : 'None (use first available)'}
            </Text>
          )}
        </TouchableOpacity>
        {defaultModelId ? (
          <TouchableOpacity
            style={styles.clearModelButton}
            onPress={() => setDefaultModel(null)}
          >
            <Text style={styles.clearModelText}>Clear default</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={[styles.label, styles.sectionSpacer]}>Theme</Text>
        <Text style={styles.hint}>
          Choose light, dark, or follow system setting.
        </Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowThemePicker(true)}
        >
          <Text style={styles.modelButtonText} numberOfLines={1}>
            {THEME_OPTIONS.find((o) => o.id === themeMode)?.label ?? 'System'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.label, styles.sectionSpacer]}>Account</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Log out</Text>
        </TouchableOpacity>

        <ListPicker
          visible={showThemePicker}
          title="Theme"
          items={THEME_OPTIONS}
          selectedId={themeMode}
          onSelect={(id) => {
            if (id) {
              setThemeMode(id as ThemeMode);
            }
          }}
          onClose={() => setShowThemePicker(false)}
          searchPlaceholder="Search themes..."
          emptyMessage="No themes available"
        />

        <ListPicker
          visible={showModelPicker}
          title="Default model"
          items={models.map((m) => ({ ...m, label: m.name }))}
          selectedId={defaultModelId ?? null}
          onSelect={(id) => {
            setDefaultModel(id ?? null);
          }}
          onClose={() => setShowModelPicker(false)}
          searchPlaceholder="Search models..."
          emptyMessage="No models available"
          loading={modelsLoading}
          loadingMessage="Loading models..."
          allowClear
          clearLabel="None (use first available)"
        />
      </View>
    </View>
  );
}
