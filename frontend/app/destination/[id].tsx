import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { one } from "@/lib/params";
import { goBackToExplore } from "@/lib/back";
import { destinationSaveReference } from "@/domain/logic/savedPlaces";
import { useStore } from "@/state/store";
import { CollectionDetailHeader, CollectionMessage, DestinationHero, PlaceDetailsBody } from "@/components/SavedPlaceViews";
import { SavePlaceButton } from "@/components/SavePlaceButton";
import { Button, Spinner } from "@/components/ui";
import { colors } from "@/theme";

export default function DestinationOverview() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = one(raw);
  const router = useRouter();
  const { startDraft } = useStore();
  const destination = useQuery({ queryKey: ["destination", api.mode, id], queryFn: () => api.resolveDestination(id!), enabled: Boolean(id), retry: false, staleTime: 5 * 60_000 });
  if (!destination.data) return <View style={styles.screen}>
    <CollectionDetailHeader title="Destination details" onBack={goBackToExplore} />
    {destination.isError || !id ? <CollectionMessage error title="Details are taking a break." body="We couldn’t load this destination. Try again in a moment."><Button onPress={() => { void destination.refetch(); }}>Try again</Button></CollectionMessage> : <Spinner label="Loading destination details" />}
  </View>;
  const data = destination.data;
  const reference = destinationSaveReference(data);
  const plan = () => { startDraft(`${data.name}, ${data.country}`, data.id); router.push("/create"); };
  // Unknown provenance disables saving; it does not prevent browsing or planning.
  const presentation = {
    name: data.name, subtitle: data.country, description: data.blurb, bestFor: data.bestFor,
    googleMapsUri: `https://www.google.com/maps/search/?api=1&query=${data.center.lat},${data.center.lng}`,
  };
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <DestinationHero image={data.image} onBack={goBackToExplore} action={reference ? <SavePlaceButton reference={reference} name={data.name} /> : undefined} />
    <PlaceDetailsBody details={presentation} kind="destination"><Button onPress={plan}>Plan a Trip</Button></PlaceDetailsBody>
  </ScrollView>;
}

const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.paper }, content: { paddingBottom: 40 } });
