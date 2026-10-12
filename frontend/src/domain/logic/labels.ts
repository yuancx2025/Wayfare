import type { Budget, Category, FoodPref, Interest, LegMode, Pace, Preferences, Transport } from "../types";

export const PACE_OPTIONS: { value: Pace; label: string; hint: string }[] = [
  { value: "relaxed", label: "Relaxed", hint: "3 stops, slow mornings" },
  { value: "balanced", label: "Balanced", hint: "4 stops, room to wander" },
  { value: "packed", label: "Packed", hint: "5 stops, early starts" },
];
export const INTEREST_OPTIONS: { value: Interest; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "culture", label: "Culture" },
  { value: "nature", label: "Nature" },
  { value: "museums", label: "Museums" },
  { value: "shopping", label: "Shopping" },
  { value: "architecture", label: "Architecture" },
  { value: "nightlife", label: "Nightlife" },
];
export const FOOD_OPTIONS: { value: FoodPref; label: string }[] = [
  { value: "local-classics", label: "Local classics" },
  { value: "street-food", label: "Street food" },
  { value: "seafood", label: "Seafood" },
  { value: "vegetarian", label: "Vegetarian" },
  { value: "cafes", label: "Cafés" },
  { value: "fine-dining", label: "Fine dining" },
];
export const TRANSPORT_OPTIONS: { value: Transport; label: string }[] = [
  { value: "walking", label: "Walking" },
  { value: "transit", label: "Public transit" },
  { value: "driving", label: "Driving" },
  { value: "mix", label: "A mix" },
];
export const BUDGET_OPTIONS: { value: Budget; label: string; hint: string }[] = [
  { value: "budget", label: "Budget", hint: "$" },
  { value: "moderate", label: "Moderate", hint: "$$" },
  { value: "premium", label: "Premium", hint: "$$$" },
];

export const CATEGORY_LABEL: Record<Category, string> = {
  food: "Food", culture: "Culture", nature: "Nature", museums: "Museum",
  shopping: "Shopping", architecture: "Architecture", nightlife: "Nightlife",
};
export const LEG_LABEL: Record<LegMode, string> = { walk: "Walk", transit: "Transit", drive: "Drive" };

const label = <T extends string>(opts: { value: T; label: string }[], v: T) => opts.find((o) => o.value === v)?.label ?? v;
export const paceLabel = (v: Pace) => label(PACE_OPTIONS, v);
export const interestLabel = (v: Interest) => label(INTEREST_OPTIONS, v);
export const foodLabel = (v: FoodPref) => label(FOOD_OPTIONS, v);
export const transportLabel = (v: Transport) => label(TRANSPORT_OPTIONS, v);
export const budgetLabel = (v: Budget) => label(BUDGET_OPTIONS, v);

export const DEFAULT_PREFS: Preferences = {
  pace: "balanced",
  interests: ["food", "culture", "nature"],
  food: ["local-classics", "street-food"],
  transport: "transit",
  budget: "moderate",
};

const sameMembers = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((v, i) => v === sorted[i]);
};

/** Order-independent equality so chip toggle order does not look like a change. */
export function prefsEqual(a: Preferences, b: Preferences) {
  return a.pace === b.pace && a.transport === b.transport && a.budget === b.budget
    && sameMembers(a.interests, b.interests) && sameMembers(a.food, b.food);
}

export function prefsSentence(p: Preferences) {
  const ints = p.interests.length ? p.interests.map(interestLabel).join(", ").toLowerCase() : "a bit of everything";
  return `A ${paceLabel(p.pace).toLowerCase()} pace focused on ${ints}, getting around by ${transportLabel(p.transport).toLowerCase()} on a ${budgetLabel(p.budget).toLowerCase()} budget.`;
}
