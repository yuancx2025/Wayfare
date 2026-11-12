# Calendar export: implementation plan

Prepared on November 2, 2026, against `main@7e23d1b`.
Working branch: `jay/calendar-export`.

It is a frontend-only feature outside the five-sprint roadmap; treat it as P1 under the roadmap's delivery rules and
merge it before November 15, when Sprint 5 stops accepting optional features.

**Status (November 11, 2026):** increments 1–5 are implemented on `jay/calendar-export`. Increment 6 is in progress:
the automated checks pass, and adding, removing, and the delete prompt were verified on the iOS Simulator; the
remaining on-device checks in section 5 are not yet done. Section 8 records where the implementation differs from
this plan.

## 1. Goal

From a trip's overview, a traveler can add every planned activity to the device's calendar, update those events
after the itinerary changes, and remove them again. The feature must be demonstrable on the iOS Simulator and the
Android emulator, including the permission-denied path.

Non-goals for this branch:

- Local notifications (the next branch; it reuses the time conversion from increment 2).
- Reading the user's other calendars, detecting conflicts, or importing events into Wayfare.
- Attendees, sharing, or syncing events through the backend. Nothing in this feature calls the API.

## 2. What exists today

| Area | Relevant facts |
| --- | --- |
| Data | `Day.date` is `YYYY-MM-DD`; `Activity.startMin` is minutes from local midnight; `Activity.durationMin` is the length. `Activity.id` is stable per itinerary card. `Trip.version` is optional. |
| Time zones | Neither `Destination` nor `Trip` stores a time zone. `startMin` means the destination's local time. |
| Date helpers | `src/domain/lib/format.ts` has `parseISO` (local `Date` at midnight), `toISO`, `addDays`, `fmtTime`. |
| Trip overview | `app/trip/[id]/index.tsx` has a "Trip options" `BottomSheet` with *View map* and *Delete trip*. Calendar actions belong there. |
| Permissions | `src/state/locationPermission.tsx` shows the project's permission pattern: check silently, map to `undetermined/granted/denied/blocked`, and offer `Linking.openSettings()` when blocked. |
| Storage | `src/lib/storage.ts` provides `loadJSON`, `saveJSON`, and `saveJSONStrict`. |
| Identity | `useAuthSession()` exposes `mode` (`guest`/`account`) and `userId`; guest and account trips are separate. |
| Config | `app.config.ts` lists config plugins; native changes require rebuilding the dev client (`npm run ios:dev`, `npm run android:dev`). |
| Tests | Jest with `jest-expo`; tests live in `src/**/__tests__/*.test.ts`. |

## 3. Design

### 3.1 Dependency and native configuration

- Install with `npx expo install expo-calendar` so the version matches SDK 57.
- Add the config plugin to `app.config.ts` with a `calendarPermission` message, for example "Wayfare adds your
  trip's activities to your calendar when you ask." The plugin adds the iOS usage description and the Android
  `READ_CALENDAR`/`WRITE_CALENDAR` permissions.
- Confirm against the installed version's documentation whether SDK 57 exposes a newer calendar API alongside the
  classic functions (`getCalendarPermissionsAsync`, `requestCalendarPermissionsAsync`, `getCalendarsAsync`,
  `createCalendarAsync`, `createEventAsync`, `updateEventAsync`, `deleteEventAsync`). Use one API consistently.
- Hide the calendar actions on web (`Platform.OS === "web"`); the project builds a web preview.

### 3.2 A dedicated "Wayfare" calendar

Write events into a calendar that Wayfare creates and owns instead of the user's default calendar:

- The user can hide or delete all Wayfare events at once from the system Calendar app.
- Wayfare never edits events it did not create.
- On the Android emulator with no signed-in Google account there may be no writable calendar. A local calendar
  (`source: { isLocalAccount: true, name: "Wayfare", type: LOCAL }`) works without an account.
- On iOS, create it in the source of the default calendar, falling back to the local source.

Persist the calendar ID. If the user deletes the calendar, the next export detects the missing ID and creates a
new one.

### 3.3 Pure time conversion — `src/domain/logic/calendarEvents.ts`

No native imports, fully unit-tested:

```ts
export interface CalendarEventDraft {
  key: string;          // `${tripId}:${activityId}`, used to match existing events
  title: string;        // activity name
  location: string;     // activity name + area
  notes: string;        // description, "Day N · theme", "Added by Wayfare"
  start: Date;
  end: Date;
  fingerprint: string;  // changes when any field above changes
}

export function activityTimes(day: Day, activity: Activity): { start: Date; end: Date };
export function tripToCalendarEvents(trip: Trip): CalendarEventDraft[];
```

