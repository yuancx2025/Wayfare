import { createElement, useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { type DateTimePickerChangeEvent } from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { useStore } from "@/state/store";
import { createTripSchema, type CreateTripValues } from "@/domain/schemas";
import type { DestinationCard, Suggestion, TripDraft } from "@/domain/types";
import { daysBetween, fmtShort, parseISO, plural, todayISO, toISO } from "@/domain/lib/format";
import { api } from "@/lib/api";
import { useDebounced } from "@/lib/useDebounced";
import { Button, FieldInput, FormField, TopBar } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space, touch } from "@/theme";

const formValues = (d: TripDraft): CreateTripValues => ({
  destination: d.destination, destinationId: d.destinationId, startDate: d.startDate, endDate: d.endDate, travelers: d.travelers,
});

export default function CreateTrip() {
  const { draft, draftNonce, updateDraft, showToast } = useStore();
  const router = useRouter();
  const form = useForm<CreateTripValues>({
    defaultValues: formValues(draft),
    resolver: zodResolver(createTripSchema),
    mode: "onBlur",
  });
  const { control, handleSubmit, watch, setValue, reset, formState: { errors, isSubmitted } } = form;

  useEffect(() => {
    reset(formValues(draft));
    // Reset only when a new draft starts, so typing does not fight the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftNonce]);

  useEffect(() => {
    // React Compiler is not enabled; this subscription mirrors the form into the trip draft.
    // eslint-disable-next-line react-hooks/incompatible-library
    const sub = watch((values) => {
      updateDraft({
        destination: values.destination ?? "",
        destinationId: values.destinationId,
        startDate: values.startDate ?? "",
        endDate: values.endDate ?? "",
        travelers: values.travelers ?? 2,
      });
    });
    return () => sub.unsubscribe();
  }, [watch, updateDraft]);

  const destination = watch("destination");
  const destinationId = watch("destinationId");
  const startDate = watch("startDate");
  const endDate = watch("endDate");
  const travelers = watch("travelers");
  const length = startDate && endDate && !errors.endDate ? daysBetween(startDate, endDate) + 1 : 0;

  // One Places autocomplete session per destination pick keeps Google billing to a single session.
  const session = useRef(randomUUID());
  const query = useDebounced(destinationId ? "" : destination.trim());
  const autocomplete = useQuery({
    queryKey: ["autocomplete", query],
    queryFn: () => api.autocomplete(query, session.current),
    enabled: query.length > 0,
  });
  const suggestions = query && !destinationId ? autocomplete.data ?? [] : [];
  const picks = useQuery({ queryKey: ["destinations", ""], queryFn: () => api.listDestinations("") });
  const [resolving, setResolving] = useState<string | null>(null);

  const choose = (d: Pick<DestinationCard, "id" | "name" | "country">) => {
    setValue("destination", `${d.name}, ${d.country}`);
    setValue("destinationId", d.id);
    void form.trigger("destination");
  };

  const pick = async (s: Suggestion) => {
    setResolving(s.placeId);
    try {
      choose(await api.resolveDestination(s.placeId));
      session.current = randomUUID();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Couldn't load that destination");
    } finally {
      setResolving(null);
    }
  };

  const submit = handleSubmit(() => router.push("/create/preferences"));

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar title="New trip" subtitle="Step 1 of 3" onBack={() => router.back()} />
      <Progress step={1} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>Where and when?</Text>
        <Text style={styles.subtitle}>{"The basics. Next you'll set your pace and interests."}</Text>
        <Controller
          control={control}
          name="destination"
          render={({ field: { value, onChange, onBlur } }) => (
            <FormField icon="pin" label="Destination" error={isSubmitted || errors.destination ? errors.destination?.message : undefined}>
              <FieldInput
                value={value}
                placeholder="e.g. New York City"
                autoCorrect={false}
                onChangeText={(text) => { onChange(text); setValue("destinationId", undefined); }}
                onBlur={onBlur}
                returnKeyType="next"
              />
            </FormField>
          )}
        />
        {suggestions.length > 0 ? (
          <View style={styles.suggestions}>
            {suggestions.map((s) => (
              <Pressable key={s.placeId} style={styles.suggestion} disabled={!!resolving} onPress={() => { void pick(s); }}>
                <Icon name="pin" size={16} color={colors.forest} />
                <Text style={styles.suggestionText} numberOfLines={1}>{s.name}</Text>
                <Text style={styles.suggestionMeta} numberOfLines={1}>{resolving === s.placeId ? "Loading…" : s.secondary}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {query && !destinationId && autocomplete.isSuccess && !autocomplete.isFetching && suggestions.length === 0 ? (
          <View style={styles.noMatch}>
            <Icon name="search" size={14} color={colors.muted} />
            <Text style={styles.noMatchText}>No matching cities{api.mode === "local" ? " in this offline preview" : ""}.</Text>
          </View>
        ) : null}
        {!destination && picks.data?.length ? (
          <View style={styles.picks}>
            {picks.data.slice(0, 4).map((d) => (
              <Pressable key={d.id} style={styles.pick} onPress={() => choose(d)}>
                <Text style={styles.pickText}>{d.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.dates}>
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="startDate"
              render={({ field: { value, onChange } }) => (
                <DateField label="Start date" value={value} minimum={parseISO(todayISO())} error={errors.startDate?.message} onChange={onChange} />
              )}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Controller
              control={control}
              name="endDate"
              render={({ field: { value, onChange } }) => (
                <DateField label="End date" value={value} minimum={parseISO(startDate || todayISO())} error={errors.endDate?.message} onChange={onChange} />
              )}
            />
          </View>
        </View>
        {length > 0 ? <Text style={styles.helper}>{plural(length, "day")} · {plural(length - 1, "night")}</Text> : null}
        <View style={styles.fieldBox}>
          <View style={styles.fieldIcon}><Icon name="users" color={colors.forest} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.fieldLabel}>Travelers</Text>
            <Text style={styles.fieldValue}>{travelers === 1 ? "1 person" : `${travelers} people`}</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable style={styles.step} disabled={travelers <= 1} onPress={() => setValue("travelers", Math.max(1, travelers - 1))} accessibilityLabel="Remove traveler">
              <Icon name="minus" size={18} />
            </Pressable>
            <Text style={styles.stepOut}>{travelers}</Text>
            <Pressable style={[styles.step, styles.stepOn]} onPress={() => setValue("travelers", Math.min(12, travelers + 1))} accessibilityLabel="Add traveler">
              <Icon name="plus" size={18} color={colors.white} />
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <Button trailing="arrow" onPress={submit}>Continue to Preferences</Button>
      </View>
    </KeyboardAvoidingView>
  );
}

function DateField({ label, value, minimum, error, onChange }: { label: string; value: string; minimum: Date; error?: string; onChange: (iso: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = value ? parseISO(value) : minimum;
  const commit = (_event: DateTimePickerChangeEvent, date: Date) => {
    if (Platform.OS === "android") setOpen(false);
    onChange(toISO(date));
  };
  // The native date picker has no web UI, so the browser's date input is used there.
  if (Platform.OS === "web") {
    return (
      <FormField icon="calendar" label={label} error={error}>
        {createElement("input", {
          type: "date",
          value,
          min: toISO(minimum),
          "aria-label": label,
          onChange: (event: { target: { value: string } }) => onChange(event.target.value),
          style: { border: "none", background: "transparent", font: "inherit", fontSize: 16, color: colors.ink, width: "100%", minHeight: 28 },
        })}
      </FormField>
    );
  }
  return (
    <View>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button">
        <FormField icon="calendar" label={label} error={error}>
          <Text style={styles.fieldValue}>{value ? fmtShort(value) : "Select"}</Text>
        </FormField>
      </Pressable>
      {open && Platform.OS === "android" ? <DateTimePicker value={current} mode="date" minimumDate={minimum} onValueChange={commit} onDismiss={() => setOpen(false)} /> : null}
      {Platform.OS === "ios" ? (
        <View>
          {open ? (
            <View style={styles.iosPicker}>
              <DateTimePicker value={current} mode="date" display="spinner" minimumDate={minimum} onValueChange={commit} onDismiss={() => setOpen(false)} />
              <Button onPress={() => { onChange(toISO(current)); setOpen(false); }}>Done</Button>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Progress({ step }: { step: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`Step ${step} of 3`}>
      {[1, 2, 3].map((i) => <View key={i} style={[styles.progressBar, i <= step && styles.progressOn]} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: space[5], gap: space[3], paddingBottom: space[6] },
  pageTitle: { fontFamily: font.display, fontSize: 30, color: colors.ink },
  subtitle: { color: colors.muted, fontFamily: font.body, fontSize: 15, lineHeight: 22, marginBottom: space[2] },
  suggestions: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, overflow: "hidden" },
  suggestion: { minHeight: touch, paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  suggestionText: { flexShrink: 1, fontFamily: font.bodySemi, color: colors.ink },
  suggestionMeta: { flexShrink: 1, marginLeft: "auto", color: colors.muted, fontFamily: font.body },
  noMatch: { flexDirection: "row", alignItems: "center", gap: 6 },
  noMatchText: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  picks: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  pick: { minHeight: touch, paddingHorizontal: space[4], borderRadius: 999, borderWidth: 1.5, borderColor: "#d8dcd7", backgroundColor: colors.white, justifyContent: "center" },
  pickText: { fontFamily: font.bodySemi, color: colors.ink },
  dates: { flexDirection: "row", gap: space[3] },
  helper: { color: colors.forest, fontFamily: font.bodySemi, fontSize: 13 },
  fieldBox: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: 14, borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white },
  fieldIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  fieldLabel: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase" },
  fieldValue: { fontFamily: font.bodySemi, fontSize: 16, color: colors.ink, minHeight: 28 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 4 },
  step: { width: touch, height: touch, borderRadius: touch / 2, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  stepOn: { backgroundColor: colors.forest, borderColor: colors.forest },
  stepOut: { minWidth: 24, textAlign: "center", fontFamily: font.bodyBold, color: colors.ink },
  footer: { padding: space[4], borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: "rgba(246,244,239,0.96)" },
  progress: { height: 3, flexDirection: "row", gap: 3, backgroundColor: colors.line },
  progressBar: { flex: 1, backgroundColor: "transparent" },
  progressOn: { backgroundColor: colors.forest },
  iosPicker: { backgroundColor: colors.white, borderRadius: radius.md, padding: space[3], gap: space[2] },
});
