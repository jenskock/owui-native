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

interface ListPickerPropsBase<T extends ListPickerItem> {
  visible: boolean;
  title: string;
  items: T[];
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

interface ListPickerPropsSingle<T extends ListPickerItem> extends ListPickerPropsBase<T> {
  multiSelect?: false;
  selectedId: string | null | undefined;
  onSelect: (id: string | null) => void;
}

interface ListPickerPropsMulti<T extends ListPickerItem> extends ListPickerPropsBase<T> {
  multiSelect: true;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}

export type ListPickerProps<T extends ListPickerItem> =
  | ListPickerPropsSingle<T>
  | ListPickerPropsMulti<T>;

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

export function ListPicker<T extends ListPickerItem>(props: ListPickerProps<T>) {
  const {
    visible,
    title,
    items,
    onClose,
    searchPlaceholder = 'Search...',
    emptyMessage = 'No items available',
    loading = false,
    loadingMessage = 'Loading...',
    renderItem,
    searchFilter,
    allowClear = false,
    clearLabel = 'Clear selection',
  } = props;

  const isMulti = props.multiSelect === true;
  const selectedId = !isMulti ? props.selectedId : undefined;
  const selectedIds = isMulti ? props.selectedIds : undefined;
  const onSelectSingle = !isMulti ? props.onSelect : undefined;
  const onSelectMulti = isMulti ? props.onSelect : undefined;

  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingSelection, setPendingSelection] = useState<string | null | undefined>(undefined);
  const [pendingSelectionIds, setPendingSelectionIds] = useState<string[]>([]);

  // Reset pending selection when modal opens/closes or selection changes externally
  useEffect(() => {
    if (visible) {
      setSearchQuery('');
      if (isMulti && selectedIds) {
        setPendingSelectionIds([...selectedIds]);
      } else if (!isMulti) {
        setPendingSelection(selectedId);
      }
    }
  }, [visible, isMulti, selectedId, selectedIds]);

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
    if (isMulti) {
      (onSelectMulti as (ids: string[]) => void)(pendingSelectionIds);
    } else {
      onSelectSingle!(pendingSelection ?? null);
    }
    onClose();
  };

  const handleAbort = () => {
    if (isMulti && selectedIds) {
      setPendingSelectionIds([...selectedIds]);
    } else {
      setPendingSelection(selectedId);
    }
    setSearchQuery('');
    onClose();
  };

  const handleClear = () => {
    if (isMulti) {
      setPendingSelectionIds([]);
    } else {
      setPendingSelection(null);
    }
  };

  const toggleMulti = (id: string) => {
    setPendingSelectionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const defaultRenderItem = (item: T) => {
    const isSelected = isMulti
      ? pendingSelectionIds.includes(item.id)
      : pendingSelection === item.id;
    const onPress = isMulti
      ? () => toggleMulti(item.id)
      : () => setPendingSelection(item.id);
    return (
      <TouchableOpacity
        style={[styles.itemRow, isSelected && styles.itemRowSelected]}
        onPress={onPress}
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
                    const isSelected = isMulti
                      ? pendingSelectionIds.includes(item.id)
                      : pendingSelection === item.id;
                    const onPress = isMulti
                      ? () => toggleMulti(item.id)
                      : () => setPendingSelection(item.id);
                    const rendered = renderItem
                      ? renderItem(item, isSelected, onPress)
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
