# Hooks guide

This guide explains the hooks used in the Travel Companion app, where to find them, and how they work together. It describes the current source implementation; it is not a record of runtime testing.

There are **21 distinct hooks: 7 React hooks, 8 library hooks, and 6 custom hooks**. All application hook usage is in `frontend/`. The backend is Python, and the root package only supports backend fixture generation.

## Start with the state model

The app separates four kinds of state:

| State | Owner | Examples |
| --- | --- | --- |
| Shared application state | `StoreProvider` | Trips, preferences, creation draft, profile, toast |
| Shared selection state | `TripSessionProvider` | Selected trip, day, and activity |
| Cached supporting data | TanStack Query | Destination search, autocomplete, route geometry, place details |
| Local screen/component state | React state hooks | Open sheets, editable preferences, generation progress |

The providers are mounted in [app/_layout.tsx](../frontend/app/_layout.tsx). `SafeAreaProvider` supplies device edge measurements, `QueryClientProvider` supplies a shared query cache, and the two context providers supply app and selection state.

The [API adapter](../frontend/src/lib/api/index.ts) chooses the backend when `EXPO_PUBLIC_API_URL` is configured; otherwise it uses the offline implementation. Hooks generally call that shared adapter rather than choosing a mode themselves.

## Complete inventory

| Category | Hook | Main responsibility |
| --- | --- | --- |
| React | `useState` | State that affects rendered UI |
| React | `useReducer` | Coordinated application state transitions |
| React | `useContext` | Read provider-owned state |
| React | `useEffect` | Synchronize with requests, timers, subscriptions, and native views |
| React | `useRef` | Retain mutable values and component handles without rendering |
| React | `useCallback` | Retain function identities |
| React | `useMemo` | Retain calculated values |
| Expo Router | `useRouter` | Navigate and update route parameters |
| Expo Router | `useLocalSearchParams` | Read parameters for the current route |
| TanStack Query | `useQuery` | Fetch and cache supporting API data |
| React Hook Form | `useForm` | Manage and validate trip creation fields |
| Expo Google Fonts | `useFonts` | Load fonts before rendering the app |
| Safe Area Context | `useSafeAreaInsets` | Position content around device edges |
| Reanimated | `useSharedValue` | Hold animation values |
| Reanimated | `useAnimatedStyle` | Bind animation values to styles |
| Custom | `useStore` | Access shared application state and actions |
| Custom | `useTrip` | Read or fetch a complete trip |
| Custom | `useTripSession` | Share day and activity selections across screens |
| Custom | `useDebounced` | Delay changes to search input |
| Custom | `useDayRoute` | Fetch route geometry for a trip/day/version |
| Custom | `usePlaceDetails` | Fetch details for a scheduled activity |
| Custom | `useLocationPermission` | Know whether location may be read, checked silently at launch and on return to the app |
| Custom | `useCurrentLocation` | Take one foreground fix only when the user asks, shared by every screen |

`jest.useFakeTimers()` is a test utility, not a React hook. `createContext`, `Controller`, `keepPreviousData`, `withTiming`, and form methods such as `watch` are also not separate hooks.

## Custom hooks

### Why use custom hooks?

Library hooks provide the building blocks. Custom hooks combine them into named app operations, such as “load a trip” or “fetch this day's route.” We could implement the same behavior directly in each screen; the benefit is keeping repeated logic and app-specific rules in one place.

| Custom hook | Without it | Benefit here |
| --- | --- | --- |
| `useStore` | Repeat context access and missing-provider checks | One checked entry point for app state/actions |
| `useTrip` | Repeat cache lookup, loading effects, and error handling in three screens | Consistent trip-loading behavior |
| `useTripSession` | Read the selection context and check its provider directly in each screen | Clear access to the shared day/activity selection |
| `useDebounced` | Repeat timer state and cleanup in both search screens | Reuse the same search delay safely |
| `useDayRoute` | Configure the route query independently in Daily and Map | Keep trip/version/day cache keys and offline behavior consistent |
| `usePlaceDetails` | Put the query directly in the detail sheet | Separate fetching rules from rendering; mainly a readability benefit |

