/**
 * Chat screen
 * Model selection, response streaming, file upload
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../api/client';
import type { Message, ModelInfo } from '../types/api';
import type { RootStackParamList } from '../navigation/types';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

interface PickedFile {
  uri: string;
  name: string;
  type?: string;
  base64?: string;
}

export function ChatScreen() {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation();
  useAuth();
  const { chatId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    undefined
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<PickedFile[]>([]);

  const loadChatAndModels = useCallback(async () => {
    try {
      const [chatData, modelsData] = await Promise.all([
        apiClient.getChat(chatId),
        apiClient.getModels(),
      ]);
      if (chatData.messages) {
        setMessages(chatData.messages);
      }
      setModels(modelsData);
      if (modelsData.length > 0) {
        const modelId =
          chatData.chat_model_id ?? modelsData[0].id;
        setSelectedModel((prev) => prev ?? modelId ?? undefined);
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    loadChatAndModels();
  }, [loadChatAndModels]);

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        allowMultiSelection: true,
        copyTo: 'documentDirectory',
      });
      const files: PickedFile[] = [];
      for (const res of result) {
        const filePath = (res.fileCopyUri || res.uri).replace(
          /^file:\/\//,
          ''
        );
        const base64 = await RNFS.readFile(filePath, 'base64');
        files.push({
          uri: res.uri,
          name: res.name || 'file',
          type: res.type ?? undefined,
          base64,
        });
      }
      setAttachedFiles((prev) => [...prev, ...files]);
    } catch (err) {
      if (DocumentPicker.isCancel(err)) return;
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const buildMessageContent = (text: string): Message['content'] => {
    if (attachedFiles.length === 0) return text;
    const parts: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];
    if (text.trim()) {
      parts.push({ type: 'text', text });
    }
    for (const file of attachedFiles) {
      const mime = file.type || 'application/octet-stream';
      const dataUrl = `data:${mime};base64,${file.base64}`;
      parts.push({
        type: 'image_url',
        image_url: { url: dataUrl },
      });
    }
    return parts;
  };

  const sendMessage = async () => {
    const text = inputText.trim();
    if ((!text && attachedFiles.length === 0) || isSending) return;
    if (!selectedModel) {
      Alert.alert('Error', 'Please select a model');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: buildMessageContent(text),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setAttachedFiles([]);
    setIsSending(true);
    setStreamingContent('');

    const allMessages: Message[] = [
      ...messages,
      userMessage,
    ];

    try {
      const stream = apiClient.streamChat(chatId, {
        model: selectedModel,
        messages: allMessages,
        stream: true,
      });

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: fullContent },
      ]);
      setStreamingContent('');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to send';
      Alert.alert('Error', msg);
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsSending(false);
    }
  };

  const displayMessages = streamingContent
    ? [
        ...messages,
        { role: 'assistant' as const, content: streamingContent },
      ]
    : messages;

  const renderMessage = ({ item }: { item: Message }) => {
    const content =
      typeof item.content === 'string'
        ? item.content
        : Array.isArray(item.content)
          ? item.content
              .map((p) => (typeof p === 'string' ? p : '[File]'))
              .join('\n')
          : '';
    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text style={styles.messageRole}>
          {isUser ? 'You' : 'Assistant'}
        </Text>
        <Text style={styles.messageContent}>{content}</Text>
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#58a6ff" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.modelButton}
          onPress={() => setShowModelPicker(!showModelPicker)}
        >
          <Text style={styles.modelButtonText} numberOfLines={1}>
            {models.find((m) => m.id === selectedModel)?.name ?? selectedModel ?? 'Select model'}
          </Text>
        </TouchableOpacity>
      </View>

      {showModelPicker && (
        <ScrollView
          horizontal
          style={styles.modelPicker}
          showsHorizontalScrollIndicator={false}
        >
          {models.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.modelChip,
                selectedModel === m.id && styles.modelChipSelected,
              ]}
              onPress={() => {
                setSelectedModel(m.id);
                setShowModelPicker(false);
              }}
            >
              <Text
                style={[
                  styles.modelChipText,
                  selectedModel === m.id && styles.modelChipTextSelected,
                ]}
                numberOfLines={1}
              >
                {m.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <FlatList
        data={displayMessages}
        renderItem={renderMessage}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={styles.messagesList}
        ListFooterComponent={
          isSending && !streamingContent ? (
            <View style={styles.messageBubble}>
              <ActivityIndicator size="small" color="#58a6ff" />
            </View>
          ) : null
        }
      />

      {attachedFiles.length > 0 && (
        <View style={styles.attachments}>
          {attachedFiles.map((f, i) => (
            <View key={i} style={styles.attachmentChip}>
              <Text style={styles.attachmentName} numberOfLines={1}>
                {f.name}
              </Text>
              <TouchableOpacity onPress={() => removeFile(i)}>
                <Text style={styles.removeAttachment}>×</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attachButton} onPress={pickFile}>
          <Text style={styles.attachButtonText}>📎</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#8b949e"
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={4000}
          editable={!isSending}
        />
        <TouchableOpacity
          style={[styles.sendButton, isSending && styles.sendDisabled]}
          onPress={sendMessage}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.sendText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d1117',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  modelButton: {
    flex: 1,
    backgroundColor: '#161b22',
    padding: 12,
    borderRadius: 8,
  },
  modelButtonText: {
    color: '#f0f6fc',
    fontSize: 14,
  },
  modelPicker: {
    maxHeight: 48,
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  modelChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#21262d',
  },
  modelChipSelected: {
    backgroundColor: '#238636',
  },
  modelChipText: {
    color: '#8b949e',
  },
  modelChipTextSelected: {
    color: '#fff',
  },
  messagesList: {
    padding: 16,
    paddingBottom: 24,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    maxWidth: '85%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#238636',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#21262d',
  },
  messageRole: {
    fontSize: 12,
    color: '#8b949e',
    marginBottom: 4,
  },
  messageContent: {
    fontSize: 16,
    color: '#f0f6fc',
  },
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#21262d',
    padding: 8,
    borderRadius: 8,
    gap: 8,
  },
  attachmentName: {
    color: '#f0f6fc',
    maxWidth: 120,
  },
  removeAttachment: {
    color: '#f85149',
    fontSize: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
    gap: 8,
  },
  attachButton: {
    padding: 12,
    justifyContent: 'center',
  },
  attachButtonText: {
    fontSize: 24,
  },
  input: {
    flex: 1,
    backgroundColor: '#161b22',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#f0f6fc',
    maxHeight: 120,
  },
  sendButton: {
    backgroundColor: '#238636',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.7,
  },
  sendText: {
    color: '#fff',
    fontWeight: '600',
  },
});
