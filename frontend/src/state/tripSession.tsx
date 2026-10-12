import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface Session {
  tripId?: string;
  day: number;
  activityId?: string;
}

interface TripSession extends Session {
  bind: (tripId: string, day: number) => void;
  setDay: (day: number) => void;
  setActivity: (activityId?: string) => void;
}

const Ctx = createContext<TripSession | null>(null);

export function TripSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ day: 0 });

  const bind = useCallback((tripId: string, day: number) => {
    setSession({ tripId, day, activityId: undefined });
  }, []);
  const setDay = useCallback((day: number) => {
    setSession((prev) => ({ ...prev, day, activityId: undefined }));
  }, []);
  const setActivity = useCallback((activityId?: string) => {
    setSession((prev) => ({ ...prev, activityId }));
  }, []);

  const value = useMemo<TripSession>(() => ({ ...session, bind, setDay, setActivity }), [session, bind, setDay, setActivity]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTripSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useTripSession outside TripSessionProvider");
  return s;
}
