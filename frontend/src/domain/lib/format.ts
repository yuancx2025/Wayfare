export const parseISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (iso: string, n: number) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);
export const todayISO = () => toISO(new Date());

export const fmtDay = (iso: string) => parseISO(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtShort = (iso: string) => parseISO(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const fmtWeekday = (iso: string) => parseISO(iso).toLocaleDateString("en-US", { weekday: "short" });
export const fmtDayNum = (iso: string) => parseISO(iso).getDate();
export const fmtRange = (a: string, b: string) => {
  const sa = parseISO(a), sb = parseISO(b);
  const sameMonth = sa.getMonth() === sb.getMonth() && sa.getFullYear() === sb.getFullYear();
  return sameMonth ? `${fmtShort(a)} – ${sb.getDate()}, ${sb.getFullYear()}` : `${fmtShort(a)} – ${fmtShort(b)}, ${sb.getFullYear()}`;
};

export const fmtTime = (min: number) => {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const fmtDuration = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