- `start` is `parseISO(day.date)` plus `startMin` minutes; `end` adds `durationMin`. Activities that end after
  midnight end on the next date rather than wrapping.
- Skip activities with `durationMin <= 0`.
- `activityTimes` is exported so the notifications branch can reuse it.

### 3.4 Time zone decision

Version 1 interprets activity times in the **device's** time zone. That is correct when the traveler's phone is
set to the destination's zone, and for the classroom demonstration. A traveler planning Tokyo from Durham will see
events at the wrong absolute time. Mitigations:

- Show "Times use this device's time zone" in the confirmation sheet.
- Record it in the PR description as a known limitation.

P1 follow-up, not in this branch: add an IANA `timeZone` to destinations (the bundled catalogs in
`frontend/src/domain/data/places.ts` and `backend/app/integrations/places/catalog.json`) and pass it as the
event's `timeZone`. That touches shared domain types, so agree on it with the collections owner first.

### 3.5 Sync model — `src/lib/calendar.ts`

The native wrapper owns permissions, the Wayfare calendar, and a stored mapping:

```ts
// Storage key: `wayfare:calendar:${namespace}`; namespace is "guest" or the account's userId.
interface CalendarIndex {
  calendarId: string | null;
  trips: Record<string, { syncedAt: number; events: Record<string, { eventId: string; fingerprint: string }> }>;
}

export function getCalendarPermission(): Promise<CalendarPermission>;
export function requestCalendarPermission(): Promise<CalendarPermission>;
export function syncTripToCalendar(trip: Trip, namespace: string): Promise<SyncResult>;   // { added, updated, removed }
export function removeTripFromCalendar(tripId: string, namespace: string): Promise<number>;
export function calendarStatus(trip: Trip, namespace: string): Promise<"none" | "synced" | "stale">;
```

`syncTripToCalendar` is an upsert, so pressing the button twice never creates duplicates:

1. Ensure permission and the Wayfare calendar.
2. Build drafts with `tripToCalendarEvents`.
3. For each draft: create it if the key is unknown; update it if the fingerprint changed; recreate it if the update
   fails because the user deleted the event.
4. Delete stored events whose keys no longer appear (an adjustment removed the activity).
5. Save the index with `saveJSONStrict` only after the calendar writes. A failed save reports an error instead of
   pretending the trip is synced.

Serialize calls with a module-level promise chain so a double tap cannot run two syncs at once.

`calendarStatus` compares the stored fingerprints with fresh drafts; `"stale"` means the itinerary changed after
the last export, for example after applying an adjustment.

### 3.6 User interface

All changes are in the "Trip options" sheet in `app/trip/[id]/index.tsx`, plus a small sheet component:

| Status | Menu rows | Result |
| --- | --- | --- |
| `none` | **Add to calendar** | Confirmation sheet: event count, date range, the time-zone note, *Add N events* |
| `synced` | "Calendar is up to date" (not pressable) and **Remove from calendar** | Remove asks first, then toasts the count |
| `stale` | **Update calendar** with the hint "Your itinerary changed since you added it", and **Remove from calendar** | Sheet, then a toast listing what changed |

Permission handling follows the location pattern:

- `undetermined`: show the system prompt when the user taps *Add*.
- `denied`: explain why access is needed and offer to ask again.
- `blocked`: explain, and offer **Open Settings** (`Linking.openSettings()`); recheck on return to the foreground.

Deleting a trip always asks first. When the trip has exported events, the dialog offers **Keep events** or
**Delete events too**. Keep the calendar call in the screen, not in `state/store.tsx`, so the store stays free of
native modules.

Past trips: show Add and Update only for upcoming and ongoing trips, using the `TripPhase` classification in
`src/domain/logic/tripHistory.ts` with `useToday()`. Remove stays available for any exported trip.

## 4. Increments

Commit and push each increment; open one pull request when increment 6 passes.

1. **Platform check (half a day).** Install the package, add the plugin, rebuild both dev clients, and create a
   throwaway event from a temporary button. Confirm where it appears on each simulator. On Android, confirm which
   calendar app the emulator image has; if none shows local calendars, choose an image that does and record it in
   the PR. Remove the temporary button.
2. **Time conversion.** `calendarEvents.ts` and `src/domain/__tests__/calendarEvents.test.ts`: start/end times,
   multi-day trips, midnight crossing, zero duration, stable keys, fingerprint changes.
3. **Sync engine.** `src/lib/calendar.ts` and `src/lib/__tests__/calendar-sync.test.ts` with `expo-calendar`
   mocked: first export, repeat export creates nothing, changed activity updates, removed activity deletes,
   deleted-by-user event is recreated, deleted calendar is recreated, failed index save surfaces an error,
   guest and account indexes stay separate.
