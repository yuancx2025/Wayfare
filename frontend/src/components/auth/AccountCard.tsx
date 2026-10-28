import { Alert, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useAuthSession } from "@/auth/session";
import { Button } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { colors, font, radius, space } from "@/theme";

/** Profile section that shows whether trips are saved to an account or only on this device. */
export function AccountCard() {
  const { mode } = useAuthSession();
  if (mode === "account") return <SignedInCard />;
  if (mode === "guest") return <GuestCard />;
  return null;
}

function SignedInCard() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "Your trips stay in your account. Sign in again any time to see them.", [
      { text: "Cancel", style: "cancel" },
      // Ending the session flips the route guards, which return the app to the sign-in screen.
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Icon name="user" color={colors.forest} /></View>
        <View style={styles.copy}>
          <Text style={styles.title}>Signed in</Text>
          {email ? <Text style={styles.body}>{email}</Text> : null}
        </View>
      </View>
      <Button variant="ghost" icon="logout" onPress={confirmSignOut}>Sign out</Button>
    </View>
  );
}

function GuestCard() {
  const router = useRouter();
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.icon}><Icon name="user" color={colors.forest} /></View>
        <View style={styles.copy}>
          <Text style={styles.title}>Guest</Text>
          <Text style={styles.body}>
            Trips are saved on this device only. Signing in won&apos;t move them into your account.
          </Text>
        </View>
      </View>
      <Button onPress={() => router.push("/sign-in")}>Sign in or create account</Button>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: space[5], marginTop: space[5], padding: space[4], gap: space[4], borderRadius: radius.lg, backgroundColor: colors.cream },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: 2 },
  title: { fontFamily: font.bodyBold, fontSize: 16, color: colors.ink },
  body: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colors.muted },
});
