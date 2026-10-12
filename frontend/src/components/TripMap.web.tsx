import TripMapFallback, { type TripMapProps } from "./TripMapFallback";

// react-native-maps has no web implementation and throws as soon as it is imported, so web never loads it.
export default function TripMap(props: TripMapProps) {
  return <TripMapFallback {...props} />;
}
