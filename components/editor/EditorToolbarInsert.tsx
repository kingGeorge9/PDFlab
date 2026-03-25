/**
 * EditorToolbarInsert.tsx
 *
 * Insert tab of the WPS-style editor toolbar.
 * Shows a list of insertable content types: Picture, Camera, Text Box,
 * Shapes, Signature, Comment, Date & Time, Hyperlink, Bookmark,
 * Attachment, Blank Page.
 */

import { INSERT_ITEMS, type ModalType } from "@/src/types/editor.types";
import React, { useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useDocument } from "./DocumentContext";

const MODAL_ITEMS: ReadonlySet<string> = new Set([
  "picture",
  "signature",
  "comment",
  "datetime",
  "hyperlink",
  "bookmark",
  "attachment",
  "table",
]);

export default function EditorToolbarInsert() {
  const { dispatch, sendScript } = useDocument();

  const handleItem = useCallback(
    (key: string) => {
      if (MODAL_ITEMS.has(key)) {
        dispatch({ type: "SET_MODAL", modal: key as ModalType });
        return;
      }
      if (key === "textbox") {
        sendScript("insertTextBox();");
      } else if (key === "blankpage") {
        sendScript("insertBlankPage();");
      }
    },
    [dispatch, sendScript],
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {INSERT_ITEMS.map((item, index) => (
        <TouchableOpacity
          key={item.key}
          style={[
            styles.item,
            index < INSERT_ITEMS.length - 1 && styles.itemBorder,
          ]}
          onPress={() => handleItem(item.key)}
          activeOpacity={0.7}
        >
          <View style={styles.iconWrap}>
            <Text style={styles.icon}>{item.icon}</Text>
          </View>
          <Text style={styles.label}>{item.label}</Text>
          {item.sub ? <Text style={styles.sub}>{item.sub}</Text> : null}
          <View style={styles.spacer} />
          <Text style={styles.arrow}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  itemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E0E0E0",
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: { fontSize: 18 },
  label: { fontSize: 15, color: "#212121", fontWeight: "500" },
  sub: { fontSize: 12, color: "#9E9E9E", marginLeft: 4 },
  spacer: { flex: 1 },
  arrow: { fontSize: 20, color: "#BDBDBD", fontWeight: "300" },
});
