import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { CalendarDays, Clock, ArrowRight, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type NextEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  event_type: string;
};

export function DashboardCalendarSummary() {
  const [now, setNow] = useState(new Date());
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadNextEvent() {
      const result = await (supabase as any)
        .from("calendar_events")
        .select("id,title,description,starts_at,ends_at,event_type")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1);

      if (!alive) return;
      if (result.error) setError("The next event is temporarily unavailable.");
      else setNextEvent((result.data?.[0] ?? null) as NextEvent | null);
      setLoading(false);
    }
    void loadNextEvent();
    const refresh = window.setInterval(() => void loadNextEvent(), 60000);
    return () => {
      alive = false;
      window.clearInterval(refresh);
    };
  }, []);

  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  return (
    <section className="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="rounded-2xl border bg-gradient-to-br from-sky-50 to-violet-50 p-5 dark:from-slate-950 dark:to-violet-950">
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="h-4 w-4" /> Kampala, Uganda</div>
        <div className="mt-3 text-3xl font-bold tabular-nums">{time}</div>
        <p className="mt-2 text-sm">{date}</p>
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="h-4 w-4" /> East Africa Time · UTC+3</div>
      </div>

      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold"><PartyPopper className="h-5 w-5 text-violet-500" /> Next company event</div>
          <Link to="/calendar" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">Open calendar <ArrowRight className="h-4 w-4" /></Link>
        </div>
        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">Checking the company schedule…</p>
        ) : error ? (
          <p className="mt-5 text-sm text-muted-foreground">{error} Open the calendar to retry.</p>
        ) : !nextEvent ? (
          <div className="mt-5 rounded-xl border border-dashed p-4">
            <p className="font-medium">No upcoming events scheduled 🎉</p>
            <p className="mt-1 text-sm text-muted-foreground">When a company event is added, its details will appear here.</p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="font-semibold">{nextEvent.title}</h3>
              <span className="rounded-full border px-2.5 py-1 text-xs capitalize">{nextEvent.event_type}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {format(new Date(nextEvent.starts_at), "EEEE, d MMMM yyyy")} · {format(new Date(nextEvent.starts_at), "HH:mm")}
              {nextEvent.ends_at ? ` – ${format(new Date(nextEvent.ends_at), "HH:mm")}` : ""}
            </p>
            {nextEvent.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{nextEvent.description}</p>}
          </div>
        )}
      </div>
    </section>
  );
}