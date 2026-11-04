import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import { ErrorLine } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space } from "@/theme";

type AuthFieldProps = TextInputProps & {
  label: string;
  error?: string;
  /** Control shown inside the input on the right, e.g. the password visibility toggle. */
  trailing?: ReactNode;
};

/** Labeled text input matching the sign-in design: label above, bordered box below. */
export function AuthField({ label, error, trailing, ...input }: AuthFieldProps) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, error ? styles.boxError : null]}>
        <TextInput placeholderTextColor="#a5ada9" accessibilityLabel={label} {...input} style={styles.input} />
        {trailing}
      </View>
      <ErrorLine message={error} />
    </View>
  );
}

export function PasswordInput(props: Omit<AuthFieldProps, "secureTextEntry" | "trailing">) {
  const [visible, setVisible] = useState(false);
  return (
    <AuthField
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
        >
          <Icon name={visible ? "eyeOff" : "eye"} color={colors.muted} />
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: space[2], fontFamily: font.bodyBold, fontSize: 14, color: colors.ink },
  box: {
    minHeight: 55, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[4],
    borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white,
  },
  boxError: { borderColor: colors.coral },
  input: { flex: 1, paddingVertical: space[3], fontFamily: font.body, fontSize: 16, color: colors.ink },
});
