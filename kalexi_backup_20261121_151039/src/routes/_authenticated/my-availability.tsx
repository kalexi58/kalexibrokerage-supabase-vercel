import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  Clock3,
  Plus,
  RefreshCw,
  Trash2,
  CalendarOff,
  BriefcaseBusiness,
  AlertCircle,
  CheckCircle2,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BackButton } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/my-availability")({
  component: MyAvailabilityPage,
});

type AvailabilityRule = {
  id: string;
  officer_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
  is_active: boolean;
};

type AvailabilityException = {
  id: string;
  officer_id: string;
  exception_type: "available" | "unavailable";
  starts_at: string;
  ends_at: string;
  reason: string | null;
};

type ScheduleItem = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  kind: "appointment" | "programme";
  description?: string | null;
  location?: string | null;
  customer_name?: string | null;
};

const db = supabase as any;

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function localDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-UG", {
    timeZone: "Africa/Kampala",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function todayInput() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  return new Date(value).toISOString();
}

function MyAvailabilityPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [officerId, setOfficerId] = useState("");
  const [officerName, setOfficerName] = useState("");
  const [rules, setRules] = useState<AvailabilityRule[]>([]);
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([]);
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [ruleDay, setRuleDay] = useState("1");
  const [ruleStart, setRuleStart] = useState("09:00");
  const [ruleEnd, setRuleEnd] = useState("17:00");
  const [slotDuration, setSlotDuration] = useState("30");

  const [exceptionType, setExceptionType] = useState<"unavailable" | "available">("unavailable");
  const [exceptionStart, setExceptionStart] = useState(todayInput());
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionReason, setExceptionReason] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const { data: authData, error: authError } = await db.auth.getUser();

      if (authError) throw authError;
      const user = authData?.user;

      if (!user) {
        throw new Error("Your session has expired. Sign in again.");
      }

      const { data: activeStaff, error: staffError } = await db.rpc(
        "is_active_staff",
        { _user_id: user.id }
      );

      if (staffError) throw staffError;

      if (!activeStaff) {
        throw new Error("This page is only available to active staff members.");
      }

      setOfficerId(user.id);

      const { data: profile, error: profileError } = await db
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      setOfficerName(profile?.full_name || "Officer");

      const now = new Date();
      const future = new Date();
      future.setDate(future.getDate() + 90);

      const [rulesResult, exceptionsResult, appointmentsResult, programmesResult] =
        await Promise.all([
          db
            .from("officer_availability_rules")
            .select("*")
            .eq("officer_id", user.id)
            .order("day_of_week")
            .order("start_time"),

          db
            .from("officer_availability_exceptions")
            .select("*")
            .eq("officer_id", user.id)
            .gte("ends_at", now.toISOString())
            .order("starts_at"),

          db
            .from("officer_appointments")
            .select("id,title,starts_at,ends_at,status,description,location,customer_name")
            .eq("officer_id", user.id)
            .gte("ends_at", now.toISOString())
            .lte("starts_at", future.toISOString())
            .order("starts_at"),

          db
            .from("officer_programmes")
            .select("id,title,starts_at,ends_at,status,details,location")
            .eq("officer_id", user.id)
            .gte("ends_at", now.toISOString())
            .lte("starts_at", future.toISOString())
            .order("starts_at"),
        ]);

      if (rulesResult.error) throw rulesResult.error;
      if (exceptionsResult.error) throw exceptionsResult.error;
      if (appointmentsResult.error) throw appointmentsResult.error;
      if (programmesResult.error) throw programmesResult.error;

      const appointments: ScheduleItem[] = (appointmentsResult.data || []).map(
        (item: any) => ({
          ...item,
          kind: "appointment",
        })
      );

      const programmes: ScheduleItem[] = (programmesResult.data || []).map(
        (item: any) => ({
          ...item,
          description: item.details,
          kind: "programme",
        })
      );

      setRules(rulesResult.data || []);
      setExceptions(exceptionsResult.data || []);
      setSchedule(
        [...appointments, ...programmes].sort(
          (a, b) =>
            new Date(a.starts_at).getTime() -
            new Date(b.starts_at).getTime()
        )
      );
    } catch (err: any) {
      setError(err?.message || "Could not load your scheduling information.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function addRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!officerId) return;

    if (ruleEnd <= ruleStart) {
      setError("The closing time must be later than the opening time.");
      return;
    }

    const duration = Number(slotDuration);

    if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
      setError("Slot duration must be between 5 and 480 minutes.");
      return;
    }

    setSaving(true);

    try {
      const { error: insertError } = await db
        .from("officer_availability_rules")
        .insert({
          officer_id: officerId,
          day_of_week: Number(ruleDay),
          start_time: ruleStart,
          end_time: ruleEnd,
          slot_duration_minutes: duration,
          is_active: true,
        });

      if (insertError) throw insertError;

      setMessage("Working hours added.");
      await loadData();
    } catch (err: any) {
      setError(
        err?.code === "23505"
          ? "These working hours already exist for that day."
          : err?.message || "Could not save working hours."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(id: string) {
    if (!window.confirm("Remove these working hours?")) return;

    setError("");
    setMessage("");

    const { error: deleteError } = await db
      .from("officer_availability_rules")
      .delete()
      .eq("id", id)
      .eq("officer_id", officerId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Working hours removed.");
    await loadData();
  }

  async function toggleRule(rule: AvailabilityRule) {
    setError("");
    setMessage("");

    const { error: updateError } = await db
      .from("officer_availability_rules")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id)
      .eq("officer_id", officerId);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(rule.is_active ? "Working hours paused." : "Working hours activated.");
    await loadData();
  }

  async function addException(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!officerId) return;

    if (!exceptionStart || !exceptionEnd) {
      setError("Enter both the start and end date and time.");
      return;
    }

    if (new Date(exceptionEnd) <= new Date(exceptionStart)) {
      setError("The end time must be later than the start time.");
      return;
    }

    setSaving(true);

    try {
      const { error: insertError } = await db
        .from("officer_availability_exceptions")
        .insert({
          officer_id: officerId,
          exception_type: exceptionType,
          starts_at: toIso(exceptionStart),
          ends_at: toIso(exceptionEnd),
          reason: exceptionReason.trim() || null,
        });

      if (insertError) throw insertError;

      setMessage(
        exceptionType === "unavailable"
          ? "Unavailable period added."
          : "Additional availability added."
      );

      setExceptionReason("");
      setExceptionEnd("");
      setExceptionStart(todayInput());
      await loadData();
    } catch (err: any) {
      setError(err?.message || "Could not save this availability exception.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteException(id: string) {
    if (!window.confirm("Remove this availability exception?")) return;

    const { error: deleteError } = await db
      .from("officer_availability_exceptions")
      .delete()
      .eq("id", id)
      .eq("officer_id", officerId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Availability exception removed.");
    await loadData();
  }

  const activeRules = rules.filter((rule) => rule.is_active).length;
  const upcomingAppointments = schedule.filter(
    (item) => item.kind === "appointment" && item.status !== "cancelled"
  ).length;
  const upcomingProgrammes = schedule.filter(
    (item) => item.kind === "programme" && item.status !== "cancelled"
  ).length;

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading your schedule...</span>
      </div>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6">
      <div className="mb-2">
        <BackButton />
      </div>
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays color="#7C3AED" strokeWidth={2.2} className="h-4 w-4 shrink-0" />
            Officer workspace
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            My Availability & Schedule
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your working hours, unavailable periods and upcoming commitments.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {message && (
        <div role="status" className="flex gap-2 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800">
          <CheckCircle2 color="#16A34A" strokeWidth={2.2} className="h-5 w-5 shrink-0 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<UserRound className="h-5 w-5" />}
          label="Officer"
          value={officerName}
        />
        <SummaryCard
          icon={<Clock3 className="h-5 w-5" />}
          label="Active working periods"
          value={String(activeRules)}
        />
        <SummaryCard
          icon={<CalendarDays color="#7C3AED" strokeWidth={2.2} className="h-5 w-5 shrink-0" />}
          label="Upcoming appointments"
          value={String(upcomingAppointments)}
        />
        <SummaryCard
          icon={<BriefcaseBusiness className="h-5 w-5" />}
          label="Upcoming programmes"
          value={String(upcomingProgrammes)}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Weekly working hours</h2>
            <p className="text-sm text-muted-foreground">
              Add each period during which customers may request appointments.
            </p>
          </div>

          <form onSubmit={addRule} className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Day
              <select
                value={ruleDay}
                onChange={(event) => setRuleDay(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              >
                {DAYS.map((day, index) => (
                  <option value={index} key={day}>{day}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Appointment slot duration
              <select
                value={slotDuration}
                onChange={(event) => setSlotDuration(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              >
                {[15, 20, 30, 45, 60, 90, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes} minutes</option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Start time
              <input
                type="time"
                required
                value={ruleStart}
                onChange={(event) => setRuleStart(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              />
            </label>

            <label className="grid gap-1 text-sm">
              End time
              <input
                type="time"
                required
                value={ruleEnd}
                onChange={(event) => setRuleEnd(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:col-span-2"
            >
              <Plus color="#16A34A" strokeWidth={2.2} className="h-4 w-4 shrink-0" />
              Add working hours
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {rules.length === 0 ? (
              <EmptyState text="You have not added any weekly working hours." />
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <div className="font-medium">{DAYS[rule.day_of_week]}</div>
                    <div className="text-sm text-muted-foreground">
                      {rule.start_time.slice(0, 5)} - {rule.end_time.slice(0, 5)}
                      {" · "}
                      {rule.slot_duration_minutes} minute slots
                    </div>
                    <span className={`mt-1 inline-block text-xs ${rule.is_active ? "text-green-700" : "text-muted-foreground"}`}>
                      {rule.is_active ? "Active" : "Paused"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleRule(rule)}
                      className="rounded-md border px-3 py-2 text-xs font-medium hover:bg-muted"
                    >
                      {rule.is_active ? "Pause" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteRule(rule.id)}
                      aria-label="Delete working hours"
                      className="rounded-md border p-2 text-red-600 hover:bg-red-50"
                    >
                      <Trash2 color="#DC2626" strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Availability exceptions</h2>
            <p className="text-sm text-muted-foreground">
              Record leave, breaks, temporary closures or additional availability.
            </p>
          </div>

          <form onSubmit={addException} className="space-y-3">
            <label className="grid gap-1 text-sm">
              Exception type
              <select
                value={exceptionType}
                onChange={(event) => setExceptionType(event.target.value as "unavailable" | "available")}
                className="h-10 rounded-md border bg-background px-3"
              >
                <option value="unavailable">Unavailable / Leave</option>
                <option value="available">Additional availability</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm">
              Start date and time
              <input
                type="datetime-local"
                required
                value={exceptionStart}
                onChange={(event) => setExceptionStart(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              />
            </label>

            <label className="grid gap-1 text-sm">
              End date and time
              <input
                type="datetime-local"
                required
                min={exceptionStart}
                value={exceptionEnd}
                onChange={(event) => setExceptionEnd(event.target.value)}
                className="h-10 rounded-md border bg-background px-3"
              />
            </label>

            <label className="grid gap-1 text-sm">
              Reason or notes
              <textarea
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Optional notes"
                className="rounded-md border bg-background px-3 py-2"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Plus color="#16A34A" strokeWidth={2.2} className="h-4 w-4 shrink-0" />
              Add availability exception
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {exceptions.length === 0 ? (
              <EmptyState text="No upcoming availability exceptions." />
            ) : (
              exceptions.map((item) => (
                <div key={item.id} className="flex justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <CalendarOff className="h-4 w-4 shrink-0" />
                      {item.exception_type === "unavailable" ? "Unavailable" : "Additional availability"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {localDateTime(item.starts_at)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Until {localDateTime(item.ends_at)}
                    </div>
                    {item.reason && (
                      <p className="mt-2 break-words text-sm">{item.reason}</p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void deleteException(item.id)}
                    aria-label="Delete availability exception"
                    className="h-fit rounded-md border p-2 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 color="#DC2626" strokeWidth={2.2} className="h-4 w-4 shrink-0" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">My upcoming schedule</h2>
            <p className="text-sm text-muted-foreground">
              Appointments and programmes assigned to you over the next 90 days.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Africa/Kampala</span>
        </div>

        {schedule.length === 0 ? (
          <EmptyState text="No upcoming appointments or programmes were found." />
        ) : (
          <div className="space-y-3">
            {schedule.map((item) => (
              <article key={`${item.kind}-${item.id}`} className="rounded-lg border p-4">
                <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        item.kind === "appointment"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-purple-100 text-purple-800"
                      }`}>
                        {item.kind === "appointment" ? "Appointment" : "Programme"}
                      </span>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs">
                        {item.status}
                      </span>
                    </div>
                    <h3 className="font-semibold">{item.title || "Untitled"}</h3>
                    {item.customer_name && (
                      <p className="text-sm text-muted-foreground">
                        Customer: {item.customer_name}
                      </p>
                    )}
                    {item.location && (
                      <p className="text-sm text-muted-foreground">
                        Location: {item.location}
                      </p>
                    )}
                    {item.description && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-sm sm:text-right">
                    <div className="font-medium">{localDateTime(item.starts_at)}</div>
                    <div className="text-muted-foreground">
                      Until {localDateTime(item.ends_at)}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <div className="break-words text-xl font-semibold">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
