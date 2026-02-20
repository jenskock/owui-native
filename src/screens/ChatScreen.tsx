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
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Icon from 'react-native-vector-icons/Feather';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
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
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { apiClient } from '../api/client';
import type { Message, ModelInfo } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import type { ColorPalette } from '../constants/colors';
import { ListPicker } from '../components/ListPicker';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;

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
      <View style={[style, { justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.1)' }]}>
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
      onLoad={() => {
        setError(null);
        console.log('Image loaded successfully');
      }}
    />
  );

  return (
    <View style={{ position: 'relative' }}>
      {onPress ? (
        <TouchableOpacity onPress={onPress} activeOpacity={0.9}>
          {imageComponent}
        </TouchableOpacity>
      ) : (
        imageComponent
      )}
      {error && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 8,
        }}>
          <Text style={{ color: 'white', fontSize: 10, textAlign: 'center' }}>{error}</Text>
        </View>
      )}
    </View>
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
    backText: {
      color: colors.primary,
      fontSize: 16,
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
  const navigation = useNavigation();
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
  const [attachedFiles, setAttachedFiles] = useState<PickedFile[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputRowHeight, setInputRowHeight] = useState(88);
  const [fullScreenImageUrl, setFullScreenImageUrl] = useState<string | null>(null);
  const messagesListRef = useRef<FlatList>(null);

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
    if (!isLoading && messages.length > 0) {
      const t = setTimeout(() => {
        messagesListRef.current?.scrollToEnd({ animated: false });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [isLoading, messages.length]);

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
      
      // Reload chat to get the complete message with files attached
      // This ensures we have the full message structure including any images/files
      try {
        await loadChat();
      } catch (error) {
        console.error('Failed to reload chat after streaming:', error);
        // Continue anyway - we already have the content
      }
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
    const isUser = item.role === 'user';
    let contentArray: unknown[] | null = null;
    
    // Handle content - could be string, array, or JSON string
    if (Array.isArray(item.content)) {
      contentArray = item.content as unknown[];
      console.log('Message content is array:', item.role, contentArray.length, 'parts');
    } else if (typeof item.content === 'string') {
      // Try to parse if it's a JSON string
      try {
        const parsed = JSON.parse(item.content);
        if (Array.isArray(parsed)) {
          contentArray = parsed;
          console.log('Message content parsed as array:', item.role, contentArray.length, 'parts');
        }
      } catch {
        // Not JSON, treat as plain text
      }
    }
    
    // Debug: log files if present
    if (item.files && Array.isArray(item.files)) {
      console.log('Message has files:', item.role, item.files.length, 'files');
    }
    

    const textParts: string[] = [];
    const imageUrls: string[] = [];

    // Handle images from content array (for newly sent messages with base64 data URLs or file IDs)
    if (contentArray) {
      console.log('Processing content array with', contentArray.length, 'parts');
      for (const part of contentArray) {
        if (typeof part === 'string') {
          textParts.push(part);
        } else if (part && typeof part === 'object' && part !== null) {
          const partObj = part as Record<string, unknown>;
          console.log('Content part type:', partObj.type, 'Keys:', Object.keys(partObj));
          
          if (partObj.type === 'image_url' && 'image_url' in partObj) {
            const imageUrl = partObj.image_url as { url?: string };
            if (imageUrl?.url) {
              // If it's a data URL, use it directly
              // If it's just a file ID (UUID format), convert to full URL
              // Otherwise, use as-is (might be full URL)
              let finalUrl = imageUrl.url;
              if (!finalUrl.startsWith('data:') && !finalUrl.startsWith('http')) {
                // Looks like a file ID, convert to full URL
                // AuthenticatedImage will handle the conversion if needed
                finalUrl = imageUrl.url;
              }
              console.log('Found image_url in content array:', finalUrl);
              imageUrls.push(finalUrl);
            }
          } else if (partObj.type === 'text' && 'text' in partObj && typeof partObj.text === 'string') {
            textParts.push(partObj.text);
          } else if (partObj.type === 'file' && ('id' in partObj || 'url' in partObj)) {
            // Handle file type in content array
            const fileId = partObj.id as string | undefined;
            const fileUrl = partObj.url as string | undefined;
            if (fileId || fileUrl) {
              // If we have a full URL, use it; otherwise construct from file ID
              // The AuthenticatedImage component will handle URL construction if needed
              const finalUrl = fileUrl?.startsWith('http') ? fileUrl : fileId || fileUrl || '';
              if (finalUrl) {
                console.log('Found file in content array:', finalUrl);
                imageUrls.push(finalUrl);
              }
            }
          }
        }
      }
    }

    // Handle files from API (for messages loaded from server)
    if (item.files && Array.isArray(item.files)) {
      for (const file of item.files) {
        // Check if it's an image based on content_type or file extension
        const isImage = file.content_type?.startsWith('image/') || 
                       (file.name && /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name));
        if (isImage && file.url) {
          console.log('Found image file:', file.url, 'content_type:', file.content_type);
          imageUrls.push(file.url);
        }
      }
    }

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
              <View key={index} style={{ position: 'relative' }}>
                <AuthenticatedImage
                  url={url}
                  style={styles.messageImage}
                  onPress={() => setFullScreenImageUrl(url)}
                />
              </View>
            ))}
          </View>
        )}
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

      <FlatList
        ref={messagesListRef}
        data={displayMessages}
        renderItem={renderMessage}
        keyExtractor={(_, i) => i.toString()}
        contentContainerStyle={[styles.messagesList, { paddingBottom: listBottomPadding }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        ListFooterComponent={null}
      />

      {attachedFiles.length > 0 && (
        <View
          style={[
            styles.attachments,
            styles.attachmentsPositioned,
            { bottom: (keyboardHeight > 0 ? keyboardHeight : 0) + inputRowHeight },
          ]}
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
        style={[
          styles.inputRow,
          styles.inputRowPositioned,
          {
            paddingBottom: 8 + (keyboardHeight > 0 ? 0 : insets.bottom),
            bottom: keyboardHeight > 0 ? keyboardHeight : 0,
          },
        ]}
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
            <Icon name="send" size={18} color={colors.buttonPrimaryText} />
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

