/**
 * Settings screen
 * Configure instance URL
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Settings'
>;

export function SettingsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { baseUrl, updateInstanceUrl } = useAuth();
  const [url, setUrl] = useState(baseUrl ?? '');

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
          Enter the URL of your Open Web UI instance. Changing this will log you
          out and require signing in again.
        </Text>

        <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Save</Text>
        </TouchableOpacity>
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
});
