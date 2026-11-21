import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { format, isSameDay, parseISO } from "date-fns";
import { enGB } from "date-fns/locale";
import { ArrowLeft, CalendarDays, Clock, Flag, PartyPopper, Plus, RefreshCw, Sparkles } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { canViewCompanyCalendar } from "@/lib/agents.functions";
import { ALL_ROLES, ROLE_LABEL } from "@/lib/rbac";
import { GlobalHolidaysPage } from "./holidays";

type CompanyEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  requirements: string | null;
  starts_at: string;
  ends_at: string | null;
  event_type: string;
  created_by: string | null;
  notification_groups: string[];
};

type AudienceOption = { value: string; label: string };
type CalendarEventClient = {
  from: (table: "calendar_events") => {
    select: (columns: string) => {
      order: (
        column: "starts_at",
        options: { ascending: boolean },
      ) => {
        limit: (
          count: number,
        ) => PromiseLike<{ data: CompanyEvent[] | null; error: { message: string } | null }>;
      };
    };
    insert: (event: {
      title: string;
      description: string | null;
      location: string | null;
      requirements: string | null;
      starts_at: string;
      ends_at: string;
      event_type: string;
      created_by: string;
      notification_groups: string[];
    }) => PromiseLike<{ error: { message: string } | null }>;
  };
};

type PublicHoliday = {
  date: string;
  localName: string;
  name: string;
  countryCode: string;
};

const calendarDb = supabase as unknown as CalendarEventClient;

const eventStyles: Record<string, string> = {
  meeting: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  programme: "border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200",
  deadline: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
  training: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  announcement: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  other: "border-border bg-muted text-foreground",
};

export const Route = createFileRoute("/_authenticated/calendar")({
  beforeLoad: async () => {
    if (!(await canViewCompanyCalendar())) throw redirect({ to: "/agent-portal" });
  },
  component: CompanyCalendarPage,
});

function CompanyCalendarPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [events, setEvents] = useState<CompanyEvent[]>([]);
  const [holidays, setHolidays] = useState<PublicHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [holidayLoading, setHolidayLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [holidayMessage, setHolidayMessage] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [requirements, setRequirements] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [eventType, setEventType] = useState("meeting");
  const [notificationGroups, setNotificationGroups] = useState<string[]>(["all"]);
  const [now, setNow] = useState(new Date());

  const staffOptions = useQuery({
    queryKey: ["calendar-audience-departments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("department")
        .eq("status", "active");
      if (error) throw error;
      return data ?? [];
    },
  });

  const audienceOptions = useMemo<AudienceOption[]>(() => {
    const presets: AudienceOption[] = [
      { value: "all", label: "Everyone, including agents" },
      { value: "employees", label: "Employees and staff" },
      { value: "agents", label: "Digital agents" },
      { value: "executive", label: "Executive" },
      { value: "finance", label: "Finance" },
      { value: "redemptions", label: "Redemptions" },
      ...ALL_ROLES.map((role) => ({ value: `role:${role}`, label: ROLE_LABEL[role] })),
    ];
    const departments = Array.from(
      new Set(
        (staffOptions.data ?? [])
          .map((profile) => profile.department?.trim())
          .filter((department): department is string => Boolean(department)),
      ),
    )
      .filter(
        (department) =>
          !["executive", "finance", "redemptions"].includes(department.toLowerCase()),
      )
      .sort((a, b) => a.localeCompare(b))
      .map((department) => ({
        value: `department:${department.toLowerCase().replace(/[^a-z0-9 _-]/g, "")}`,
        label: department,
      }))
      .filter((department) => department.value.length > "department:".length);
    return [...presets, ...departments];
  }, [staffOptions.data]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await calendarDb
      .from("calendar_events")
      .select(
        "id,title,description,starts_at,ends_at,event_type,created_by,location,requirements,notification_groups",
      )
      .order("starts_at", { ascending: true })
      .limit(500);

    if (result.error) {
      setError("Could not load company events. Check the database migration and your account permissions. " + result.error.message);
    } else {
      setEvents(result.data ?? []);
    }
    setLoading(false);
  }, []);

  async function loadHolidays() {
    setHolidayLoading(true);
    setHolidayMessage("");
    const year = new Date().getFullYear();

    try {
      const results = await Promise.all([year, year + 1].map(async (y) => {
        const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${y}/UG`);
        if (!response.ok) throw new Error(`Holiday service returned ${response.status}`);
        return await response.json() as PublicHoliday[];
      }));

      const combined = results.flat();
      const unique = Array.from(new Map(combined.map((holiday) => [holiday.date, holiday])).values());
      setHolidays(unique);
    } catch {
      setHolidayMessage("Uganda public holidays could not be loaded. Check your internet connection and refresh.");
    } finally {
      setHolidayLoading(false);
    }
  }

  useEffect(() => {
    void loadEvents();
    void loadHolidays();
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [loadEvents]);

  const dayEvents = useMemo(
    () => events.filter((event) => isSameDay(new Date(event.starts_at), selectedDate)),
    [events, selectedDate]
  );

  const dayHolidays = useMemo(
    () => holidays.filter((holiday) => holiday.date === format(selectedDate, "yyyy-MM-dd")),
    [holidays, selectedDate]
  );

  const eventDates = useMemo(
    () => events.map((event) => new Date(event.starts_at)),
    [events]
  );

  const holidayDates = useMemo(
    () => holidays.map((holiday) => parseISO(holiday.date)),
    [holidays]
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
    if (staffOptions.isError) {
      setError("Recipient departments could not be loaded. Refresh and try again.");
      setSaving(false);
      return;
    }
    if (!notificationGroups.length) {
      setError("Choose at least one group to notify.");
      setSaving(false);
      return;
    }

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError) {
      setError("Your account could not be verified. Sign in again.");
      setSaving(false);
      return;
    }
    if (!userResult.user) {
      setError("Your session has expired. Sign in again.");
      setSaving(false);
      return;
    }

    const result = await calendarDb.from("calendar_events").insert({
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      requirements: requirements.trim() || null,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      event_type: eventType,
      created_by: userResult.user.id,
      notification_groups: notificationGroups,
    });

    if (result.error) {
      setError("Event could not be saved. " + result.error.message);
    } else {
      setTitle("");
      setDescription("");
      setLocation("");
      setRequirements("");
      setNotificationGroups(["all"]);
      setShowForm(false);
      setNotice("Company event saved successfully.");
      await loadEvents();
    }
    setSaving(false);
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-7">
<section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:from-slate-950 dark:via-background dark:to-violet-950 md:p-8">
        <Link to="/dashboard" className="mb-5 inline-flex items-center gap-2 rounded-lg border bg-background/80 px-3 py-2 text-sm font-medium hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1.5 text-xs font-medium">
              <Sparkles className="h-3.5 w-3.5 text-violet-500" /> KALEXI | PLAN TOGETHER
            </div>
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              <CalendarDays color="#7C3AED" strokeWidth={2.2} className="mr-2 inline h-7 w-7 align-[-4px] shrink-0" aria-hidden="true" />
              Company Calendar
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground md:text-base">
              Meetings, programmes, deadlines and Uganda public holidays in one shared place.
            </p>
          </div>
          <div className="rounded-xl border bg-background/85 p-4 md:min-w-56">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock color="#D97706" strokeWidth={2.2} className="h-4 w-4 shrink-0" /> KAMPALA TIME
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Africa/Kampala",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }).format(now)}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Intl.DateTimeFormat("en-GB", {
                timeZone: "Africa/Kampala",
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              }).format(now)}
            </p>
          </div>
        </div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</div>}

      <section className="grid gap-6 lg:grid-cols-[minmax(300px,390px)_1fr]">
        <div className="rounded-2xl border bg-card p-3 shadow-sm sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3 px-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <CalendarDays color="#7C3AED" strokeWidth={2.2} className="h-4 w-4 shrink-0" aria-hidden="true" />
              Pick a date
            </h2>
            <Button variant="ghost" size="sm" onClick={() => { setSelectedDate(new Date()); }}>
              Today
            </Button>
          </div>
          <Calendar color="#7C3AED" strokeWidth={2.2}
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            locale={enGB}
            modifiers={{ hasEvent: eventDates, publicHoliday: holidayDates }}
            modifiersClassNames={{
              hasEvent: "font-bold underline decoration-2 decoration-blue-500 underline-offset-4",
              publicHoliday: "rounded-md bg-rose-100 font-bold text-rose-800 dark:bg-rose-950 dark:text-rose-200",
            }}
            className="mx-auto"
          />
          <div className="mt-3 space-y-2 border-t pt-4 text-xs">
            <p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Company event or programme</p>
            <p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Uganda public holiday</p>
            <p className="mt-3 text-muted-foreground">Select a date to see its schedule and holiday details.</p>
          </div>
        </div>

        <div className="min-w-0 space-y-5">
          <div className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Selected day</p>
                <h2 className="mt-1 text-xl font-bold md:text-2xl">{format(selectedDate, "EEEE, d MMMM yyyy", { locale: enGB })}</h2>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { void loadEvents(); void loadHolidays(); }} disabled={loading || holidayLoading}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh
                </Button>
                <Button onClick={() => { setShowForm((v) => !v); setError(""); }}>
                  <Plus color="#16A34A" strokeWidth={2.2} className="mr-2 h-4 w-4 shrink-0" /> Add event
                </Button>
              </div>
            </div>

            {dayHolidays.map((holiday) => (
              <div key={holiday.date} className="mt-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
                <div className="rounded-lg bg-white p-2 text-rose-600 dark:bg-rose-900"><Flag className="h-5 w-5" /></div>
                <div>
                  <p className="font-semibold text-rose-900 dark:text-rose-100">{holiday.localName || holiday.name}</p>
                  <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">Uganda public holiday</p>
                </div>
              </div>
            ))}

            {showForm && (
              <form onSubmit={createEvent} className="mt-5 space-y-4 rounded-xl border bg-muted/30 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Plus color="#16A34A" strokeWidth={2.2} className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Create company event
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="event-title" className="text-sm font-medium">Event title</label>
                    <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Weekly operations meeting" required maxLength={160} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="event-type" className="text-sm font-medium">Category</label>
                    <select id="event-type" value={eventType} onChange={(e) => setEventType(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
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
                    <Input id="event-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="event-end" className="text-sm font-medium">End time</label>
                    <Input id="event-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
                  </div>
                </div>
                <fieldset className="space-y-3 rounded-lg border bg-background p-4">
                  <legend className="px-1 text-sm font-medium">Notify these groups</legend>
                  {staffOptions.isLoading ? (
                    <p className="text-sm text-muted-foreground">Loading staff departments...</p>
                  ) : staffOptions.isError ? (
                    <p role="alert" className="text-sm text-destructive">
                      Recipient departments could not be loaded. Refresh before creating the event.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Selected groups receive an in-app notification. People outside the selected
                        groups cannot view this event.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {audienceOptions.map((option) => (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm"
                          >
                            <Checkbox
                              checked={notificationGroups.includes(option.value)}
                              onCheckedChange={(checked) => {
                                setNotificationGroups((current) => {
                                  if (checked) {
                                    if (option.value === "all") return ["all"];
                                    return [
                                      ...current.filter((value) => value !== "all"),
                                      option.value,
                                    ];
                                  }
                                  return current.filter((value) => value !== option.value);
                                });
                              }}
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </fieldset>
                <div className="space-y-2">
                  <label htmlFor="event-description" className="text-sm font-medium">Details and instructions</label>
                  <Textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Location, preparation, participants or other useful details." rows={3} maxLength={4000} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor="event-location" className="text-sm font-medium">Event location</label>
                    <Input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Venue or online meeting details" maxLength={300} />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="event-requirements" className="text-sm font-medium">Attendee requirements</label>
                    <Textarea id="event-requirements" value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="Items, preparation or eligibility required from attendees." rows={3} maxLength={4000} />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={saving || !title.trim()}>{saving ? "Saving..." : "Save event"}</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                </div>
              </form>
            )}

            {loading ? (
              <p className="py-12 text-center text-sm text-muted-foreground">Loading company schedule...</p>
            ) : dayEvents.length === 0 ? (
              <div className="mt-5 rounded-xl border border-dashed px-5 py-10 text-center">
                <PartyPopper className="mx-auto mb-3 h-8 w-8 text-violet-500" />
                <h3 className="font-semibold">Your day is clear</h3>
                <p className="mt-2 text-sm text-muted-foreground">No company events scheduled for this date.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {dayEvents.map((event) => (
                  <article key={event.id} className={`rounded-xl border p-4 ${eventStyles[event.event_type] ?? eventStyles["other"]}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="font-semibold">{event.title}</h3>
                      <span className="rounded-full border border-current/20 px-2.5 py-1 text-xs capitalize">{event.event_type}</span>
                    </div>
                    <p className="mt-2 text-xs opacity-80">
                      Notifications:{" "}
                      {event.notification_groups
                        .map(
                          (group) =>
                            audienceOptions.find((option) => option.value === group)?.label ??
                            group,
                        )
                        .join(", ")}
                    </p>
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <Clock color="#D97706" strokeWidth={2.2} className="h-4 w-4 shrink-0 shrink-0" />
                      {format(new Date(event.starts_at), "HH:mm")}
                      {event.ends_at ? ` - ${format(new Date(event.ends_at), "HH:mm")}` : ""}
                    </p>
                    {event.description && <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{event.description}</p>}
                    {event.location && <p className="mt-2 text-sm"><strong>Location:</strong> {event.location}</p>}
                    {event.requirements && <p className="mt-2 whitespace-pre-wrap text-sm leading-6"><strong>Requirements:</strong> {event.requirements}</p>}
                  </article>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-muted/20 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Flag className="h-4 w-4" aria-hidden="true" />
              Public holiday feed
            </p>
            <p className="mt-1 text-muted-foreground">
              {holidayLoading ? "Loading holidays for this year and next year..." :
                holidayMessage || `Loaded ${holidays.length} public holidays from the Nager.Date public-holiday service.`}
            </p>
          </div>
        </div>
      </section>
      <GlobalHolidaysPage />
      <p className="text-xs text-muted-foreground">Company events are stored in Supabase. Public holidays are fetched from an external service and require an internet connection. Calendar display uses Kampala time.</p>
    </main>
  );
}
