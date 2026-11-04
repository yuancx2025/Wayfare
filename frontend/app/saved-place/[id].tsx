import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useEffect, useRef } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { one } from "@/lib/params";
import { goBackToSaved } from "@/lib/back";
import { useSavedPlaceDetails, useSavedPlaces } from "@/lib/savedPlaces";
import { useStore } from "@/state/store";
import { CollectionDetailHeader, CollectionMessage, DestinationHero, PlaceDetailsBody, PlaceIllustration } from "@/components/SavedPlaceViews";
import { SavePlaceButton } from "@/components/SavePlaceButton";
import { Button, Spinner } from "@/components/ui";
import { colors, font } from "@/theme";

export default function SavedPlaceOverview() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = one(raw);
  const router = useRouter();
  const { startDraft } = useStore();
  const collection = useSavedPlaces();
  const saved = collection.data?.find((item) => item.id === id);
  const details = useSavedPlaceDetails(saved);
  const seenId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (saved) seenId.current = saved.id;
    else if (collection.data && seenId.current === id) router.replace("/saved");
  }, [saved, collection.data, id, router]);
  const removed = () => router.replace("/saved");
  const header = <CollectionDetailHeader onBack={goBackToSaved} />;
  if (collection.data === undefined) return <View style={styles.screen}>{header}{collection.isError ? (
    <CollectionMessage error title="Your saved places can wait." body="We couldn’t load your collection. Your saved places haven’t been removed.">
      <Button onPress={() => { void collection.refetch(); }}>Try again</Button>
    </CollectionMessage>
  ) : <Spinner label="Loading your saved places" />}</View>;
  if (!saved) return <View style={styles.screen}>{header}<CollectionMessage title="This place is no longer saved." body="You can find more inspiration in Explore."><Button onPress={removed}>Back to Saved</Button></CollectionMessage></View>;
  const save = <SavePlaceButton reference={saved} name={details.data?.name ?? "this place"} full onRemoved={removed} />;
  if (!details.data) return <View style={styles.screen}>{header}{details.isError ? (
    <CollectionMessage error title="Details are taking a break." body={"This place is still in your collection.\nTry again or remove it from Saved."}>
      <Button onPress={() => { void details.refetch(); }}>Try again</Button>{save}
    </CollectionMessage>
  ) : <><PlaceIllustration /><Spinner label="Loading place details…" /></>}</View>;
  const data = details.data;
  const destination = saved.kind === "destination";
  const plan = () => { startDraft(`${data.name}, ${data.subtitle}`, data.destinationId); router.push("/create"); };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    {destination && data.image ? <DestinationHero image={data.image} onBack={goBackToSaved} action={<SavePlaceButton reference={saved} name={data.name} onRemoved={removed} />} /> : <>{header}<PlaceIllustration /></>}
    {details.isError ? <View style={styles.warning}><Text style={styles.note}>These details may have changed. Try again.</Text><Button variant="ghost" onPress={() => { void details.refetch(); }}>Refresh details</Button></View> : null}
    <PlaceDetailsBody details={data} kind={saved.kind} footer={!destination || !data.image ? save : undefined}>
      {destination && data.destinationId ? <Button onPress={plan}>Plan a Trip</Button> : null}
    </PlaceDetailsBody>
    <Text style={styles.noteFooter}>{destination ? "Saved places stay independent of your trips." : "Removing this place keeps your trips unchanged."}</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingBottom: 40 },
  warning: { paddingHorizontal: 24, paddingTop: 20, gap: 10 },
  note: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  noteFooter: { color: colors.muted, fontFamily: font.body, fontSize: 12, paddingHorizontal: 24, lineHeight: 18 },
});
