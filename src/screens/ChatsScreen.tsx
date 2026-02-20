/**
 * Chats list screen
 * Access all chats and create new chat
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import {
  FlatList,
  Swipeable,
  TouchableOpacity as GHTouchableOpacity,
} from 'react-native-gesture-handler';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LiquidGlassView,
  isLiquidGlassSupported,
} from '@callstack/liquid-glass';
import { apiClient } from '../api/client';
import type { Chat } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../contexts/ThemeContext';
import type { ColorPalette } from '../constants/colors';

type NavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Chats'
>;

type ChatRowProps = {
  item: Chat;
  formatDate: (dateStr: string) => string;
  onPress: (chatId: string) => void;
  onDelete: (chat: Chat) => void;
  deleteActionContainerStyle: object;
  deleteActionStyle: object;
  deleteActionContentStyle: object;
  deleteActionTextStyle: object;
  chatItemStyle: object;
  chatTitleStyle: object;
  chatDateStyle: object;
  destructiveTextColor: string;
};

const ChatRow = React.memo(function ChatRow({
  item,
  formatDate,
  onPress,
  onDelete,
  deleteActionContainerStyle,
  deleteActionStyle,
  deleteActionContentStyle,
  deleteActionTextStyle,
  chatItemStyle,
  chatTitleStyle,
  chatDateStyle,
  destructiveTextColor,
}: ChatRowProps) {
  const renderRightActions = useCallback(
    () => (
      <View style={deleteActionContainerStyle}>
        <GHTouchableOpacity
          style={deleteActionStyle}
          onPress={() => onDelete(item)}
          activeOpacity={0.8}
        >
          <View style={deleteActionContentStyle}>
            <Icon name="trash-2" size={22} color={destructiveTextColor} />
            <Text style={deleteActionTextStyle}>Delete</Text>
          </View>
        </GHTouchableOpacity>
      </View>
    ),
    [
      item,
      onDelete,
      deleteActionContainerStyle,
      deleteActionStyle,
      deleteActionContentStyle,
      deleteActionTextStyle,
      destructiveTextColor,
    ]
  );

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
    >
      <GHTouchableOpacity
        style={chatItemStyle}
        onPress={() => onPress(item.id)}
        activeOpacity={0.7}
      >
        <Text style={chatTitleStyle} numberOfLines={1}>
          {item.title || 'New Chat'}
        </Text>
        <Text style={chatDateStyle}>{formatDate(item.create_time)}</Text>
      </GHTouchableOpacity>
    </Swipeable>
  );
});

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      paddingTop: 60,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    headerButton: {
      padding: 8,
    },
    searchContainer: {
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      zIndex: 10,
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.surfaceVariant,
    },
    newChatFab: {
      position: 'absolute',
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 5,
    },
    newChatFabGlass: {
      width: 56,
      height: 56,
      borderRadius: 28,
      justifyContent: 'center',
      alignItems: 'center',
    },
    newChatFabFallback: {
      backgroundColor: colors.glassHighlight,
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    list: {
      paddingHorizontal: 0,
      paddingTop: 0,
      paddingBottom: 100,
    },
    chatItem: {
      backgroundColor: colors.background,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.surfaceVariant,
    },
    chatTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    chatDate: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
      textAlign: 'center',
      marginTop: 48,
    },
    deleteActionContainer: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      minWidth: 80,
      height: '100%',
    },
    deleteAction: {
      backgroundColor: colors.destructive,
      justifyContent: 'center',
      alignItems: 'center',
      width: 80,
      alignSelf: 'stretch',
    },
    deleteActionContent: {
      alignItems: 'center',
      marginTop: 20,
    },
    deleteActionText: {
      color: colors.destructiveText,
      fontSize: 12,
      fontWeight: '600',
      marginTop: 4,
    },
  });
}

export function ChatsScreen() {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = React.useMemo(() => createStyles(colors), [colors]);

  const openSettings = () => navigation.navigate('Settings');
  const [chats, setChats] = useState<Chat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const listRef = useRef<FlatList>(null);
  const isFetchingRef = useRef(false);

  const fetchChats = useCallback(async (silent = false) => {
    if (isFetchingRef.current && silent) {
      // Skip if already fetching and this is a silent refresh
      return;
    }
    isFetchingRef.current = true;
    try {
      const data = await apiClient.getChats();
      setChats(data);
    } catch (error) {
      console.error('Failed to fetch chats:', error);
    } finally {
      isFetchingRef.current = false;
      if (!silent) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
      // Silent refreshes don't update loading/refreshing state
    }
  }, []);

  // Initial load
  React.useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Refresh chats when screen is focused (e.g., returning from Chat screen)
      fetchChats(true);
    }, [fetchChats])
  );

  // Periodic refresh every 30 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      // Only refresh if not currently fetching
      if (!isFetchingRef.current) {
        fetchChats(true);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
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

  const handleDeleteChat = useCallback(
    (chat: Chat) => {
      Alert.alert(
        'Delete chat',
        `Delete "${chat.title || 'New Chat'}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await apiClient.deleteChat(chat.id);
                setChats((prev) => prev.filter((c) => c.id !== chat.id));
              } catch (error) {
                console.error('Failed to delete chat:', error);
                Alert.alert('Error', 'Failed to delete chat. Please try again.');
              }
            },
          },
        ]
      );
    },
    []
  );

  const formatDate = useCallback((dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      
      // Check if the date is today by comparing year, month, and day
      const isToday =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
      
      if (isToday) {
        return date.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
      }
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  }, []);

  const filteredChats = chats.filter((chat) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const title = (chat.title || 'New Chat').toLowerCase();
    return title.includes(query);
  });

  const handlePressChat = useCallback(
    (chatId: string) => navigation.navigate('Chat', { chatId }),
    [navigation]
  );

  const renderChatItem = useCallback(
    ({ item }: { item: Chat }) => (
      <ChatRow
        item={item}
        formatDate={formatDate}
        onPress={handlePressChat}
        onDelete={handleDeleteChat}
        deleteActionContainerStyle={styles.deleteActionContainer}
        deleteActionStyle={styles.deleteAction}
        deleteActionContentStyle={styles.deleteActionContent}
        deleteActionTextStyle={styles.deleteActionText}
        chatItemStyle={styles.chatItem}
        chatTitleStyle={styles.chatTitle}
        chatDateStyle={styles.chatDate}
        destructiveTextColor={colors.destructiveText}
      />
    ),
    [formatDate, handlePressChat, handleDeleteChat, styles, colors.destructiveText]
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={openSettings}
        >
          <Icon name="settings" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search chats..."
          placeholderTextColor={colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
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
              tintColor={colors.primary}
            />
          }
        />
      )}
      
      <TouchableOpacity
        style={[
          styles.newChatFab,
          { right: 20 + insets.right, bottom: 0 + insets.bottom },
          isCreating && styles.buttonDisabled,
        ]}
        onPress={handleCreateChat}
        disabled={isCreating}
        activeOpacity={0.8}
      >
        <LiquidGlassView
          style={[
            styles.newChatFabGlass,
            !isLiquidGlassSupported && styles.newChatFabFallback,
          ]}
          effect="clear"
          interactive
        >
          {isCreating ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Icon name="plus" size={28} color={colors.text} />
          )}
        </LiquidGlassView>
      </TouchableOpacity>
    </View>
  );
}

