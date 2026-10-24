import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { initials } from "@/domain/logic/profile";
import { profileSchema, type ProfileValues } from "@/domain/schemas";
import type { Me, ProfilePatch } from "@/domain/types";
import { ApiError } from "@/lib/api";
import { goBackToProfile } from "@/lib/back";
import { errorMessage, useStore } from "@/state/store";
import { Button, ErrorLine, FieldInput, FormField, Spinner, TopBar } from "@/components/ui";
import { colors, font, space } from "@/theme";

export default function EditProfile() {
  const { me, hydrated, loadError, refresh } = useStore();
  if (!hydrated) {
    return <View style={styles.loading}><Spinner label="Loading your profile" /></View>;
  }
  if (loadError || !me) {
    return (
      <View style={styles.screen}>
        <TopBar title="Edit profile" onBack={goBackToProfile} />
        <View style={styles.loading}>
          <ErrorLine message={loadError ?? "Couldn't load your profile."} />
          <Button icon="refresh" onPress={() => { void refresh(); }}>Try again</Button>
        </View>
      </View>
    );
  }
  return <EditProfileForm me={me} />;
}

function EditProfileForm({ me }: { me: Me }) {
  const { saveProfile } = useStore();
  const [formError, setFormError] = useState<string | null>(null);
  // Captured once so a later setMe cannot replace text the user is already editing.
  const [seeded] = useState<ProfileValues>(() => ({ name: me.name, home: me.home }));
  const { control, handleSubmit, setError, formState: { errors, isDirty, isSubmitting, dirtyFields } } = useForm<ProfileValues>({
    defaultValues: seeded,
    resolver: zodResolver(profileSchema),
  });
  const preview = initials(useWatch({ control, name: "name" }));

  const submitInFlight = useRef(false);
  const validateAndSave = handleSubmit(async (values) => {
    const patch: ProfilePatch = {};
    if (dirtyFields.name) patch.name = values.name;
    if (dirtyFields.home) patch.home = values.home;
    setFormError(null);
    try {
      await saveProfile(patch);
      goBackToProfile();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        let applied = false;
        for (const field of ["name", "home"] as const) {
          const message = e.fieldErrors[field];
          if (!message) continue;
          setError(field, { message });
          applied = true;
        }
        if (applied) return;
      }
      setFormError(errorMessage(e));
    }
  });

  const submit = async () => {
    if (submitInFlight.current || !isDirty) return;
    submitInFlight.current = true;
    try {
      await validateAndSave();
    } finally {
      submitInFlight.current = false;
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar title="Edit profile" onBack={goBackToProfile} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{preview}</Text></View>
          <Text style={styles.previewText}>Your initials update with your name.</Text>
        </View>
        <Controller
          control={control}
          name="name"
          render={({ field: { value, onChange, onBlur } }) => (
            <View>
              <FormField icon="user" label="Name" error={errors.name?.message}>
                <FieldInput
                  value={value}
                  editable={!isSubmitting}
                  onChangeText={(text) => { setFormError(null); onChange(text); }}
                  onBlur={onBlur}
                  placeholder="Your name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={120}
                  returnKeyType="next"
                />
              </FormField>
              <Text style={styles.hint}>Required · Up to 120 characters</Text>
            </View>
          )}
        />
        <Controller
          control={control}
          name="home"
          render={({ field: { value, onChange, onBlur } }) => (
            <View>
              <FormField icon="pin" label="Home location" error={errors.home?.message}>
                <FieldInput
                  value={value}
                  editable={!isSubmitting}
                  onChangeText={(text) => { setFormError(null); onChange(text); }}
                  onBlur={onBlur}
                  placeholder="City or region"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={120}
                  returnKeyType="done"
                  onSubmitEditing={() => { void submit(); }}
                />
              </FormField>
              <Text style={styles.hint}>City or region · Optional. Clear it to remove your home.</Text>
            </View>
          )}
        />
        <ErrorLine message={formError} />
      </ScrollView>
      <View style={styles.footer}>
        <Button icon="check" disabled={!isDirty || isSubmitting} onPress={() => { void submit(); }}>
          {isSubmitting ? "Saving…" : "Save profile"}
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, backgroundColor: colors.paper, justifyContent: "center", padding: space[5], gap: space[4] },
  content: { padding: space[5], paddingBottom: space[6], gap: space[4] },
  preview: { alignItems: "center", gap: space[3], marginBottom: space[2] },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.sand, fontFamily: font.display, fontSize: 20 },
  previewText: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  hint: { marginTop: 6, marginHorizontal: 4, color: colors.muted, fontFamily: font.body, fontSize: 13 },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.paper },
});
