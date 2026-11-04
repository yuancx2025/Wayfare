import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ErrorLine } from "@/components/ui";
import { CODE_LENGTH, cleanCode } from "@/auth/validation";
import { colors, font, radius } from "@/theme";

interface CodeInputProps {
  value: string;
  onChange: (code: string) => void;
  error?: string;
  autoFocus?: boolean;
}

/**
 * Six boxes backed by one invisible TextInput laid over them. Because it is a single real input,
 * paste, SMS/email code autofill, deletion, and screen readers all work without extra code.
 */
export function CodeInput({ value, onChange, error, autoFocus = true }: CodeInputProps) {
  const [focused, setFocused] = useState(false);
  // The box where the next digit goes; stays on the last box once the code is full.
  const activeIndex = Math.min(value.length, CODE_LENGTH - 1);

  return (
    <View>
      <View style={styles.row}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <View
            key={i}
            style={[styles.box, focused && i === activeIndex && styles.boxActive, error ? styles.boxError : null]}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <Text style={styles.digit}>{value[i] ?? ""}</Text>
          </View>
        ))}
        <TextInput
          value={value}
          onChangeText={(text) => onChange(cleanCode(text))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          caretHidden
          accessibilityLabel={`Verification code, ${CODE_LENGTH} digits`}
          style={styles.hiddenInput}
        />
      </View>
      <ErrorLine message={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", gap: 7 },
  box: {
    flex: 1, maxWidth: 56, height: 58, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.line,
    backgroundColor: colors.white, alignItems: "center", justifyContent: "center",
  },
  boxActive: { borderColor: colors.forest },
  boxError: { borderColor: colors.coral },
  digit: { fontFamily: font.display, fontSize: 24, color: colors.ink },
  // Covers the boxes so any tap focuses the real input; invisible but still focusable for autofill.
  hiddenInput: { ...StyleSheet.absoluteFill, opacity: 0, color: "transparent" },
});
