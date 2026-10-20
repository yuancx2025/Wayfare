import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStore } from "@/state/store";
import { Button, EmptyState, Spinner } from "@/components/ui";
import { Icon, type IconName } from "@/components/Icon";
import { colors, font, radius, space, touch } from "@/theme";

export default function ProfileOverview() {
  const { me, hydrated, loadError, refresh } = useStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (!hydrated) {
    return <View style={styles.loading}><Spinner label="Loading your profile" /></View>;
  }
  if (loadError || !me) {
    return (
      <View style={styles.loading}>
        <EmptyState
          icon="alert"
          title="Profile is unavailable"
          body={loadError ?? "Couldn't load your profile."}
          action={<Button icon="refresh" onPress={() => { void refresh(); }}>Try again</Button>}
        />
      </View>
    );
  }

  const stats = me.stats;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + space[5], paddingBottom: space[6] }}>
        <View style={styles.head}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{me.initials}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{me.name}</Text>
            {me.home ? (
              <View style={styles.home}>
                <Icon name="pin" size={16} color={colors.muted} />
                <Text style={styles.muted}>{me.home}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.stats}>
          <Stat n={stats.trips} label={plannedLabel(stats.trips, "trip", "trips")} />
          <Stat n={stats.daysPlanned} label={plannedLabel(stats.daysPlanned, "day", "days")} />
          <Stat n={stats.countries} label={plannedLabel(stats.countries, "country", "countries")} />
        </View>
        <View style={styles.links}>
          <LinkRow icon="edit" title="Edit profile" subtitle="Name and home location" onPress={() => router.push("/profile/edit")} />
          <LinkRow icon="sliders" title="Travel preferences" subtitle="Defaults for your next trip" onPress={() => router.push("/profile/preferences")} />
          <LinkRow icon="calendar" title="Trip history" subtitle="Ongoing, upcoming, and past" onPress={() => router.push("/profile/history")} />
        </View>
        {/* Recent past trips land here once trip dates are grouped. */}
      </ScrollView>
    </View>
  );
}

function plannedLabel(count: number, singular: string, plural: string) {
  return `${count === 1 ? singular : plural} planned`;
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statN}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  );
}

function LinkRow({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.link, pressed && styles.pressed]} onPress={onPress} accessibilityRole="button">
      <View style={styles.linkIcon}><Icon name={icon} size={18} color={colors.forest} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.linkTitle}>{title}</Text>
        <Text style={styles.linkSub}>{subtitle}</Text>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  loading: { flex: 1, backgroundColor: colors.paper, justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: space[4], paddingHorizontal: space[5], marginBottom: space[5] },
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.forest, alignItems: "center", justifyContent: "center" },
  avatarText: { color: colors.sand, fontFamily: font.display, fontSize: 20 },
  name: { fontFamily: font.display, fontSize: 26, color: colors.ink },
  home: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  muted: { flex: 1, color: colors.muted, fontFamily: font.body, fontSize: 14 },
  stats: { marginHorizontal: space[5], borderRadius: radius.lg, backgroundColor: colors.cream, flexDirection: "row", paddingVertical: space[4] },
  stat: { flex: 1, alignItems: "center", borderLeftWidth: 1, borderLeftColor: colors.line },
  statN: { fontFamily: font.display, fontSize: 22, color: colors.forest },
  statL: { color: colors.muted, fontFamily: font.body, fontSize: 12, textAlign: "center", marginTop: 2, paddingHorizontal: space[1] },
  links: { paddingHorizontal: space[5], marginTop: space[5], gap: space[3] },
  link: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: colors.cream },
  pressed: { opacity: 0.7 },
  linkIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontFamily: font.bodyBold, fontSize: 16, color: colors.ink },
  linkSub: { marginTop: 2, fontFamily: font.body, fontSize: 13, color: colors.muted },
});
