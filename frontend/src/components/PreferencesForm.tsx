import { View } from "react-native";
import type { Preferences } from "@/domain/types";
import { ChipGroup, PrefSection } from "./ui";
import { BUDGET_OPTIONS, FOOD_OPTIONS, INTEREST_OPTIONS, PACE_OPTIONS, TRANSPORT_OPTIONS } from "@/domain/logic/labels";

export default function PreferencesForm({ value, onChange }: { value: Preferences; onChange: (p: Preferences) => void }) {
  const set = <K extends keyof Preferences>(k: K) => (v: Preferences[K]) => onChange({ ...value, [k]: v });
  return (
    <View>
      <PrefSection title="Travel pace" hint="How full should each day feel?">
        <ChipGroup options={PACE_OPTIONS} value={value.pace} onChange={set("pace")} columns={3} />
      </PrefSection>
      <PrefSection title="Interests" hint="Pick as many as you like.">
        <ChipGroup options={INTEREST_OPTIONS} value={value.interests} onChange={set("interests")} multi />
      </PrefSection>
      <PrefSection title="Food preferences" hint="Shapes where you eat lunch and dinner.">
        <ChipGroup options={FOOD_OPTIONS} value={value.food} onChange={set("food")} multi />
      </PrefSection>
      <PrefSection title="Getting around" hint="Used to estimate travel between stops.">
        <ChipGroup options={TRANSPORT_OPTIONS} value={value.transport} onChange={set("transport")} columns={2} />
      </PrefSection>
      <PrefSection title="Budget style">
        <ChipGroup options={BUDGET_OPTIONS} value={value.budget} onChange={set("budget")} columns={3} />
      </PrefSection>
    </View>
  );
}
