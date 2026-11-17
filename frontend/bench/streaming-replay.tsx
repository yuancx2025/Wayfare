/** Expo Go entry point for the isolated streaming benchmark. See docs/benchmarks/streaming.md. */
import { registerRootComponent } from "expo";
import { fetch } from "expo/fetch";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { readEvents } from "../src/lib/api/sse";

const BASE = "http://127.0.0.1:8765";
const REPEATS = 5;
const PROGRESS = ["Finding places", "Grouping nearby places into days", "Estimating travel time", "Pacing each day", "Adding meals"];

type Day = { title: string; stops: string[] };
type Trace = { id: string; days: number; firstMs: number; doneMs: number; itinerary: Day[] };
type Arm = "checklist" | "preview";
type Fault = "none" | "retry" | "cancel";
type Frame = { stage: "preview" | "cleared" | "final" | "cancelled"; title?: string; ms: number };
type Screen = { key: number; phase: string; day?: Day; onFrame?: () => void };

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function ReplayBenchmark() {
  const [screen, setScreen] = useState<Screen>({ key: 0, phase: "ready" });
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("Three traces, five paired runs per trace");
  const sequence = useRef(0);

  async function trial(trace: Trace, arm: Arm, fault: Fault, pair: number) {
    const controller = new AbortController();
    const frames: Frame[] = [];
    let firstEventMs: number | null = null;
    let doneEventMs: number | null = null;
    let finalMatches = false;
    const start = performance.now();
    const elapsed = () => performance.now() - start;

    function show(stage: Frame["stage"], day?: Day, afterFrame?: () => void) {
      return new Promise<void>((resolve) => {
        setScreen({
          key: ++sequence.current,
          phase: stage,
          day,
          onFrame: () => {
            frames.push({ stage, title: day?.title, ms: elapsed() });
            afterFrame?.();
            resolve();
          },
        });
      });
    }

    setScreen({ key: ++sequence.current, phase: "loading" });
    try {
      const response = await fetch(`${BASE}/stream/${trace.id}?fault=${fault}`, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error("Replay stream unavailable");
      for await (const { event, data } of readEvents(response.body)) {
        firstEventMs ??= elapsed();
        if (controller.signal.aborted) break;
        if (event === "day" && arm === "preview") {
          void show("preview", data.day, fault === "cancel" ? () => controller.abort() : undefined);
        } else if (event === "reset" && arm === "preview") {
          void show("cleared");
        } else if (event === "done") {
          doneEventMs = elapsed();
          finalMatches = JSON.stringify(data.itinerary) === JSON.stringify(trace.itinerary);
          await show("final", data.itinerary[0]);
          break;
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) throw error;
    }

    if (fault === "cancel") {
      await show("cancelled");
      await delay(1450);
    }

    return {
      trace: trace.id, days: trace.days, pair, arm, fault,
      firstEventMs, doneEventMs, finalMatches,
      firstVisibleMs: frames.find((frame) => frame.title)?.ms ?? null,
      finalVisibleMs: frames.find((frame) => frame.stage === "final")?.ms ?? null,
      aborted: controller.signal.aborted, frames,
    };
  }

  async function run() {
    setRunning(true);
    try {
      const response = await fetch(`${BASE}/traces`);
      if (!response.ok) throw new Error("Could not load replay traces");
      const traces: Trace[] = await response.json();
      const runs = [];
      for (const [index, trace] of traces.entries()) {
        for (let pair = 1; pair <= REPEATS; pair++) {
          const arms: Arm[] = (pair + index) % 2 === 0 ? ["preview", "checklist"] : ["checklist", "preview"];
          for (const arm of arms) {
            setMessage(`${trace.days}-day trip · Pair ${pair}/${REPEATS} · ${arm}`);
            runs.push(await trial(trace, arm, "none", pair));
            await delay(120);
          }
        }
      }
      setMessage("Checking retry and cancellation");
      const checks = [await trial(traces[0], "preview", "retry", 0), await trial(traces[0], "preview", "cancel", 0)];
      const saved = await fetch(`${BASE}/result`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runs, checks }),
      });
      if (!saved.ok) throw new Error("Could not save replay measurements");
      setMessage("Finished 30 timed trials and 2 fault checks");
      setScreen({ key: ++sequence.current, phase: "finished" });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Replay failed");
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void run(), 500);
    return () => clearTimeout(timer);
    // The isolated benchmark launches exactly once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ScrollView style={styles.background} contentContainerStyle={styles.container}>
      <Text style={styles.caption}>WAYFARE STREAMING BENCHMARK</Text>
      <Text style={styles.message}>{message}</Text>
      {!running && (
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => void run()}>
          <Text style={styles.buttonText}>Run paired benchmark</Text>
        </Pressable>
      )}
      <ReplayFrame key={screen.key} screen={screen} />
    </ScrollView>
  );
}

function ReplayFrame({ screen }: { screen: Screen }) {
  const marked = useRef(false);
  if (screen.phase === "ready" || screen.phase === "finished") return null;
  return (
    <View
      style={styles.panel}
      onLayout={() => {
        if (!marked.current && screen.onFrame) {
          marked.current = true;
          requestAnimationFrame(() => requestAnimationFrame(() => screen.onFrame?.()));
        }
      }}
    >
      {screen.day ? (
        <View>
          <Text style={styles.caption}>{screen.phase === "preview" ? "DAY 1 PREVIEW" : "DAY 1"}</Text>
          <Text style={styles.title}>{screen.day.title}</Text>
          {screen.day.stops.map((stop, index) => <Text key={`${index}-${stop}`} style={styles.stop}>{index + 1}. {stop}</Text>)}
        </View>
      ) : screen.phase === "cancelled" ? <Text style={styles.title}>Planning cancelled</Text> : (
        <View>
          <ActivityIndicator color="#ead7ae" />
          <Text style={styles.title}>{screen.phase === "cleared" ? "Revising your itinerary" : "Building your itinerary"}</Text>
          {PROGRESS.map((label) => <Text key={label} style={styles.stop}>{label}</Text>)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#183829" },
  container: { paddingHorizontal: 24, paddingTop: 86, paddingBottom: 24 },
  caption: { color: "#ead7ae", fontWeight: "700", fontSize: 13, letterSpacing: 1 },
  message: { color: "#e3ede4", marginVertical: 12, fontSize: 15 },
  title: { color: "#fff", fontWeight: "700", fontSize: 25, marginVertical: 9 },
  stop: { color: "#e3ede4", marginVertical: 5, fontSize: 17 },
  button: { backgroundColor: "#ead7ae", alignItems: "center", borderRadius: 12, padding: 14 },
  buttonText: { color: "#183829", fontWeight: "700", fontSize: 17 },
  panel: { marginTop: 10, padding: 16, borderRadius: 16, backgroundColor: "#214534" },
});

registerRootComponent(ReplayBenchmark);
