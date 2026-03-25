/**
 * SearchBar — Inline search bar for document viewers.
 * Shows match count, current index, and next/prev navigation.
 * Includes built-in 300ms debounce for search queries.
 */
import type { SearchState } from "@/src/types/document-viewer.types";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  state: SearchState;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  textColor?: string;
  bgColor?: string;
  borderColor?: string;
}

export function SearchBar({
  state,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
  textColor = "#333",
  bgColor = "#fff",
  borderColor = "#e0e0e0",
}: Props) {
  const [localQuery, setLocalQuery] = useState(state.query);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local query when parent clears it (e.g. on close)
  useEffect(() => {
    if (state.query === "" && localQuery !== "") {
      setLocalQuery("");
    }
  }, [state.query]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = useCallback(
    (text: string) => {
      setLocalQuery(text);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onQueryChange(text);
      }, 300);
    },
    [onQueryChange],
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bgColor, borderBottomColor: borderColor },
      ]}
    >
      <MaterialIcons name="search" size={20} color="#999" />
      <TextInput
        value={localQuery}
        onChangeText={handleChange}
        placeholder="Search in document..."
        placeholderTextColor="#999"
        autoFocus
        style={[styles.input, { color: textColor }]}
        returnKeyType="search"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {localQuery.length > 0 && (
        <Text style={styles.counter}>
          {state.matchCount > 0
            ? `${state.currentIndex + 1}/${state.matchCount}`
            : "0 results"}
        </Text>
      )}
      {state.matchCount > 1 && (
        <>
          <Pressable onPress={onPrev} style={styles.navBtn} hitSlop={8}>
            <MaterialIcons
              name="keyboard-arrow-up"
              size={22}
              color={textColor}
            />
          </Pressable>
          <Pressable onPress={onNext} style={styles.navBtn} hitSlop={8}>
            <MaterialIcons
              name="keyboard-arrow-down"
              size={22}
              color={textColor}
            />
          </Pressable>
        </>
      )}
      <Pressable onPress={onClose} style={styles.navBtn} hitSlop={8}>
        <MaterialIcons name="close" size={20} color="#999" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    gap: 6,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 4,
  },
  counter: {
    fontSize: 12,
    color: "#888",
    marginHorizontal: 4,
  },
  navBtn: {
    padding: 4,
  },
});
