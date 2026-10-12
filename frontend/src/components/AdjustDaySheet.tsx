import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { AdjustKind, Place, Proposal, ProposalRequest, Trip } from "@/domain/types";
import { fmtTime } from "@/domain/lib/format";
import { CATEGORY_LABEL } from "@/domain/logic/labels";
import { api, ApiError } from "@/lib/api";
import { useStore } from "@/state/store";
import { BottomSheet, Button, ErrorLine, Spinner } from "./ui";
import { Icon, type IconName } from "./Icon";
import { colors, font, radius, space, touch } from "@/theme";

const OPTIONS: { kind: AdjustKind; icon: IconName; title: string; body: string }[] = [
  { kind: "relaxed", icon: "leaf", title: "Make it more relaxed", body: "Fewer stops, later start, longer breaks" },
  { kind: "less-walking", icon: "train", title: "Less walking", body: "Swap long walks for transit or a ride" },
  { kind: "more-food", icon: "utensils", title: "More food", body: "Add a tasting stop in the afternoon" },
  { kind: "replace", icon: "swap", title: "Replace an activity", body: "Pick a stop and preview an alternative" },
];
const CUSTOM = { kind: "custom" as const, icon: "spark" as const, title: "Describe a change", body: "Tell the planner what you'd like in your own words" };
const EXAMPLES = ["Swap the museum for something outdoors", "Start after 10am and keep dinner", "Add a coffee break near lunch"];

type Step =
  | { name: "menu" }
  | { name: "pick" }
  | { name: "alt"; activityId: string; candidates: Place[] | null; index: number }
  | { name: "custom"; text: string }
  | { name: "preview"; title: string; req: ProposalRequest };

const emptyText = (req: ProposalRequest) =>
  req.kind === "replace" ? "No unused alternatives nearby for this stop."
    : req.kind === "less-walking" ? "Walks on this day are already short — nothing to change."
    : req.kind === "custom" ? "The planner couldn't find a change that fits. Try wording it differently."
    : "No unused food spots left nearby for this day.";

const keyOf = (req: ProposalRequest) => JSON.stringify(req);

