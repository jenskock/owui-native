/**
 * Chat screen
 * Model selection, response streaming, file upload
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Modal,
  ActionSheetIOS,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Icon from 'react-native-vector-icons/Feather';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import {
  pick,
  keepLocalCopy,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
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
  const { defaultModelId } = useAuth();
  const { chatId } = route.params;

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    undefined
  );
  const [isLoading, setIsLoading] = useState(true);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<PickedFile[]>([]);

  const loadChat = useCallback(async () => {
    try {
      const chatData = await apiClient.getChat(chatId);
      if (chatData.messages) {
        setMessages(chatData.messages);
      }
      if (chatData.chat_model_id) {
        setSelectedModel((prev) => prev ?? chatData.chat_model_id ?? undefined);
      }
    } catch (error) {
      console.error('Load chat error:', error);
      Alert.alert('Error', `Failed to load chat: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsLoading(false);
    }
  }, [chatId]);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await apiClient.getModels();
      setModels(data);
      if (data.length > 0) {
        setSelectedModel((prev) => {
          if (prev && data.some((m) => m.id === prev)) return prev;
          return defaultModelId && data.some((m) => m.id === defaultModelId)
            ? defaultModelId
            : data[0].id;
        });
      }
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [defaultModelId]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const readUriAsBase64 = async (uri: string): Promise<string | undefined> => {
    try {
      const path = uri.replace(/^file:\/\//, '');
      return await RNFS.readFile(path, 'base64');
    } catch {
      return undefined;
    }
  };

  const imagePickerOptions = {
    mediaType: 'photo' as const,
    includeBase64: true,
  };

  const pickCamera = async () => {
    try {
      const result = await launchCamera(imagePickerOptions);
      if (result.didCancel || result.errorCode || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const base64 = asset.base64 ?? (asset.uri && (await readUriAsBase64(asset.uri)));
      if (!base64) return;
      const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
      const type = asset.type ?? 'image/jpeg';
      setAttachedFiles((prev) => [...prev, { uri: asset.uri ?? '', name, type, base64 }]);
    } catch {
      Alert.alert('Error', 'Failed to take photo');
    }
  };

  const pickPhotoLibrary = async () => {
    try {
      const result = await launchImageLibrary({
        ...imagePickerOptions,
        selectionLimit: 10,
      });
      if (result.didCancel || result.errorCode || !result.assets?.length) return;
      const files: PickedFile[] = [];
      for (const asset of result.assets) {
        const base64 = asset.base64 ?? (asset.uri && (await readUriAsBase64(asset.uri)));
        if (!base64) continue;
        const name = asset.fileName ?? `photo-${Date.now()}.jpg`;
        const type = asset.type ?? 'image/jpeg';
        files.push({ uri: asset.uri ?? '', name, type, base64 });
      }
      if (files.length > 0) setAttachedFiles((prev) => [...prev, ...files]);
    } catch {
      Alert.alert('Error', 'Failed to pick photo');
    }
  };

  const pickFile = async () => {
    try {
      const result = await pick({
        type: [types.allFiles],
        allowMultiSelection: true,
      });
      if (result.length === 0) return;
      const copyResults = await keepLocalCopy({
        files: result.map((f) => ({
          uri: f.uri,
          fileName: f.name ?? 'file',
        })),
        destination: 'documentDirectory',
      });
      const files: PickedFile[] = [];
      for (let i = 0; i < result.length; i++) {
        const res = result[i];
        const copy = copyResults[i];
        if (copy.status !== 'success') continue;
        const filePath = copy.localUri.replace(/^file:\/\//, '');
        const base64 = await RNFS.readFile(filePath, 'base64');
        files.push({
          uri: res.uri,
          name: res.name ?? 'file',
          type: res.type ?? undefined,
          base64,
        });
      }
      setAttachedFiles((prev) => [...prev, ...files]);
    } catch (err) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)
        return;
      Alert.alert('Error', 'Failed to pick file');
    }
  };

  const showAttachOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Photo Library', 'Browse'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickCamera();
          else if (buttonIndex === 2) pickPhotoLibrary();
          else if (buttonIndex === 3) pickFile();
        }
      );
    } else {
      Alert.alert(
        'Attach',
        'Choose an option',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: pickCamera },
          { text: 'Photo Library', onPress: pickPhotoLibrary },
          { text: 'Browse', onPress: pickFile },
        ]
      );
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

  const filteredModels = useMemo(() => {
    if (!modelSearchQuery.trim()) return models;
    const query = modelSearchQuery.toLowerCase();
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(query) ||
        m.id.toLowerCase().includes(query)
    );
  }, [models, modelSearchQuery]);

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
        {isUser ? (
          <Text style={styles.messageContent}>{content}</Text>
        ) : (
          <Markdown style={markdownStyles} mergeStyle={true}>
            {content}
          </Markdown>
        )}
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
          onPress={() => {
            const next = !showModelPicker;
            setShowModelPicker(next);
            if (next && models.length === 0 && !modelsLoading) loadModels();
          }}
        >
          <Text style={styles.modelButtonText} numberOfLines={1}>
            {models.find((m) => m.id === selectedModel)?.name ?? selectedModel ?? 'Select model'}
          </Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showModelPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowModelPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Model</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModelPicker(false);
                  setModelSearchQuery('');
                }}
                style={styles.modalCloseButton}
              >
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.modelSearchInput}
              placeholder="Search models..."
              placeholderTextColor="#8b949e"
              value={modelSearchQuery}
              onChangeText={setModelSearchQuery}
              autoFocus
            />
            {modelsLoading ? (
              <View style={styles.emptyModelsContainer}>
                <ActivityIndicator size="large" color="#58a6ff" />
                <Text style={styles.emptyModelsText}>Loading models...</Text>
              </View>
            ) : (
              <View style={styles.modelListWrapper}>
                <FlatList
                  data={filteredModels}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.modelListItem,
                      selectedModel === item.id && styles.modelListItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedModel(item.id);
                      setShowModelPicker(false);
                      setModelSearchQuery('');
                    }}
                  >
                    <Text
                      style={[
                        styles.modelListItemText,
                        selectedModel === item.id && styles.modelListItemTextSelected,
                      ]}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {selectedModel === item.id && (
                      <Text style={styles.modelListItemCheck}>✓</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyModelsContainer}>
                    <Text style={styles.emptyModelsText}>
                      {modelSearchQuery
                        ? `No models found matching "${modelSearchQuery}"`
                        : models.length === 0
                          ? 'No models available. Please check your connection.'
                          : 'No models match your search.'}
                    </Text>
                    {models.length === 0 && (
                      <TouchableOpacity
                        style={styles.retryButton}
                        onPress={() => loadModels()}
                      >
                        <Text style={styles.retryButtonText}>Retry</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                }
                  style={styles.modelList}
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

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
        <TouchableOpacity style={styles.attachButton} onPress={showAttachOptions}>
          <Icon name="paperclip" size={24} color="#f0f6fc" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor="#8b949e"
          value={inputText}
          onChangeText={setInputText}
          multiline
          textAlignVertical="top"
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

const markdownStyles = StyleSheet.create({
  body: { color: '#f0f6fc', fontSize: 16 },
  paragraph: { marginTop: 0, marginBottom: 8 },
  strong: { color: '#f0f6fc', fontWeight: '700' },
  em: { color: '#f0f6fc', fontStyle: 'italic' },
  s: { color: '#8b949e' },
  link: { color: '#58a6ff' },
  blockquote: { backgroundColor: '#161b22', borderLeftColor: '#58a6ff', paddingLeft: 12, marginVertical: 8 },
  code_inline: { backgroundColor: '#161b22', color: '#79c0ff', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, fontSize: 14 },
  code_block: { backgroundColor: '#161b22', color: '#c9d1d9', padding: 12, borderRadius: 8, marginVertical: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
  fence: { backgroundColor: '#161b22', color: '#c9d1d9', padding: 12, borderRadius: 8, marginVertical: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
  bullet_list_icon: { color: '#f0f6fc' },
  ordered_list_icon: { color: '#f0f6fc' },
  list_item: { color: '#f0f6fc' },
  heading1: { color: '#f0f6fc', fontSize: 24, fontWeight: '700', marginTop: 16, marginBottom: 8 },
  heading2: { color: '#f0f6fc', fontSize: 20, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  heading3: { color: '#f0f6fc', fontSize: 18, fontWeight: '600', marginTop: 12, marginBottom: 4 },
  hr: { backgroundColor: '#21262d', marginVertical: 12 },
  table: { borderColor: '#21262d' },
  th: { color: '#f0f6fc', borderColor: '#21262d', padding: 8 },
  td: { color: '#f0f6fc', borderColor: '#21262d', padding: 8 },
});

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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0d1117',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
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
  modalCloseButton: {
    padding: 4,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 24,
    color: '#8b949e',
    lineHeight: 24,
  },
  modelSearchInput: {
    backgroundColor: '#161b22',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    margin: 16,
    fontSize: 16,
    color: '#f0f6fc',
    borderWidth: 1,
    borderColor: '#21262d',
  },
  modelListWrapper: {
    minHeight: 200,
    maxHeight: 400,
  },
  modelList: {},
  modelListItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  modelListItemSelected: {
    backgroundColor: '#161b22',
  },
  modelListItemText: {
    flex: 1,
    fontSize: 16,
    color: '#f0f6fc',
  },
  modelListItemTextSelected: {
    color: '#58a6ff',
    fontWeight: '500',
  },
  modelListItemCheck: {
    fontSize: 18,
    color: '#238636',
    marginLeft: 12,
  },
  emptyModelsContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  emptyModelsText: {
    color: '#8b949e',
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#238636',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
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
  input: {
    flex: 1,
    minHeight: 48 * 2,
    backgroundColor: '#161b22',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    lineHeight: 24,
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
