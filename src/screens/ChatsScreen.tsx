/**
 * Chats list screen
 * Access all chats and create new chat
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiClient } from '../api/client';
import type { Chat } from '../types/api';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Chats'
>;

export function ChatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  const openSettings = () => navigation.navigate('Settings');
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<FlatList>(null);

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

  const filteredChats = chats.filter((chat) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const title = (chat.title || 'New Chat').toLowerCase();
    return title.includes(query);
  });

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
        <TouchableOpacity
          style={styles.headerButton}
          onPress={openSettings}
        >
          <Icon name="settings" size={22} color="#f0f6fc" />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          placeholderTextColor="#8b949e"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#58a6ff" />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: 100 + insets.bottom },
          ]}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {searchQuery
                ? `No chats found matching "${searchQuery}"`
                : 'No chats yet. Create one to get started.'}
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
      
      <TouchableOpacity
        style={[
          styles.newChatButton,
          { bottom: 20 + insets.bottom },
          isCreating && styles.buttonDisabled,
        ]}
        onPress={handleCreateChat}
        disabled={isCreating}
      >
        {isCreating ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.newChatText}>+ New Chat</Text>
        )}
      </TouchableOpacity>
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
  headerButton: {
    padding: 8,
  },
  searchContainer: {
    backgroundColor: '#0d1117',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    zIndex: 10,
  },
  searchInput: {
    backgroundColor: '#161b22',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#f0f6fc',
    borderWidth: 1,
    borderColor: '#21262d',
  },
  newChatButton: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#238636',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 100, // Extra padding so items aren't hidden behind floating button
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
