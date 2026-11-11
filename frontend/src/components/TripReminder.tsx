import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { fmtDay, fmtTime, toISO } from "@/domain/lib/format";
import { REMINDER_OPTIONS, reminderTime, type ReminderWhen } from "@/domain/logic/tripReminder";
import type { Trip } from "@/domain/types";
import { useTripReminder, type ReminderProblem } from "@/lib/tripReminders";
import { useStore } from "@/state/store";
import { BottomSheet, Button, ErrorLine, SectionHeading } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space } from "@/theme";

const PROBLEMS: Record<ReminderProblem, string> = {
  denied: "Notifications weren't allowed, so no reminder was set.",
  blocked: "Notifications are off for Wayfare. Turn them on in Settings.",
  passed: "That time has already passed.",
  error: "Couldn't change the reminder. Try again.",
};

const label = (when: ReminderWhen) => REMINDER_OPTIONS.find((o) => o.when === when)!.label;
const fmtAt = (d: Date) => `${fmtDay(toISO(d))} at ${fmtTime(d.getHours() * 60 + d.getMinutes())}`;

/** Hidden once both reminder times have passed and none is set. */
export function TripReminder({ trip }: { trip: Trip }) {
  const { showToast } = useStore();
  const reminder = useTripReminder(trip);
  const [sheet, setSheet] = useState(false);

  if (!reminder.options.some((o) => !o.passed) && !reminder.when) return null;

  const choose = async (when: ReminderWhen | null) => {
    if (!(await reminder.choose(when))) return;
    setSheet(false);
    showToast(when ? `Reminder set for ${fmtAt(reminderTime(trip.startDate, when))}` : "Reminder turned off");
  };

  return (
    <View>
      <SectionHeading eyebrow="Before you go" title="Trip reminder" />
      <Pressable
        style={styles.card}
        onPress={() => setSheet(true)}
        disabled={reminder.when === undefined}
        accessibilityRole="button"
        accessibilityLabel={reminder.when ? `Trip reminder, ${label(reminder.when)}. Change` : "Set a trip reminder"}
      >
        <View style={styles.icon}><Icon name="clock" color={colors.forest} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{reminder.when ? "Reminder on" : "Remind me before I go"}</Text>
          <Text style={styles.body}>{reminder.when ? label(reminder.when) : "Get a notification before the trip starts"}</Text>
        </View>
        {reminder.when === undefined
          ? <ActivityIndicator color={colors.forest} />
          : <Text style={styles.action}>{reminder.when ? "Change" : "Set"}</Text>}
      </Pressable>
      <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Remind me">
        {reminder.options.map((o) => (
          <Pressable
            key={o.when}
            style={[styles.option, o.passed && styles.optionPassed]}
            disabled={o.passed || reminder.busy}
            onPress={() => { void choose(o.when); }}
            accessibilityRole="button"
            accessibilityState={{ selected: reminder.when === o.when, disabled: o.passed }}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.optionText}>{o.label}</Text>
              <Text style={styles.optionHint}>{o.passed ? "Already passed" : fmtAt(reminderTime(trip.startDate, o.when))}</Text>
            </View>
            {reminder.when === o.when ? <Icon name="check" color={colors.forest} /> : null}
          </Pressable>
        ))}
        {reminder.when ? (
          <Pressable style={styles.option} disabled={reminder.busy} onPress={() => { void choose(null); }} accessibilityRole="button">
            <Text style={[styles.optionText, { color: colors.coralInk }]}>No reminder</Text>
          </Pressable>
        ) : null}
        {reminder.problem ? (
          <View style={styles.problem}>
            <ErrorLine message={PROBLEMS[reminder.problem]} />
            {reminder.problem === "blocked"
              ? <Button variant="secondary" full={false} onPress={reminder.openSettings}>Open Settings</Button>
              : null}
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 72, flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3],
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white,
  },
  icon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: font.displaySemi, fontSize: 16, color: colors.ink },
  body: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  action: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 14 },
  problem: { gap: space[2], paddingTop: space[3] },
  option: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.line },
  optionPassed: { opacity: 0.45 },
  optionText: { fontFamily: font.bodySemi, fontSize: 16, color: colors.ink },
  optionHint: { color: colors.muted, fontFamily: font.body, fontSize: 12 },
});
