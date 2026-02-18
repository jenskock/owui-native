/**
 * Chats list screen
 * Access all chats and create new chat
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';
import type { Chat } from '../types/api';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Chats'
>;

export function ChatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { logout } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fetchChats = useCallback(async () => {
    try {
      const data = await apiClient.getChats();
      setChats(data);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchChats();
  }, [fetchChats]);

  const handleCreateChat = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      const chat = await apiClient.createChat();
      setChats((prev) => [chat, ...prev]);
      navigation.navigate('Chat', { chatId: chat.id });
    } catch (error) {
      console.error('Failed to create chat:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      if (diff < 86400000) {
        return date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const renderChatItem = ({ item }: { item: Chat }) => (
    <TouchableOpacity
      style={styles.chatItem}
      onPress={() => navigation.navigate('Chat', { chatId: item.id })}
      activeOpacity={0.7}
    >
      <Text style={styles.chatTitle} numberOfLines={1}>
        {item.title || 'New Chat'}
      </Text>
      <Text style={styles.chatDate}>{formatDate(item.create_time)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.newChatButton, isCreating && styles.buttonDisabled]}
        onPress={handleCreateChat}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.newChatText}>+ New Chat</Text>
        )}
      </TouchableOpacity>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#58a6ff" />
        </View>
      ) : (
        <FlatList
          data={chats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No chats yet. Create one to get started.
            </Text>
          }
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor="#58a6ff"
            />
          }
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#f0f6fc',
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    color: '#58a6ff',
    fontSize: 16,
  },
  newChatButton: {
    backgroundColor: '#238636',
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  newChatText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  list: {
    padding: 16,
    paddingBottom: 32,
  },
  chatItem: {
    backgroundColor: '#161b22',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#21262d',
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f0f6fc',
    marginBottom: 4,
  },
  chatDate: {
    fontSize: 14,
    color: '#8b949e',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: '#8b949e',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 48,
  },
});