Custom hooks do not automatically share state or make requests faster. The context providers share state, the query client caches supporting data, and the store's `loadTrip` shares in-flight trip requests. Each `useDebounced` call owns independent state. A useful custom hook names a meaningful behavior, centralizes rules, or removes duplication.

### `useStore()` — shared application state

**Source:** [src/state/store.tsx](../frontend/src/state/store.tsx)

**Why we have it:** Screens can access app state without repeating `useContext` and the missing-provider check. The provider owns the shared state; this hook is a convenient access wrapper.

```tsx
const { draft, updateDraft, showToast } = useStore();
```

This hook wraps `useContext(StoreContext)`. It returns the state and actions created by `StoreProvider`, and throws an error if called outside that provider.

The state includes trip summaries, a cache of full trips, default preferences, the creation draft, a draft reset counter (`draftNonce`), profile information, backend capabilities, startup loading/error state, and the toast message.

The actions include `startDraft`, `updateDraft`, `putTrip`, `deleteTrip`, `saveDefaultPrefs`, `loadTrip`, `refresh`, and `showToast`. `loadSample` is available only when the API implementation supplies it.

| Consumer | Store responsibility |
| --- | --- |
| Trips tab | List summaries, handle startup loading/errors, start a draft, load a sample |
| Explore tab | Start a draft with the selected destination |
| Profile tab | Read profile/defaults and save edited preferences |
| Create Trip screen | Synchronize form fields with the draft |
| Preferences screen | Edit preferences for the draft |
| Generating screen | Read the draft and store the generated trip |
| Trip overview | Delete a trip and display feedback |
| Daily itinerary | Store an adjusted trip and display feedback |
| Adjust Day sheet | Read agent capabilities and reload a conflicting trip |
| Root `ToastHost` | Read the toast message |
| `useTrip` | Read the trip cache and load missing trips |

The provider's initial effect calls `refresh()`. That fetches summaries, default preferences, profile, and capabilities concurrently. A capability failure falls back to all capabilities disabled; a failure in the other startup requests produces `loadError`.

This store uses **React Context and `useReducer`**, not Zustand. Persistence belongs to the API implementation, not the context hook. Since consumers read the whole context value, changes such as a toast update can rerender consumers that only need trip data.

### `useTrip(id)` — complete trip loading

**Source:** [src/state/store.tsx](../frontend/src/state/store.tsx)

**Why we have it:** Overview, Daily, and Map need the same cache lookup, loading state, and error handling. One hook keeps those behaviors consistent instead of duplicating them across screens.

```tsx
const { trip, loading, error } = useTrip(id || undefined);
```

Used in the trip overview, daily itinerary, and full map.

1. Read `trips[id]` from the store.
2. Return a cached trip immediately if available.
3. If the ID exists and the trip is missing, an effect calls `loadTrip(id)`.
4. The provider fetches and stores the trip, causing consumers to render with the result.

`loadTrip` uses a ref containing a map of in-flight promises. Concurrent requests for the same ID share a promise. The entry is removed when the request settles.

The hook keeps errors associated with a trip ID. A 404 becomes “It may have been deleted.” A missing ID returns the same message. Loading is derived as `!trip && !error`, rather than tracked separately.

Effect cleanup sets an `alive` flag to false so a late rejection does not update the departed consumer. It does **not** abort the fetch: a successful response can still populate the shared cache. There is no built-in retry function or freshness policy, and an existing error is not explicitly cleared for a same-ID retry.

### `useTripSession()` — shared trip selection

**Source:** [src/state/tripSession.tsx](../frontend/src/state/tripSession.tsx)

**Why we have it:** It gives screens checked access to one selection context. The provider and its actions keep Daily and Map synchronized and clear the selected activity when the day changes; separate screen-local state would not stay synchronized automatically.

```tsx
const session = useTripSession();
session.setDay(1); // Day indices start at zero.
session.setActivity(activityId);
```

