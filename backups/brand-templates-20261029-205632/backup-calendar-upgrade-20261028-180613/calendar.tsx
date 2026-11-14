import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { format, isSameDay, parseISO } from "date-fns";
import { ArrowLeft, CalendarDays, Clock, Plus, RefreshCw } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type CompanyEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  event_type: string;
  created_by: string | null;
};

export const Route = createFileRoute("/_authenticated/calendar")({
  component: CompanyCalendarPage,
});

function CompanyCalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [eventType, setEventType] = useState("meeting");

  async function loadEvents() {
    setLoading(true);
    setError("");
    const result = await (supabase as any)
      .from("calendar_events")
      .select("id,title,description,starts_at,ends_at,event_type,created_by")
      .order("starts_at", { ascending: true })
      .limit(500);

    if (result.error) {
      setError(
        "Could not load company events. Apply the calendar SQL migration in Supabase, then reload this page. " +
        result.error.message
      );
    } else {
      setEvents((result.data ?? []) as CompanyEvent[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadEvents();
  }, []);

  const dayEvents = useMemo(
    () => events.filter((event) => isSameDay(parseISO(event.starts_at), selectedDate)),
    [events, selectedDate]
  );

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const start = new Date(`${format(selectedDate, "yyyy-MM-dd")}T${startTime}:00`);
    const end = new Date(`${format(selectedDate, "yyyy-MM-dd")}T${endTime}:00`);

    if (end <= start) {
      setError("The end time must be later than the start time.");
      setSaving(false);
      return;
    }

    const { data: userResult } = await supabase.auth.getUser();
    if (!userResult.user) {
      setError("Your session has expired. Sign in again to create an event.");
      setSaving(false);
      return;
    }

    const result = await (supabase as any).from("calendar_events").insert({
      title: title.trim(),
      description: description.trim() || null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      event_type: eventType,
      created_by: userResult.user.id,
    });

    if (result.error) {
      setError("Event could not be saved: " + result.error.message);
    } else {
      setTitle("");
      setDescription("");
      setShowForm(false);
      setNotice("Company event saved.");
      await loadEvents();
    }
    setSaving(false);
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            to="/dashboard"
            className="mb-4 inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Kalexi Brokerage Â· Company workspace
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Company Calendar</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Coordinate meetings, programmes, deadlines and company events.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadEvents()} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => { setShowForm((value) => !value); setError(""); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add event
          </Button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-border p-3 text-sm">
          {notice}
        </div>
      )}

      {showForm && (
        <form onSubmit={createEvent} className="space-y-4 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Create company event</h2>
          <p className="text-sm text-muted-foreground">
            Events are shared with authenticated company users according to the database access policies.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="event-title" className="text-sm font-medium">Event title</label>
              <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Weekly operations meeting" required maxLength={160} />
            </div>
            <div className="space-y-2">
              <label htmlFor="event-type" className="text-sm font-medium">Event type</label>
              <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                <option value="meeting">Meeting</option>
                <option value="programme">Programme</option>
                <option value="deadline">Deadline</option>
                <option value="training">Training</option>
                <option value="announcement">Announcement</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor="event-start" className="text-sm font-medium">Start time</label>
              <Input id="event-start" type="time" value={startTime}
                onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <label htmlFor="event-end" className="text-sm font-medium">End time</label>
              <Input id="event-end" type="time" value={endTime}
                onChange={(e) => setEndTime(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="event-description" className="text-sm font-medium">Instructions / details</label>
            <Textarea id="event-description" value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Location, preparation, participants or other useful details."
              rows={3} maxLength={4000} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving || !title.trim()}>
              {saving ? "Saving..." : "Save event"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      <section className="grid gap-6 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="rounded-xl border bg-card p-3 sm:p-5">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            className="mx-auto"
          />
          <div className="mt-4 border-t pt-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{format(selectedDate, "EEEE, d MMMM yyyy")}</p>
            <p className="mt-1">
              {dayEvents.length} event{dayEvents.length === 1 ? "" : "s"} scheduled
            </p>
          </div>
        </div>

        <div className="min-w-0 rounded-xl border bg-card p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">{format(selectedDate, "EEEE, d MMMM")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Company schedule</p>
            </div>
            <span className="rounded-full border px-3 py-1 text-xs">{dayEvents.length} events</span>
          </div>

          {loading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading company events...</p>
          ) : dayEvents.length === 0 ? (
            <div className="rounded-lg border border-dashed px-5 py-12 text-center">
              <CalendarDays className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="font-medium">Nothing scheduled for this day</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Company events will appear here once they have been created.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {dayEvents.map((event) => (
                <article key={event.id} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold">{event.title}</h3>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize">
                      {event.event_type}
                    </span>
                  </div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4 shrink-0" />
                    {format(parseISO(event.starts_at), "p")}
                    {event.ends_at ? ` â€“ ${format(parseISO(event.ends_at), "p")}` : ""}
                  </p>
                  {event.description && (
                    <p className="mt-3 whitespace-pre-wrap text-sm">{event.description}</p>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Calendar times use your browser's local time zone. Google Calendar synchronisation and public-holiday
        feeds are not connected yet.
      </p>
    </main>
  );
}