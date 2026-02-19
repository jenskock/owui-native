/**
 * Settings screen
 * Configure instance URL and default model
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';
import type { ModelInfo } from '../types/api';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Settings'
>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { baseUrl, updateInstanceUrl, defaultModelId, setDefaultModel, logout } = useAuth();
  const [url, setUrl] = useState(baseUrl ?? '');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

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

  const handleSave = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Please enter an instance URL');
      return;
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
      return;
    }
    Alert.alert(
      'Instance Updated',
      'You have been logged out. Please sign in with your credentials for the new instance.',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Instance URL</Text>
        <TextInput
          style={styles.input}
          placeholder="https://openwebui.example.com"
          placeholderTextColor="#8b949e"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.hint}>
          Enter the URL of your OWUI Native instance. Changing this will log you
          out and require signing in again.
        </Text>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>

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
            <ActivityIndicator size="small" color="#8b949e" />
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

        <Text style={[styles.label, styles.sectionSpacer]}>Account</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutButtonText}>Log out</Text>
        </TouchableOpacity>

        <Modal
          visible={showModelPicker}
          transparent
          animationType="slide"
          onRequestClose={() => setShowModelPicker(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowModelPicker(false)}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Default model</Text>
                <TouchableOpacity onPress={() => setShowModelPicker(false)}>
                  <Text style={styles.modalClose}>Done</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={models}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modelRow,
                      defaultModelId === item.id && styles.modelRowSelected,
                    ]}
                    onPress={() => {
                      setDefaultModel(item.id);
                      setShowModelPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.modelRowText,
                        defaultModelId === item.id && styles.modelRowTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {defaultModelId === item.id ? (
                      <Text style={styles.modelRowCheck}>✓</Text>
                    ) : null}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyModelsText}>No models available</Text>
                }
              />
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    gap: 12,
  },
  backText: {
    color: '#58a6ff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  content: {
    padding: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#f0f6fc',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#f0f6fc',
    marginBottom: 12,
  },
  hint: {
    fontSize: 14,
    color: '#8b949e',
    marginBottom: 24,
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#238636',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionSpacer: {
    marginTop: 32,
  },
  modelButtonText: {
    color: '#f0f6fc',
    fontSize: 16,
  },
  clearModelButton: {
    marginTop: 8,
    paddingVertical: 8,
  },
  clearModelText: {
    color: '#8b949e',
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#f85149',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#161b22',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#f0f6fc',
  },
  modalClose: {
    color: '#58a6ff',
    fontSize: 16,
  },
  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  modelRowSelected: {
    backgroundColor: '#21262d',
  },
  modelRowText: {
    fontSize: 16,
    color: '#f0f6fc',
    flex: 1,
  },
  modelRowTextSelected: {
    fontWeight: '600',
  },
  modelRowCheck: {
    color: '#58a6ff',
    fontSize: 16,
  },
  emptyModelsText: {
    color: '#8b949e',
    padding: 24,
    textAlign: 'center',
  },
});