This wraps a context containing `{ tripId, day, activityId }`. Calling it outside `TripSessionProvider` throws an error.

| Action | Behavior |
| --- | --- |
| `bind(tripId, day)` | Select a trip/day and clear the selected activity |
| `setDay(day)` | Change the day and clear the selected activity |
| `setActivity(activityId)` | Change only the selected activity; undefined clears it |

The overview binds a trip/day before navigating. Daily and Map share the current selection, so an activity chosen in the itinerary can be highlighted on the map. Selection changes also drive automatic scrolling.

This is temporary navigation state, separate from the saved itinerary. The root provider lets it survive screen navigation, but this file does not persist selection across restarts. Route parameters initialize or reflect selections; they do not replace the shared session.

### `useDebounced(value, ms = 250)` — delayed search input

**Source:** [src/lib/useDebounced.ts](../frontend/src/lib/useDebounced.ts)

**Why we have it:** Explore and autocomplete both need to wait for a typing pause. This hook reuses the timer and cleanup logic while letting each screen keep its own input state.

```tsx
const query = useDebounced(q.trim());
```

Used in Explore and destination autocomplete. It stores a delayed copy of the input with `useState`. An effect starts a timeout whenever `value` or `ms` changes. Cleanup clears the previous timeout on another change or unmount.

The input updates immediately while the query value updates after typing pauses for 250 ms. The initial returned value is immediate; the delay applies to later changes. Each invocation owns independent state. This hook cancels timers, not API requests that already started.

### `useDayRoute(trip, day)` — route geometry

**Source:** [src/lib/useDayRoute.ts](../frontend/src/lib/useDayRoute.ts)

**Why we have it:** `useQuery` supplies caching, but we must choose the correct key and fetch conditions. Centralizing them prevents Daily and Map from using different rules, such as one omitting the trip version and reusing old route geometry after an adjustment.

```tsx
const route = useDayRoute(trip, dayIndex);
```

Used in Daily and Map. It wraps `useQuery` with:

```ts
queryKey: ["dayRoute", trip?.id, trip?.version ?? 0, day]
enabled: api.mode === "remote" && !!trip
staleTime: Infinity
retry: false
```

The key separates trips, itinerary versions, and days. An adjusted trip's new version produces a different cache entry, so its route can be fetched independently. Cached data stays fresh for that key; this does not mean the cache is kept forever.

Fetching is disabled in offline mode and while the trip is missing. The hook returns data or `null`, hiding loading/error information. Without route geometry, the native map can draw an illustrative line connecting stops in visit order rather than road directions.

### `useLocationPermission()` — whether location may be read

**Source:** [src/state/locationPermission.tsx](../frontend/src/state/locationPermission.tsx)

**Why we have it:** Permission is a different question from "where is the user". Keeping it in its own provider lets screens know it before anything is tapped, without reading GPS.

`LocationPermissionProvider` (mounted in `app/_layout.tsx`) calls `getForegroundPermissionsAsync()` in a `useEffect` at launch and again on every `AppState` return to `active`, so a change made in Settings applies without a restart. These checks never show a prompt. It returns `permission` (`checking`, `undetermined`, `granted`, `denied` or `blocked`), `approximate`, `request` and `openSettings`. `request()` shows the system prompt only when it still can; it never reads a position. The check has a 5 s timeout and falls back to `undetermined`.

### `useCurrentLocation()` — on-request foreground position

**Source:** [src/state/location.tsx](../frontend/src/state/location.tsx)

**Why we have it:** Explore's Nearby section, the day map and stop details need the same timeouts and failure states, and one fix should serve all three. `LocationProvider` sits inside `LocationPermissionProvider` and owns the fix, like `useTripSession` owns the selection.

```tsx
const loc = useCurrentLocation();
loc.locate(); // asks for permission if needed, then takes one fix; call again to refresh
```

