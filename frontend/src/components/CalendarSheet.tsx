import { StyleSheet, Text, View } from "react-native";
import { fmtRange, plural } from "@/domain/lib/format";
import { tripToCalendarEvents } from "@/domain/logic/calendarEvents";
import type { Trip } from "@/domain/types";
import { describeSync } from "@/lib/calendar";
import type { CalendarExport } from "@/lib/useCalendarExport";
import { BottomSheet, Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, space } from "@/theme";

/** Confirms adding or updating a trip's calendar events, and explains missing calendar access. */
export function CalendarSheet({ open, onClose, trip, calendar, onToast }: {
  open: boolean;
  onClose: () => void;
  trip: Trip;
  calendar: CalendarExport;
  onToast: (message: string) => void;
}) {
  const updating = calendar.status === "stale";
  const count = tripToCalendarEvents(trip).length;
  const close = () => { calendar.clearProblem(); onClose(); };

  const confirm = async () => {
    try {
      const result = await calendar.sync();
      if (!result) return; // A permission problem is now shown in the sheet.
      close();
      onToast(describeSync(result));
    } catch (e) {
      onToast(e instanceof Error ? e.message : "Couldn't update your calendar");
    }
  };

  const problem = calendar.problem;
  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={problem ? problem.title : updating ? "Update calendar" : "Add to calendar"}
      footer={problem ? (
        <View style={styles.actions}>
          {problem.settings ? <Button variant="secondary" onPress={calendar.openSettings}>Open Settings</Button> : null}
          <Button variant={problem.settings ? "ghost" : "primary"} icon="refresh" disabled={calendar.busy} onPress={() => { void confirm(); }}>Try again</Button>
        </View>
      ) : (
        <Button icon="calendar" disabled={calendar.busy || count === 0} onPress={() => { void confirm(); }}>
          {calendar.busy ? "Saving…" : updating ? "Update events" : `Add ${plural(count, "event")}`}
        </Button>
      )}
    >
      {problem ? (
        <Text style={styles.body}>{problem.body}</Text>
      ) : (
        <View style={styles.content}>
          <Text style={styles.body}>
            {updating
              ? `Your itinerary changed since you added it. Wayfare will update the ${trip.destination} events in your "Wayfare" calendar.`
              : `Wayfare will add ${plural(count, "event")}, one per activity, from ${fmtRange(trip.startDate, trip.endDate)} to a "Wayfare" calendar on this phone.`}
          </Text>
          <View style={styles.note}>
            <Icon name="clock" size={16} color={colors.muted} />
            <Text style={styles.noteText}>Times use this phone&apos;s time zone.</Text>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: { gap: space[3] },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colors.ink },
  note: { flexDirection: "row", alignItems: "center", gap: space[2] },
  noteText: { fontFamily: font.body, fontSize: 13, color: colors.muted },
  actions: { gap: space[2] },
});
