/**
 * Chat screen
 * Model selection, response streaming, file upload
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Keyboard,
  Platform,
  Alert,
  ActionSheetIOS,
  Image,
  Modal,
  Dimensions,
  Linking,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Icon from 'react-native-vector-icons/Feather';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  pick,
  keepLocalCopy,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import { launchCamera, launchImageLibrary, type PhotoQuality } from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import { getTools } from '../api/tools';
import { STORAGE_KEYS } from '../constants/config';
import type { Message, ModelInfo, Tool } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import type { ColorPalette } from '../constants/colors';
import { ListPicker } from '../components/ListPicker';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;
type ChatNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Chat'>;

const authImageStyles = StyleSheet.create({
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  wrapper: { position: 'relative' },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  errorText: { color: 'white', fontSize: 10, textAlign: 'center' },
});

// Component to render authenticated images
function AuthenticatedImage({ 
  url, 
  style,
  onPress,
  resizeMode = 'cover'
}: { 
  url: string; 
  style: any;
  onPress?: () => void;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
}) {
  const [imageUri, setImageUri] = React.useState<string>(url);
  const [isLoading, setIsLoading] = React.useState(!url.startsWith('data:'));
  const [error, setError] = React.useState<string | null>(null);

  // For HTTP URLs or file IDs, fetch with auth and convert to data URL
  React.useEffect(() => {
    // If it's already a data URL, we're done
    if (url.startsWith('data:')) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Convert file ID to full URL if needed
    const loadImage = async () => {
      try {
        let imageUrl = url;
        
        // If it's not an HTTP URL, it might be a file ID - convert to full URL
        if (!url.startsWith('http')) {
          imageUrl = await apiClient.getFileUrl(url);
        }

        // Fetch and convert to data URL
        const dataUrl = await apiClient.fetchImageAsDataUrl(imageUrl);
        if (dataUrl) {
          setImageUri(dataUrl);
          setError(null);
        } else {
          setError('Failed to fetch image');
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Error fetching authenticated image:', errorMsg);
        setError(`Fetch: ${errorMsg.substring(0, 50)}`);
      } finally {
        setIsLoading(false);
      }
    };

    loadImage();
  }, [url]);

  if (isLoading) {
    return (
      <View style={[style, authImageStyles.loadingContainer]}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  const imageComponent = (
    <Image
      source={{ uri: imageUri }}
      style={style}
      resizeMode={resizeMode}
      onError={(imgError) => {
        const errorMsg = imgError.nativeEvent?.error || 'Unknown error';
        const fullError = `Image decode error: ${String(errorMsg)}\nURL: ${url.substring(0, 100)}`;
        console.error(fullError);
        setError(`Decode: ${String(errorMsg).substring(0, 50)}`);
      }}
      onLoad={() => setError(null)}
    />
  );

  return (
    <View style={authImageStyles.wrapper}>
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
          {imageComponent}
        </TouchableOpacity>
      ) : (
        imageComponent
      )}
      {error && (
        <View style={authImageStyles.errorOverlay}>
          <Text style={authImageStyles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

function isImageFile(file: { content_type?: string; name?: string }): boolean {
  if (file.content_type?.startsWith('image/')) return true;
  if (file.name && /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(file.name)) return true;
  return false;
}

// Renders a non-image file as a tappable row (name + icon)
function MessageFileLink({
  file,
  containerStyle,
  nameStyle,
}: {
  file: { url: string; name: string; content_type?: string };
  containerStyle: object;
  nameStyle: object;
}) {
  const openFile = async () => {
    try {
      const url =
        file.url.startsWith('http') || file.url.startsWith('data:')
          ? file.url
          : await apiClient.getFileUrl(file.url);
      if (url) await Linking.openURL(url);
    } catch {
      // Opening may fail (e.g. auth, or data URLs on some platforms); file name remains visible
    }
  };
  return (
    <TouchableOpacity style={containerStyle} onPress={openFile} activeOpacity={0.7}>
      <Icon name="paperclip" size={16} color={(nameStyle as { color?: string }).color} />
      <Text style={nameStyle} numberOfLines={1}>
        {file.name || 'File'}
      </Text>
    </TouchableOpacity>
  );
}

interface PickedFile {
  uri: string;
  name: string;
  type?: string;
  base64?: string;
}

function createMarkdownStyles(colors: ColorPalette) {
  return StyleSheet.create({
    body: { color: colors.text, fontSize: 16 },
    paragraph: { marginTop: 0, marginBottom: 8 },
    strong: { color: colors.text, fontWeight: '700' },
    em: { color: colors.text, fontStyle: 'italic' },
    s: { color: colors.textSecondary },
    link: { color: colors.link },
    blockquote: { backgroundColor: colors.codeBackground, borderLeftColor: colors.primary, paddingLeft: 12, marginVertical: 8 },
    code_inline: { backgroundColor: colors.codeBackground, color: colors.codeAccent, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4, fontSize: 14 },
    code_block: { backgroundColor: colors.codeBackground, color: colors.codeText, padding: 12, borderRadius: 8, marginVertical: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
    fence: { backgroundColor: colors.codeBackground, color: colors.codeText, padding: 12, borderRadius: 8, marginVertical: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 14 },
    bullet_list_icon: { color: colors.text },
    ordered_list_icon: { color: colors.text },
    list_item: { color: colors.text },
    heading1: { color: colors.text, fontSize: 24, fontWeight: '700', marginTop: 16, marginBottom: 8 },
    heading2: { color: colors.text, fontSize: 20, fontWeight: '600', marginTop: 14, marginBottom: 6 },
    heading3: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 12, marginBottom: 4 },
    hr: { backgroundColor: colors.surfaceVariant, marginVertical: 12 },
    table: { borderColor: colors.surfaceVariant },
    th: { color: colors.text, borderColor: colors.surfaceVariant, padding: 8 },
    td: { color: colors.text, borderColor: colors.surfaceVariant, padding: 8 },
  });
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      borderBottomColor: colors.surfaceVariant,
      gap: 12,
    },
    backButton: {
      padding: 8,
      margin: -8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modelButton: {
      flex: 1,
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 8,
    },
    modelButtonText: {
      color: colors.text,
      fontSize: 14,
    },
    newChatButton: {
      padding: 8,
      justifyContent: 'center',
      alignItems: 'center',
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
      backgroundColor: colors.buttonPrimary,
    },
    assistantBubble: {
      alignSelf: 'flex-start',
      backgroundColor: colors.surfaceVariant,
    },
    messageRole: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    userMessageRole: {
      fontSize: 12,
      color: colors.buttonPrimaryText,
      marginBottom: 4,
    },
    messageContent: {
      fontSize: 16,
      color: colors.text,
    },
    userMessageContent: {
      fontSize: 16,
      color: colors.buttonPrimaryText,
    },
    messageImage: {
      width: 200,
      height: 200,
      borderRadius: 8,
      marginTop: 8,
      marginBottom: 4,
      backgroundColor: 'rgba(0,0,0,0.1)',
    },
    messageImageContainer: {
      marginTop: 4,
      marginBottom: 4,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    messageImageWrapper: { position: 'relative' },
    messageFileLink: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      marginTop: 4,
      gap: 8,
      alignSelf: 'flex-start',
    },
    messageFileLinkName: {
      fontSize: 14,
      maxWidth: 200,
    },
    messageFileLinksContainer: {
      marginTop: 4,
      marginBottom: 4,
      gap: 4,
    },
    toolUsageContainer: {
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      gap: 6,
    },
    toolUsageLabel: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    toolUsageChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      gap: 6,
      alignSelf: 'flex-start',
      maxWidth: '100%',
    },
    toolUsageChipText: {
      fontSize: 12,
      flex: 1,
    },
    attachments: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      padding: 8,
      gap: 8,
      backgroundColor: colors.background,
    },
    attachmentsPositioned: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    attachmentChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceVariant,
      padding: 8,
      borderRadius: 8,
      gap: 8,
    },
    attachmentName: {
      color: colors.text,
      maxWidth: 120,
    },
    removeAttachment: {
      color: colors.error,
      fontSize: 18,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 12,
      paddingTop: 8,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceVariant,
      gap: 8,
      backgroundColor: colors.background,
    },
    inputRowPositioned: {
      position: 'absolute',
      left: 0,
      right: 0,
    },
    attachButton: {
      padding: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      minHeight: 40,
      backgroundColor: colors.surfaceVariant,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
      lineHeight: 20,
      color: colors.text,
      maxHeight: 100,
      textAlignVertical: 'center',
      includeFontPadding: false,
      borderWidth: 0,
    },
    sendButton: {
      backgroundColor: colors.buttonPrimary,
      width: 40,
      height: 40,
      borderRadius: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sendIconWrap: {
      justifyContent: 'center',
      alignItems: 'center',
      transform: [{ translateX: -1 }],
    },
    sendDisabled: {
      opacity: 0.7,
    },
    sendText: {
      color: colors.buttonPrimaryText,
      fontWeight: '600',
    },
    fullScreenImageContainer: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.95)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullScreenImageCloseButton: {
      position: 'absolute',
      top: 60,
      right: 16,
      zIndex: 1000,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 20,
      width: 40,
      height: 40,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fullScreenImage: {
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    },
  });
}

export function ChatScreen() {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation<ChatNavigationProp>();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const markdownStyles = useMemo(() => createMarkdownStyles(colors), [colors]);
  const { defaultModelId } = useAuth();
  const { chatId } = route.params;
  const insets = useSafeAreaInsets();

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
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<PickedFile[]>([]);
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [toolsList, setToolsList] = useState<Tool[] | null>(null);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputRowHeight, setInputRowHeight] = useState(88);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const messagesListRef = useRef<FlatList>(null);
  const scrollToEndOnLayoutRef = useRef(false);
  const listHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollFollowUpTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastDefaultToolsModelRef = useRef<string | null>(null);

  const attachmentsPositionStyle = useMemo(
    () => ({ bottom: (keyboardHeight > 0 ? keyboardHeight : 0) + inputRowHeight }),
    [keyboardHeight, inputRowHeight],
  );
  const inputRowPositionStyle = useMemo(
    () => ({
      paddingBottom: 8 + (keyboardHeight > 0 ? 0 : insets.bottom),
      bottom: keyboardHeight > 0 ? keyboardHeight : 0,
    }),
    [keyboardHeight, insets.bottom],
  );

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const loadChat = useCallback(async (): Promise<Message[] | undefined> => {
    try {
      const chatData = await apiClient.getChat(chatId);
      if (chatData.messages) {
        setMessages(chatData.messages);
        return chatData.messages;
      }
      if (chatData.chat_model_id) {
        setSelectedModel((prev) => prev ?? chatData.chat_model_id ?? undefined);
      }
      return undefined;
    } catch (error) {
      console.error('Load chat error:', error);
      Alert.alert('Error', `Failed to load chat: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
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

  // Request scroll to end when chat opens or message count changes; actual scroll happens in onContentSizeChange after layout
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      scrollToEndOnLayoutRef.current = true;
    }
  }, [isLoading, messages.length]);

  // During streaming, keep requesting scroll to end so we follow the growing content
  useEffect(() => {
    if (streamingContent !== '') {
      scrollToEndOnLayoutRef.current = true;
    }
  }, [streamingContent]);

  useEffect(() => {
    return () => {
      scrollFollowUpTimeoutsRef.current.forEach(clearTimeout);
      scrollFollowUpTimeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  // Apply default tools from selected model when it changes (backend: model.info.meta.toolIds)
  useEffect(() => {
    if (!selectedModel || !models.length) return;
    if (lastDefaultToolsModelRef.current === selectedModel) return;
    lastDefaultToolsModelRef.current = selectedModel;
    const model = models.find((m) => m.id === selectedModel);
    const defaultIds = model?.info?.meta?.toolIds;
    setSelectedToolIds(Array.isArray(defaultIds) ? [...defaultIds] : []);
  }, [selectedModel, models]);

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
    quality: 0.7 as PhotoQuality, // Compress to 70% quality to reduce file size
    maxWidth: 2048, // Limit width to reduce payload size
    maxHeight: 2048, // Limit height to reduce payload size
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
      const mappedFiles = result.map((f) => ({
        uri: f.uri,
        fileName: f.name ?? 'file',
      }));
      const copyResults = await keepLocalCopy({
        files: mappedFiles as [typeof mappedFiles[0], ...(typeof mappedFiles[0])[]],
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

  const openToolsModal = () => {
    setShowToolsModal(true);
  };

  const loadToolsForModal = useCallback(async () => {
    setToolsLoading(true);
    try {
      const token = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      const list = token ? await getTools(token) : [];
      setToolsList(list);
    } catch {
      setToolsList([]);
    } finally {
      setToolsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showToolsModal && toolsList === null && !toolsLoading) {
      loadToolsForModal();
    }
  }, [showToolsModal, toolsList, toolsLoading, loadToolsForModal]);

  const showAttachOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Take Photo', 'Photo Library', 'Browse', 'Tools'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickCamera();
          else if (buttonIndex === 2) pickPhotoLibrary();
          else if (buttonIndex === 3) pickFile();
          else if (buttonIndex === 4) openToolsModal();
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
          { text: 'Tools', onPress: openToolsModal },
        ]
      );
    }
  };

  const removeFile = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const buildMessageContent = (text: string): Message['content'] => {
    if (attachedFiles.length === 0) return text;
    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string }; _fileName?: string }
    > = [];
    if (text.trim()) {
      parts.push({ type: 'text', text });
    }
    for (const file of attachedFiles) {
      const mime = file.type || 'application/octet-stream';
      const dataUrl = `data:${mime};base64,${file.base64}`;
      parts.push({
        type: 'image_url',
        image_url: { url: dataUrl },
        _fileName: file.name,
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
      await apiClient.updateChatWithNewMessage(
        chatId,
        messages,
        userMessage.content,
        selectedModel
      );
      const stream = apiClient.streamChat(chatId, {
        model: selectedModel,
        messages: allMessages,
        stream: true,
        ...(selectedToolIds.length > 0 ? { tool_ids: selectedToolIds } : {}),
      });

      let fullContent = '';
      for await (const chunk of stream) {
        fullContent += chunk;
        setStreamingContent(fullContent);
      }

      const assistantContent = fullContent.trim() || '(No response received from model.)';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantContent },
      ]);
      setStreamingContent('');

      // Persist assistant message so it appears when user reopens the chat
      try {
        await apiClient.updateChatAssistantContent(chatId, assistantContent);
      } catch (err) {
        console.warn('updateChatAssistantContent failed:', err);
      }

      // Reload chat to get server state; notify backend for title generation etc.
      try {
        const serverMessages = await loadChat();
        if (
          serverMessages?.length &&
          serverMessages[serverMessages.length - 1]?.role === 'assistant'
        ) {
          const last = serverMessages[serverMessages.length - 1];
          const serverHasContent =
            typeof last.content === 'string'
              ? last.content.trim() !== ''
              : Array.isArray(last.content) && last.content.length > 0;
          if (!serverHasContent) {
            setMessages((prev) => {
              const next = [...prev];
              if (next.length > 0 && next[next.length - 1].role === 'assistant') {
                next[next.length - 1] = { ...next[next.length - 1], content: assistantContent };
              }
              return next;
            });
          }
          const lastId = (last as { id?: string }).id;
          apiClient
            .notifyChatCompleted(chatId, {
              model: selectedModel,
              messageId: lastId,
            })
            .catch((err) => {
              console.warn('notifyChatCompleted failed:', err);
            });
        } else {
          apiClient
            .notifyChatCompleted(chatId, { model: selectedModel })
            .catch((err) => {
              console.warn('notifyChatCompleted failed:', err);
            });
        }
      } catch (error) {
        console.error('Failed to reload chat after streaming:', error);
        apiClient
          .notifyChatCompleted(chatId, { model: selectedModel })
          .catch((err) => {
            console.warn('notifyChatCompleted failed:', err);
          });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
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
    const isUser = item.role === 'user';
    let contentArray: unknown[] | null = null;
    if (Array.isArray(item.content)) {
      contentArray = item.content as unknown[];
    } else if (typeof item.content === 'string') {
      try {
        const parsed = JSON.parse(item.content);
        if (Array.isArray(parsed)) contentArray = parsed;
      } catch {}
    }

    const textParts: string[] = [];
    const imageUrls: string[] = [];
    const messageFiles: Array<{ url: string; name: string; content_type?: string }> = [];

    if (item.files && Array.isArray(item.files)) {
      for (const file of item.files) {
        if (file.url) {
          messageFiles.push({
            url: file.url,
            name: file.name || 'File',
            content_type: file.content_type,
          });
          if (isImageFile(file)) {
            imageUrls.push(file.url);
          }
        }
      }
    }

    if (contentArray) {
      for (const part of contentArray) {
        if (typeof part === 'string') {
          textParts.push(part);
        } else if (part && typeof part === 'object' && part !== null) {
          const partObj = part as Record<string, unknown>;
          if (partObj.type === 'image_url' && 'image_url' in partObj) {
            const imageUrl = partObj.image_url as { url?: string };
            if (imageUrl?.url) imageUrls.push(imageUrl.url);
          } else if (partObj.type === 'text' && 'text' in partObj && typeof partObj.text === 'string') {
            textParts.push(partObj.text);
          } else if (partObj.type === 'file' && ('id' in partObj || 'url' in partObj)) {
            const fileId = partObj.id as string | undefined;
            const fileUrl = partObj.url as string | undefined;
            if (fileId || fileUrl) {
              const finalUrl = fileUrl?.startsWith('http') ? fileUrl : fileId || fileUrl || '';
              if (finalUrl) {
                const existing = messageFiles.find((f) => f.url === finalUrl || f.url.endsWith(finalUrl));
                if (existing) {
                  if (isImageFile(existing) && !imageUrls.includes(existing.url)) imageUrls.push(existing.url);
                } else {
                  messageFiles.push({
                    url: finalUrl,
                    name: (partObj.name as string) || 'File',
                    content_type: partObj.content_type as string | undefined,
                  });
                }
              }
            }
          }
        }
      }
    }

    const nonImageFiles = messageFiles.filter((f) => !isImageFile(f));

    const textContent = contentArray
      ? textParts.join('\n')
      : typeof item.content === 'string'
        ? item.content
        : '';

    return (
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <Text style={isUser ? styles.userMessageRole : styles.messageRole}>
          {isUser ? 'You' : 'Assistant'}
        </Text>
        {textContent ? (
          isUser ? (
            <Text style={styles.userMessageContent}>{textContent}</Text>
          ) : (
            <Markdown style={markdownStyles} mergeStyle={true}>
              {textContent}
            </Markdown>
          )
        ) : null}
        {imageUrls.length > 0 && (
          <View style={styles.messageImageContainer}>
            {imageUrls.map((url, index) => (
              <View key={index} style={styles.messageImageWrapper}>
                <AuthenticatedImage
                  url={url}
                  style={styles.messageImage}
                  onPress={() => setFullScreenImageUrl(url)}
                />
              </View>
            ))}
          </View>
        )}
        {nonImageFiles.length > 0 && (
          <View style={styles.messageFileLinksContainer}>
            {nonImageFiles.map((file, index) => (
              <MessageFileLink
                key={index}
                file={file}
                containerStyle={[styles.messageFileLink, { backgroundColor: colors.surfaceVariant }]}
                nameStyle={[styles.messageFileLinkName, { color: colors.text }]}
              />
            ))}
          </View>
        )}
        {!isUser && (() => {
          const msgSources = (item as Message).sources;
          if (!msgSources?.length) return null;
          const toolSources = msgSources.filter(
            (s) => s.tool_result && (s.source?.name ?? s.metadata?.[0]?.source)
          );
          if (toolSources.length === 0) return null;
          return (
            <View style={[styles.toolUsageContainer, { borderTopColor: colors.border + '80' }]}>
              <Text style={[styles.toolUsageLabel, { color: colors.textSecondary }]}>
                Tools used
              </Text>
              {toolSources.map((s, idx) => {
                const name = s.source?.name ?? s.metadata?.[0]?.source ?? 'Tool';
                return (
                  <View key={idx} style={[styles.toolUsageChip, { backgroundColor: colors.background }]}>
                    <Icon name="tool" size={12} color={colors.textSecondary} />
                    <Text style={[styles.toolUsageChipText, { color: colors.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })()}
      </View>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Approximate height of input row + attachments so list can scroll above them
  const inputAreaHeight = inputRowHeight + (attachedFiles.length > 0 ? 52 : 0);
  const listBottomPadding = 16 + inputAreaHeight + keyboardHeight + (keyboardHeight > 0 ? 0 : insets.bottom);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="chevron-left" size={24} color={colors.primary} />
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
        <TouchableOpacity
          style={styles.newChatButton}
          onPress={async () => {
            if (isCreatingNewChat) return;
            setIsCreatingNewChat(true);
            try {
              const chat = await apiClient.createChat();
              navigation.replace('Chat', { chatId: chat.id });
            } catch (error) {
              console.error('Failed to create chat:', error);
              Alert.alert('Error', 'Failed to start a new chat. Please try again.');
            } finally {
              setIsCreatingNewChat(false);
            }
          }}
          disabled={isCreatingNewChat}
        >
          {isCreatingNewChat ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="message-square" size={22} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ListPicker
        visible={showModelPicker}
        title="Select Model"
        items={models.map((m) => ({ ...m, label: m.name }))}
        selectedId={selectedModel ?? null}
        onSelect={(id) => {
          setSelectedModel(id ?? undefined);
        }}
        onClose={() => setShowModelPicker(false)}
        searchPlaceholder="Search models..."
        emptyMessage={
          models.length === 0
            ? 'No models available. Please check your connection.'
            : 'No models match your search.'
        }
        loading={modelsLoading}
        loadingMessage="Loading models..."
        searchFilter={(item, query) => {
          const lowerQuery = query.toLowerCase();
          return (
            item.label.toLowerCase().includes(lowerQuery) ||
            item.id.toLowerCase().includes(lowerQuery)
          );
        }}
      />

      <ListPicker
        visible={showToolsModal}
        title="Tools"
        multiSelect
        items={toolsList ? toolsList.map((t) => ({ id: t.id, label: t.name })) : []}
        selectedIds={selectedToolIds}
        onSelect={(ids) => setSelectedToolIds(ids)}
        onClose={() => {
          setShowToolsModal(false);
          setToolsList(null);
        }}
        searchPlaceholder="Search tools..."
        emptyMessage="No tools available"
        loading={toolsLoading}
        loadingMessage="Loading tools..."
        allowClear
        clearLabel="Clear selection"
      />

      <FlatList
        ref={messagesListRef}
        data={displayMessages}
        renderItem={renderMessage}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={[styles.messagesList, { paddingBottom: listBottomPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListFooterComponent={null}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h > 0) listHeightRef.current = h;
        }}
        onContentSizeChange={(_w, contentHeight) => {
          contentHeightRef.current = contentHeight;
          if (!scrollToEndOnLayoutRef.current) return;
          scrollFollowUpTimeoutsRef.current.forEach(clearTimeout);
          scrollFollowUpTimeoutsRef.current = [];
          const doScrollToBottom = () => {
            const ch = contentHeightRef.current;
            const lh = listHeightRef.current;
            if (lh > 0 && ch > 0) {
              messagesListRef.current?.scrollToOffset({
                offset: Math.max(0, ch - lh),
                animated: false,
              });
            } else {
              messagesListRef.current?.scrollToEnd({ animated: false });
            }
          };
          doScrollToBottom();
          // Follow-ups catch late layout (images, markdown); contentHeightRef is updated if content grows
          scrollFollowUpTimeoutsRef.current = [
            setTimeout(doScrollToBottom, 150),
            setTimeout(doScrollToBottom, 400),
            setTimeout(doScrollToBottom, 800),
          ];
          if (!streamingContent) scrollToEndOnLayoutRef.current = false;
        }}
      />

      {attachedFiles.length > 0 && (
        <View
          style={[styles.attachments, styles.attachmentsPositioned, attachmentsPositionStyle]}
        >
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

      <View
        style={[styles.inputRow, styles.inputRowPositioned, inputRowPositionStyle]}
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height;
          if (height > 0) {
            setInputRowHeight(height);
          }
        }}
      >
        <TouchableOpacity style={styles.attachButton} onPress={showAttachOptions}>
          <Icon name="paperclip" size={24} color={colors.text} />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={colors.placeholder}
          value={inputText}
          onChangeText={setInputText}
          multiline
          textAlignVertical="center"
          maxLength={4000}
          editable={!isSending}
        />
        <TouchableOpacity
          style={[styles.sendButton, isSending && styles.sendDisabled]}
          onPress={sendMessage}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator size="small" color={colors.buttonPrimaryText} />
          ) : (
            <View style={styles.sendIconWrap}>
              <Icon name="send" size={18} color={colors.buttonPrimaryText} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={fullScreenImageUrl !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setFullScreenImageUrl(null)}
      >
        <View style={styles.fullScreenImageContainer}>
          <TouchableOpacity
            style={[styles.fullScreenImageCloseButton, { top: insets.top + 16 }]}
            onPress={() => setFullScreenImageUrl(null)}
          >
            <Icon name="x" size={28} color={colors.text} />
          </TouchableOpacity>
          {fullScreenImageUrl && (
            <AuthenticatedImage
              url={fullScreenImageUrl}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>

    </View>
  );
}