It returns `status` for the fix only (`idle`, `locating`, `ready`, `off`, `timeout` or `error`), the current `permission`, a ready-to-show `problem`, `position`, `approximate` and `openSettings`. Nothing reads the position until `locate()` is called. If permission is revoked, the last position is no longer returned.

The fix has a 15 s timeout, so the spinner always ends. A `useRef` run counter drops results from an older `locate()` call, and an unmount ref avoids setting state after the screen closes. It takes a single fix with `getCurrentPositionAsync` and never watches the position.

### `usePlaceDetails(activity, date)` — activity enrichment

**Source:** [src/components/ActivityDetailSheet.tsx](../frontend/src/components/ActivityDetailSheet.tsx)

**Why we have it:** It gives the place query a clear name and keeps visit-time cache rules separate from sheet rendering. With only one consumer, its main benefit is readability; an inline `useQuery` would also be reasonable.

This hook is local to the file and is not exported. `ActivityDetailSheet` calls it with the currently open activity.

Its query key is `["place", placeId, date, startMin, durationMin]`. Timing is included because opening information can depend on the scheduled visit. Fetching is enabled only when an activity exists. Data stays fresh for ten minutes, and automatic retries are disabled.

The sheet uses the returned details for ratings, opening hours, closure warnings, website links, and Google Maps links. It also runs in offline mode, where the local adapter supplies catalog details.

The hook exposes only `.data`. While loading or after a failure, the sheet still shows the itinerary's original activity information, with enrichment fields absent.

## Built-in React hooks

### `useState` — rendered state

A state setter schedules a render so the displayed UI can change.

| Location | State held |
| --- | --- |
| Store provider | Toast message |
| Trip session provider | Selected trip/day/activity |
| `useTrip` | Trip-specific error |
| `useDebounced` | Delayed input value |
| Explore | Search text |
| Profile | Editable preferences and saving status |
| Create Trip | Destination resolution status |
| `DateField` inside Create Trip | Native picker visibility |
| Generating | Status, error text, progress step, retry attempt |
| Overview | Options menu visibility |
| Daily | Open activity ID and Adjust Day visibility |
| Map | Detail sheet visibility |
| Native `TripMap` | Marker view tracking |
| Adjust Day | Workflow step, proposal cache, busy operation, error |

Derived values such as Profile's `dirty` flag are calculated from existing state; they are not separate hooks or additional state.

### `useReducer` — coordinated store updates

Used only in `StoreProvider`. The reducer handles `hydrate`, `loadFailed`, `startDraft`, `updateDraft`, `putTrip`, `deleteTrip`, `saveDefaultPrefs`, and `setMe`.

For example, `putTrip` updates the full-trip cache and summary list together. With `isNew`, it resets the draft too. `startDraft` increments `draftNonce` so the creation form knows when to reset. The reducer computes state transitions; API requests live in provider actions and effects.

### `useContext` — provider access

Used inside `useStore` and `useTripSession`. These hooks share the corresponding provider's state. By comparison, a hook built only from its own state, such as `useDebounced`, creates independent state for every invocation.

### `useEffect` — external synchronization

The dependency array determines which changed values rerun an effect. Cleanup runs before a replacement effect and when the component unmounts.

| Location | Trigger and work | Cleanup |
| --- | --- | --- |
| Root layout | Font success/error hides the splash screen | None |
| Store provider | Mount triggers startup refresh | None |
| `useTrip` | Missing trip triggers loading | Marks consumer inactive |
| `useDebounced` | Input/delay changes start a timer | Clears timer |
| Create Trip | `draftNonce` changes reset form fields | None |
| Create Trip | Form subscription copies values into the draft | Unsubscribes |
| Generating | Mount/retry starts generation | Aborts client request |
| Profile | Default preference changes replace editable draft | None |
| Daily | Different trip binds the session | None |
| Daily | Activity/day selection changes scroll the itinerary | None |
| Map | Trip ID changes initialize selection | None |
| Map | Activity/day selection changes scroll the stop strip | None |
| Native map | Selection/activities changes enable marker tracking for 400 ms | Clears timer |
| Native map | Activities/interactivity/selection changes fit map coordinates | None |
| Adjust Day | Opening/day changes clear errors | None |
| Adjust Day | Opening/day/version changes reset workflow and advance request sequence | None |
| Day selector | Selected day changes scroll the day strip | None |
| Toast | Message changes animate opacity and position | None |