export default function AdjustDaySheet({ open, trip, dayIndex, onClose, onApplied }: {
  open: boolean; trip: Trip; dayIndex: number; onClose: () => void; onApplied: (trip: Trip, newId?: string) => void;
}) {
  const { capabilities, loadTrip } = useStore();
  const [step, setStep] = useState<Step>({ name: "menu" });
  const [proposals, setProposals] = useState<Record<string, Proposal>>({});
  const [busy, setBusy] = useState<"propose" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Responses from a previous option or trip version are ignored.
  const seq = useRef(0);
  const day = trip.days[dayIndex];

  useEffect(() => {
    if (open) setError(null);
  }, [open, dayIndex]);
  useEffect(() => {
    if (!open) return;
    setStep({ name: "menu" });
    setProposals({});
    setBusy(null);
    seq.current++;
  }, [open, dayIndex, trip.version]);

  async function request(req: ProposalRequest) {
    const key = keyOf(req);
    if (proposals[key]) return;
    const mine = ++seq.current;
    setBusy("propose");
    setError(null);
    try {
      const p = await api.propose(trip.id, dayIndex, req);
      if (mine === seq.current) setProposals((all) => ({ ...all, [key]: p }));
    } catch (e) {
      if (mine === seq.current) setError(e instanceof Error ? e.message : "Couldn't build a preview");
    } finally {
      if (mine === seq.current) setBusy(null);
    }
  }

  function preview(title: string, req: ProposalRequest) {
    setStep({ name: "preview", title, req });
    void request(req);
  }

  async function pickStop(activityId: string) {
    setStep({ name: "alt", activityId, candidates: null, index: 0 });
    const mine = ++seq.current;
    setError(null);
    try {
      const candidates = await api.alternatives(trip.id, dayIndex, activityId);
      if (mine !== seq.current) return;
      setStep({ name: "alt", activityId, candidates, index: 0 });
      if (candidates[0]) void request({ kind: "replace", activityId, placeId: candidates[0].id });
    } catch (e) {
      if (mine === seq.current) {
        setError(e instanceof Error ? e.message : "Couldn't load alternatives");
        setStep({ name: "alt", activityId, candidates: [], index: 0 });
      }
    }
  }

  async function apply(p: Proposal) {
    if (!p.proposalId) return;
    setBusy("apply");
    setError(null);
    try {
      onApplied(await api.applyProposal(trip.id, p.proposalId), p.newId);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError("This trip changed since the preview was made. Showing the latest version.");
        loadTrip(trip.id).catch(() => undefined);
      } else if (e instanceof ApiError && e.status === 410) {
        setProposals({});
        setError("That preview expired. Choose the option again to refresh it.");
      } else {
        setError(e instanceof Error ? e.message : "Couldn't apply the change");
      }
    } finally {
      setBusy(null);
    }
  }

  const options = capabilities.agent ? [...OPTIONS, CUSTOM] : OPTIONS;
  let title = `Adjust Day ${dayIndex + 1}`;
  let body: ReactNode = null;
  let footer: ReactNode = null;

  if (step.name === "menu") {
    body = (
      <View style={styles.options}>
        {options.map((o) => (
          <Pressable
            key={o.kind}
            style={styles.option}
            onPress={() => (o.kind === "replace" ? setStep({ name: "pick" }) : o.kind === "custom" ? setStep({ name: "custom", text: "" }) : preview(o.title, { kind: o.kind }))}
          >
            <View style={styles.optionIcon}><Icon name={o.icon} color={colors.forest} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{o.title}</Text>
              <Text style={styles.optionBody}>{o.body}</Text>
            </View>
            <Icon name="chevron" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    );
  } else if (step.name === "pick") {
    title = "Which stop?";
    body = (
      <View style={styles.options}>
        {day.activities.map((a, i) => (
          <Pressable key={a.id} style={styles.option} onPress={() => { void pickStop(a.id); }}>
            <Text style={styles.num}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{a.name}</Text>
              <Text style={styles.optionBody}>{fmtTime(a.startMin)} · {CATEGORY_LABEL[a.category]}</Text>
            </View>
            <Icon name="swap" size={18} color={colors.muted} />
          </Pressable>
        ))}
      </View>
    );
    footer = <Button variant="ghost" onPress={() => setStep({ name: "menu" })}>Back</Button>;
  } else if (step.name === "custom") {
    title = CUSTOM.title;
    const text = step.text.trim();
    body = (
      <View style={{ gap: space[3] }}>
        <Text style={styles.kicker}>What should change on Day {dayIndex + 1}?</Text>
        <TextInput
          style={styles.textarea}
          multiline
          maxLength={500}
          autoFocus
          value={step.text}
          placeholder="e.g. Swap the museum for something outdoors"
          placeholderTextColor="#a5ada9"
          onChangeText={(t) => setStep({ name: "custom", text: t })}
          accessibilityLabel={`What should change on Day ${dayIndex + 1}?`}
        />
        <View style={styles.examples}>
          {EXAMPLES.map((x) => (
            <Pressable key={x} style={styles.example} onPress={() => setStep({ name: "custom", text: x })}>
              <Text style={styles.exampleText}>{x}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fine}>The planner only edits this day and shows you a preview before anything changes.</Text>
      </View>
    );
    footer = (
      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}><Button variant="secondary" onPress={() => setStep({ name: "menu" })}>Back</Button></View>
        <View style={{ flex: 1 }}>
          <Button icon="spark" disabled={text.length < 3} onPress={() => preview(CUSTOM.title, { kind: "custom", instruction: text })}>Preview</Button>
        </View>
      </View>
    );
  } else {
    const req: ProposalRequest | null = step.name === "preview"
      ? step.req
      : step.candidates?.[step.index] ? { kind: "replace", activityId: step.activityId, placeId: step.candidates[step.index].id } : null;
    const proposal = req ? proposals[keyOf(req)] : undefined;
    const loadingCandidates = step.name === "alt" && step.candidates === null;
    const noCandidates = step.name === "alt" && step.candidates?.length === 0;
    const empty = noCandidates || (!!proposal && proposal.changes.length === 0);
    const candidate = step.name === "alt" ? step.candidates?.[step.index] : undefined;
    title = step.name === "preview" ? step.title : "Replace an activity";

    const cycle = () => {
      if (step.name !== "alt" || !step.candidates) return;
      const index = (step.index + 1) % step.candidates.length;
      setStep({ ...step, index });
      void request({ kind: "replace", activityId: step.activityId, placeId: step.candidates[index].id });
    };

    body = (
      <View style={{ gap: space[3] }}>
        {step.name === "alt" && (step.candidates?.length ?? 0) > 1 ? (
          <Pressable onPress={cycle} disabled={busy === "propose"} style={styles.textBtn}>
            <Icon name="refresh" size={15} color={colors.forest} />
            <Text style={styles.textBtnLabel}>Show another option ({step.index + 1}/{step.candidates!.length})</Text>
          </Pressable>
        ) : null}
        <ErrorLine message={error} />
        {loadingCandidates || (busy === "propose" && !proposal) ? (
          <Spinner label={step.name === "preview" && step.req.kind === "custom" ? "The planner is reworking your day" : "Building a preview"} />
        ) : empty ? (
          <Text style={styles.empty}>{emptyText(req ?? { kind: "replace" })}</Text>
        ) : proposal ? (
          <>
            {candidate?.why ? (
              <View style={styles.why}>
                <Icon name="spark" size={14} color="#b07d2c" />
                <Text style={styles.whyText}><Text style={styles.whyLabel}>Why this pick{"\n"}</Text>{candidate.why}</Text>
              </View>
            ) : null}
            <Text style={styles.kicker}>Proposed changes</Text>
            {proposal.changes.map((c, i) => (
              <Text key={i} style={[styles.change, c.type === "added" && styles.added, c.type === "removed" && styles.removed, c.type === "changed" && styles.changed]}>
                {c.type === "added" ? "+ " : c.type === "removed" ? "− " : "~ "}{c.text}
              </Text>
            ))}
            <Text style={styles.kicker}>New schedule</Text>
            <View style={styles.mini}>
              {proposal.day.activities.map((a, i) => (
                <View key={a.id} style={[styles.miniRow, a.id === proposal.newId && styles.miniNew]}>
                  <Text style={styles.miniNum}>{i + 1}</Text>
                  <Text style={styles.miniTime}>{fmtTime(a.startMin)}</Text>
                  <Text style={styles.miniName}>{a.name}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    );
    footer = (
      <View style={styles.footerRow}>
        <View style={{ flex: 1 }}><Button variant="secondary" onPress={onClose}>Cancel</Button></View>
        <View style={{ flex: 1 }}>
          <Button onPress={() => { if (proposal) void apply(proposal); }} disabled={!proposal || empty || busy !== null} icon="check">
            {busy === "apply" ? "Applying…" : "Apply"}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={title} footer={footer}>
      {step.name === "menu" || step.name === "pick" || step.name === "custom" ? <ErrorLine message={error} /> : null}
      {body}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  options: { gap: space[2] },
  option: { minHeight: 68, padding: space[3], flexDirection: "row", alignItems: "center", gap: space[3], borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white },
  optionIcon: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  optionTitle: { fontFamily: font.bodySemi, fontSize: 15, color: colors.ink },
  optionBody: { color: colors.muted, fontFamily: font.body, fontSize: 13 },
  num: { width: 32, height: 32, borderRadius: 16, overflow: "hidden", backgroundColor: colors.forest, color: colors.white, textAlign: "center", lineHeight: 32, fontFamily: font.bodyBold },
  textBtn: { minHeight: touch, flexDirection: "row", alignItems: "center", gap: 6 },
  textBtnLabel: { color: colors.forest, fontFamily: font.bodyBold, fontSize: 14 },
  empty: { padding: space[5], borderRadius: radius.md, backgroundColor: colors.cream, color: colors.muted, textAlign: "center", fontFamily: font.body, fontSize: 14 },
  kicker: { color: colors.muted, fontFamily: font.bodyBold, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  change: { borderRadius: radius.sm, padding: 10, fontFamily: font.body, fontSize: 14, lineHeight: 20, overflow: "hidden" },
  added: { color: "#1f5a34", backgroundColor: "#e3f2e7" },
  removed: { color: colors.coralInk, backgroundColor: "#fbe8e3" },
  changed: { color: "#6b5216", backgroundColor: "#f8f0dc" },
  mini: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: "hidden" },
  miniRow: { minHeight: 46, paddingHorizontal: space[3], flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line },
  miniNew: { backgroundColor: "#f0f8f2" },
  miniNum: { width: 24, height: 24, borderRadius: 12, overflow: "hidden", backgroundColor: colors.forest, color: colors.white, textAlign: "center", lineHeight: 24, fontFamily: font.bodyBold, fontSize: 12 },
  miniTime: { width: 78, color: colors.muted, fontFamily: font.body, fontSize: 13 },
  miniName: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colors.ink },
  footerRow: { flexDirection: "row", gap: space[3] },
  why: { flexDirection: "row", gap: 8, backgroundColor: "#f0f6f2", borderRadius: radius.sm, padding: 10 },
  whyText: { flex: 1, color: colors.forest, fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  whyLabel: { fontFamily: font.bodyBold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  textarea: { minHeight: 96, padding: space[3], borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.white, fontFamily: font.body, fontSize: 15, color: colors.ink, textAlignVertical: "top" },
  examples: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  example: { minHeight: 40, paddingHorizontal: space[3], borderRadius: 999, borderWidth: 1.5, borderColor: "#d8dcd7", backgroundColor: colors.white, justifyContent: "center" },
  exampleText: { fontFamily: font.bodySemi, fontSize: 13, color: colors.ink },
  fine: { color: colors.muted, fontFamily: font.body, fontSize: 12, lineHeight: 18 },
});
