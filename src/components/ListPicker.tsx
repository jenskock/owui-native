/**
 * Reusable list picker component
 * Full-page modal with search, Save, and Abort buttons
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../contexts/ThemeContext';
import type { ColorPalette } from '../constants/colors';

export interface ListPickerItem {
  id: string;
  label: string;
  [key: string]: any; // Allow additional properties
}

interface ListPickerProps<T extends ListPickerItem> {
  visible: boolean;
  title: string;
  items: T[];
  selectedId: string | null | undefined;
  onSelect: (id: string | null) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  emptyMessage?: string;
  loading?: boolean;
  loadingMessage?: string;
  renderItem?: (item: T, isSelected: boolean, onPress: () => void) => React.ReactElement | null;
  searchFilter?: (item: T, query: string) => boolean;
  allowClear?: boolean;
  clearLabel?: string;
}

function createStyles(colors: ColorPalette) {
  return StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.background,
    },
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
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    searchContainer: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    listContainer: {
      flex: 1,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    itemRowSelected: {
      backgroundColor: colors.surfaceVariant,
    },
    itemRowText: {
      fontSize: 16,
      color: colors.text,
      flex: 1,
    },
    itemRowTextSelected: {
      fontWeight: '600',
    },
    itemRowCheck: {
      color: colors.primary,
      fontSize: 18,
      marginLeft: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 16,
      textAlign: 'center',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 16,
      marginTop: 12,
    },
    footer: {
      flexDirection: 'row',
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceVariant,
      gap: 12,
    },
    footerButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    abortButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    abortButtonText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
    saveButton: {
      backgroundColor: colors.buttonPrimary,
    },
    saveButtonText: {
      color: colors.buttonPrimaryText,
      fontSize: 16,
      fontWeight: '600',
    },
    clearButton: {
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceVariant,
    },
    clearButtonText: {
      color: colors.textSecondary,
      fontSize: 16,
    },
  });
}

export function ListPicker<T extends ListPickerItem>({
  visible,
  title,
  items,
  selectedId,
  onSelect,
  onClose,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items available',
  loading = false,
  loadingMessage = 'Loading...',
  renderItem,
  searchFilter,
  allowClear = false,
  clearLabel = 'Clear selection',
}: ListPickerProps<T>) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSelection, setPendingSelection] = useState<string | null | undefined>(selectedId);

  // Reset pending selection when modal opens/closes or selectedId changes externally
  useEffect(() => {
    if (visible) {
      setPendingSelection(selectedId);
      setSearchQuery('');
    }
  }, [visible, selectedId]);

  const defaultSearchFilter = (item: T, query: string): boolean => {
    const lowerQuery = query.toLowerCase();
    return item.label.toLowerCase().includes(lowerQuery);
  };

  const filterFn = searchFilter || defaultSearchFilter;

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    return items.filter((item) => filterFn(item, searchQuery));
  }, [items, searchQuery, filterFn]);

  const handleSave = () => {
    onSelect(pendingSelection ?? null);
    onClose();
  };

  const handleAbort = () => {
    setPendingSelection(selectedId);
    setSearchQuery('');
    onClose();
  };

  const handleClear = () => {
    setPendingSelection(null);
  };

  const defaultRenderItem = (item: T) => {
    const isSelected = pendingSelection === item.id;
    return (
      <TouchableOpacity
        style={[styles.itemRow, isSelected && styles.itemRowSelected]}
        onPress={() => setPendingSelection(item.id)}
      >
        <Text
          style={[styles.itemRowText, isSelected && styles.itemRowTextSelected]}
          numberOfLines={1}
        >
          {item.label}
        </Text>
        {isSelected && <Text style={styles.itemRowCheck}>✓</Text>}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleAbort}
    >
      <View style={[styles.modalOverlay, { paddingTop: insets.top }]}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={searchPlaceholder}
              placeholderTextColor={colors.placeholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{loadingMessage}</Text>
            </View>
          ) : (
            <>
              {allowClear && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
                  <Text style={styles.clearButtonText}>{clearLabel}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.listContainer}>
                <FlatList
                  data={filteredItems}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => {
                    const rendered = renderItem
                      ? renderItem(item, pendingSelection === item.id, () =>
                          setPendingSelection(item.id)
                        )
                      : defaultRenderItem(item);
                    return rendered ?? null;
                  }}
                  ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                      <Text style={styles.emptyText}>
                        {searchQuery.trim()
                          ? `No items found matching "${searchQuery}"`
                          : emptyMessage}
                      </Text>
                    </View>
                  }
                />
              </View>
            </>
          )}

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <TouchableOpacity style={[styles.footerButton, styles.abortButton]} onPress={handleAbort}>
              <Text style={styles.abortButtonText}>Abort</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.footerButton, styles.saveButton]} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