Generation intentionally depends on `attempt`. Retry increments that state, starting a new request. The effect reads the draft through a ref, updates progress through `onStep`, stores success, and navigates to the new trip. It ignores success/error handling after its abort signal is set. Aborting the client request does not by itself establish that server work stopped.

The form reset effect intentionally depends on `draftNonce`, so typing does not repeatedly reset the form. Map initialization intentionally depends on the trip ID, leaving subsequent day selection to the session. These narrowed dependencies are documented in source comments.

### `useRef` — mutable values without rendering

| Location | Ref purpose |
| --- | --- |
| Store provider | Toast timeout and in-flight trip promises |
| Create Trip | Autocomplete session ID, renewed after resolving a destination |
| Generating | Latest draft and idempotency key retained across retries within that mount |
| Daily | Scroll handle, list position, and activity offsets |
| Map | Scroll handle and stop chip positions |
| Native `TripMap` | Native map handle |
| Day selector | Scroll handle and day button positions |
| Adjust Day | Sequence number used to ignore superseded async responses |

Updating `.current` does not trigger a render. That makes refs suitable for measurements, timer handles, and request coordination rather than visible UI state.

Adjust Day captures a sequence number before requesting a preview or alternatives. It updates the UI only when that number still matches. This suppresses responses superseded by another request or an open/day/version reset; it is not network cancellation. Closing the sheet alone does not increment the sequence in its reset effect because the effect returns when `open` is false.

### `useCallback` — stable functions

The store provider retains `refresh`, `refreshMe`, `showToast`, and `loadTrip`. The session provider retains `bind`, `setDay`, and `setActivity`. Stable identities help when functions are passed through context or referenced by effects.

Session setters use functional state updates to read the latest previous state. `useCallback` does not cache API results; the store's explicit in-flight map shares requests. Not every store action is individually memoized: actions such as `updateDraft` are created inside the context value's `useMemo`.

### `useMemo` — calculated values

There are three uses: assembling the store context value, assembling the session context value, and decoding route polylines in the native map. The map recalculates decoded paths when `route` changes. The contexts reuse their value objects while dependencies stay unchanged; they still notify consumers when state changes.

## Library hooks

### Expo Router: `useRouter` and `useLocalSearchParams`

`useRouter` is used in Trips, Explore, Create Trip, Preferences, Generating, Overview, Daily, and Map. It supplies navigation methods such as `push`, `back`, `dismissTo`, `dismissAll`, and `setParams`.

`useLocalSearchParams` is used in Overview, Daily, and Map. It reads trip ID, day, and activity parameters. Screens normalize values using `one(...)` and convert day values to numbers. Daily and Map combine these route values with the shared session rather than treating every parameter change as a complete session reset.

### TanStack Query: `useQuery`

The root creates one `QueryClient`, shared across screens. There are five query configurations:

| Consumer | Key | Behavior |
| --- | --- | --- |
| Explore | `["destinations", query]` | Debounced search; `keepPreviousData` preserves previous results while changing queries |
| Create Trip autocomplete | `["autocomplete", query]` | Disabled for empty query; sends the current autocomplete session ID |
| Create Trip destination picks | `["destinations", ""]` | Shares a cache key with unfiltered Explore |
| `useDayRoute` | `["dayRoute", tripId, version, day]` | Remote only; infinite freshness for that key; no automatic retry |
| `usePlaceDetails` | `["place", placeId, date, startMin, durationMin]` | Requires activity; ten-minute freshness; no automatic retry |

Explore reads query loading/error state and offers `refetch` on failure. The two custom query hooks expose only data. Full trips use the context cache, not this query cache. Generation and adjustment use direct API calls rather than `useMutation`.

### React Hook Form: `useForm`