4. **User interface.** Trip options rows, confirmation sheet, permission states, toasts, accessibility labels.
5. **Remove and delete flows.** *Remove from calendar*, and the prompt when deleting a trip.
6. **Validation and documentation.** Run the checklist in section 5 and add a short "Calendar export" section to
   `docs/frontend-study-guide.md`.

## 5. Acceptance

Automated, from `frontend/`:

- [x] `npm run typecheck`, `npm run lint`, and `npm test` pass.
- [x] `npx expo export` succeeds for iOS and Android.

On both the iOS Simulator and the Android emulator:

- [ ] Adding an upcoming trip creates one event per activity in the "Wayfare" calendar at the itinerary's times.
- [ ] Adding the same trip again creates no duplicates.
- [ ] After applying a day adjustment, the menu shows **Update calendar**; updating changes only affected events.
- [ ] *Remove from calendar* deletes exactly the trip's events.
- [ ] Denying permission shows the explanation; a blocked permission offers Settings and works after enabling.
- [ ] Deleting a trip offers to remove its events.
- [ ] Signing in as an account does not show the guest's export status, and vice versa.
- [ ] Guest mode works without a backend.

## 6. Demonstration script

Run it on the iOS Simulator, where Apple Calendar shows the "Wayfare" calendar (see section 8 for Android).

1. Open an upcoming trip, choose **Trip options → Add to calendar**, and allow access.
2. Switch to the Calendar app and show the trip's days filled with Wayfare events.
3. Back in Wayfare, adjust a day, then choose **Update calendar** and show the changed event.
4. Optionally, reset the permission first, deny it, and recover through **Open Settings**.

## 7. Risks and coordination

| Risk | Mitigation |
| --- | --- |
| The Android emulator image has no calendar app that shows local calendars | **Confirmed.** Writes succeed, but Google Calendar hides local calendars; see section 8 |
| Device time zone differs from the destination | Documented limitation; `timeZone` follow-up in section 3.4 |
| Conflicts in `app.config.ts` and `package.json` with other branches | Small additive edits; rebase on `main` before opening the PR |
| Native module needs a rebuilt dev client | Note the rebuild in the PR so reviewers run `ios:dev`/`android:dev` |
| Shared domain types change in the collections branch | This plan only reads `Trip`, `Day`, and `Activity` and adds no fields |

## 8. Implementation notes

What changed from the plan, and what building it showed:

- **Event location** is `name, area, destination` (for example `Senso-ji, Asakusa, Tokyo`), so Maps resolves it.
- **SDK 57 calendar API.** `expo-calendar` now exports an object-oriented API from its root (`createCalendar`,
  `calendar.createEvent`, `event.update`, `event.delete`); the function-style API moved to `expo-calendar/legacy`.
  A missing event or calendar rejects on iOS and resolves to nothing on Android, so `findEvent` treats both as gone.
- **Export status** is loaded with React Query (`useCalendarExport`) instead of an effect, keyed by the trip, so an
  adjusted itinerary is compared again. Opening the trip menu refetches it.
- **Every destructive action asks first:** deleting a trip, and *Remove from calendar*.
- **Dialogs after the menu.** iOS cannot present a modal while another is still dismissing and fails silently, so
  menu actions that open a sheet or an `Alert` wait for the menu's `onDismiss` on iOS (Android does not fire it and
  runs them immediately). `BottomSheet` in `src/components/ui.tsx` gained an optional `onDismiss` prop for this.
- **Android display.** On the Pixel emulator (Google Play image) the local "Wayfare" calendar and its events are
  written correctly, but Google Calendar only lists Google-account calendars, so the events are not visible there.
  **Decision (November 11, 2026):** keep the local calendar and treat this as a known limitation; the calendar is
  demonstrated on iOS. Follow-up after the course: on Android, write into a writable account calendar (or let the user
  pick one), which Google Calendar does display.
- **Build fixes needed to run on Xcode 27** (commit `b95e0b9`): `["@clerk/expo", { appleSignIn: false }]`, because
  the Sign in with Apple entitlement forces code signing even for Simulator builds, and
  `frontend/plugins/withSceneLifecycle.js`, because iOS 27 refuses to launch apps without the UIScene life cycle.
- **Android build notes:** Gradle needs Java 17 (`JAVA_HOME=$(/usr/libexec/java_home -v 17)`); Java 25 fails in the
  `react-native-worklets` CMake step. Opening a trip needs `GOOGLE_MAPS_ANDROID_KEY` in `frontend/.env`, or the
  native map crashes the app.