Used in [app/create/index.tsx](../frontend/app/create/index.tsx). It initializes fields from the store draft, validates with `zodResolver(createTripSchema)`, and uses `mode: "onBlur"`.

`Controller` connects inputs to form state. `watch` reads fields and subscribes to changes; the subscription effect writes them into the draft. `setValue` fills a chosen destination, `trigger` validates it, `reset` loads a new draft, and `handleSubmit` validates before moving to Preferences. These are returned methods, not extra hooks.

### Fonts: `useFonts`

Imported from `@expo-google-fonts/manrope` in the root layout. It loads Manrope and DM Sans variants. The layout renders nothing while fonts are still loading; once loading succeeds or errors, an effect hides the splash screen and the app renders.

### Safe Area Context: `useSafeAreaInsets`

Used by Trips, Explore, Profile, Generating, Overview, Map, and shared `TopBar`, `BottomSheet`, and `Toast`. It supplies inset values for positioning around device edges. Examples include top padding for screens, bottom padding for sheets, and toast placement below the top inset.

### Reanimated: `useSharedValue` and `useAnimatedStyle`

Used only in `Toast`, in [src/components/ui.tsx](../frontend/src/components/ui.tsx). Shared values hold opacity and vertical displacement. When the message changes, an effect uses `withTiming` to animate them over 200 ms. `useAnimatedStyle` reads those values and produces the animated opacity/transform style.

## File-by-file hook map

Paths in this table are relative to `frontend/`.

| File | Hooks called |
| --- | --- |
| [app/_layout.tsx](../frontend/app/_layout.tsx) | `useFonts`, `useEffect`, `useStore` (in `ToastHost`); mounts `LocationPermissionProvider` and `LocationProvider` |
| [app/(tabs)/index.tsx](../frontend/app/%28tabs%29/index.tsx) | `useStore`, `useRouter`, `useSafeAreaInsets`, `useToday` |
| [app/(tabs)/explore.tsx](../frontend/app/%28tabs%29/explore.tsx) | `useStore`, `useRouter`, `useSafeAreaInsets`, `useState`, `useDebounced`, `useQuery` |
| [app/(tabs)/profile/index.tsx](../frontend/app/%28tabs%29/profile/index.tsx) | `useStore`, `useRouter`, `useSafeAreaInsets`, `useToday` |
| [app/(tabs)/profile/edit.tsx](../frontend/app/%28tabs%29/profile/edit.tsx) | `useStore`, `useState`, `useRef`, `useForm` |
| [app/(tabs)/profile/preferences.tsx](../frontend/app/%28tabs%29/profile/preferences.tsx) | `useStore`, `useState`, `useEffect` |
| [app/(tabs)/profile/history.tsx](../frontend/app/%28tabs%29/profile/history.tsx) | `useStore`, `useRouter`, `useToday` |
| [app/create/index.tsx](../frontend/app/create/index.tsx) | `useStore`, `useRouter`, `useForm`, `useEffect`, `useRef`, `useDebounced`, `useQuery`, `useState` |
| [app/create/preferences.tsx](../frontend/app/create/preferences.tsx) | `useStore`, `useRouter` |
| [app/create/generating.tsx](../frontend/app/create/generating.tsx) | `useStore`, `useRouter`, `useSafeAreaInsets`, `useState`, `useRef`, `useEffect` |
| [app/trip/[id]/index.tsx](../frontend/app/trip/%5Bid%5D/index.tsx) | `useLocalSearchParams`, `useStore`, `useTripSession`, `useRouter`, `useSafeAreaInsets`, `useState`, `useTrip` |
| [app/trip/[id]/day/[day].tsx](../frontend/app/trip/%5Bid%5D/day/%5Bday%5D.tsx) | `useLocalSearchParams`, `useStore`, `useTripSession`, `useRouter`, `useTrip`, `useState`, `useRef`, `useEffect`, `useDayRoute` |
| [app/trip/[id]/map.tsx](../frontend/app/trip/%5Bid%5D/map.tsx) | `useLocalSearchParams`, `useTripSession`, `useRouter`, `useSafeAreaInsets`, `useState`, `useRef`, `useTrip`, `useCurrentLocation`, `useEffect`, `useDayRoute` |
| [src/state/store.tsx](../frontend/src/state/store.tsx) | `useReducer`, `useState`, `useRef`, `useCallback`, `useEffect`, `useMemo`, `useContext`, `useStore` (inside `useTrip`) |
| [src/state/tripSession.tsx](../frontend/src/state/tripSession.tsx) | `useState`, `useCallback`, `useMemo`, `useContext` |
| [src/lib/useDebounced.ts](../frontend/src/lib/useDebounced.ts) | `useState`, `useEffect` |
| [src/lib/useDayRoute.ts](../frontend/src/lib/useDayRoute.ts) | `useQuery` |
| [src/state/locationPermission.tsx](../frontend/src/state/locationPermission.tsx) | `useState`, `useRef`, `useEffect`, `useCallback`, `useMemo`, `useContext` |
| [src/state/location.tsx](../frontend/src/state/location.tsx) | `useLocationPermission`, `useState`, `useRef`, `useEffect`, `useCallback`, `useMemo`, `useContext` |
| [src/components/NearbySection.tsx](../frontend/src/components/NearbySection.tsx) | `useCurrentLocation`, `useState`, `useQuery` |
| [src/components/ActivityDetailSheet.tsx](../frontend/src/components/ActivityDetailSheet.tsx) | `useQuery`, `usePlaceDetails`, `useCurrentLocation` |
| [src/components/AdjustDaySheet.tsx](../frontend/src/components/AdjustDaySheet.tsx) | `useStore`, `useState`, `useRef`, `useEffect` |
| [src/components/TripMap.tsx](../frontend/src/components/TripMap.tsx) | `useRef`, `useState`, `useMemo`, `useEffect` |
| [src/components/trip.tsx](../frontend/src/components/trip.tsx) | `useRef`, `useEffect` (in `DaySelector`) |
| [src/components/ui.tsx](../frontend/src/components/ui.tsx) | `useSafeAreaInsets`, `useSharedValue`, `useEffect`, `useAnimatedStyle` |

`TripMap.tsx` is the native implementation. The web map implementation and fallback do not call hooks.

## End-to-end example

1. **Startup:** `useFonts` gates rendering. The store's effect loads summaries, preferences, profile, and capabilities.
2. **Search:** `useState` holds input, `useDebounced` delays search changes, and `useQuery` loads destinations.
3. **Create:** `useStore().startDraft()` initializes the draft; `useRouter` opens creation. `useForm` validates inputs and its subscription copies them into shared state.
4. **Preferences:** The screen updates the draft through `useStore`, then navigates to generation.
5. **Generate:** An effect starts the request. Local state displays progress/errors; refs retain the draft and request identity. Retry increments `attempt`; success stores the trip and navigates.
6. **Inspect:** `useTrip` supplies the full itinerary. `useTripSession` connects day/activity selections between Daily and Map. Refs and effects scroll the selected item into view.
7. **Enrich:** `useDayRoute` supplies geometry and `usePlaceDetails` supplies stop information through the shared query cache.
8. **Adjust:** Local state controls preview/apply steps; a sequence ref ignores superseded preview responses. Applying stores the updated trip. Its new version changes the route query key.

## Implementation details to keep in mind

- `useTrip` has no explicit retry/reset action or automatic cache freshness policy.
- Route and place-detail hooks hide query loading/errors; absent data is handled through the existing UI/fallbacks.
- The toast timeout is replaced when another toast appears, but has no provider-unmount cleanup.
- Profile's effect replaces its local preference draft whenever shared defaults change, including after initial loading.
- Context memoization does not provide field-level subscriptions. Store value changes can rerender all store consumers.
- Refs and idempotency keys survive renders within their mounted component; they are not durable storage across app restarts or remounts.

For setup and startup commands, see [README.md](../README.md).
