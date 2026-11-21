import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Clock3, CalendarDays, Building2, Save } from "lucide-react";

const db = supabase as any;

export default function OfficerScheduleControls() {
  const [userId, setUserId] = useState("");
  const [lunchDay, setLunchDay] = useState("1");
  const [lunchStart, setLunchStart] = useState("13:00");
  const [lunchEnd, setLunchEnd] = useState("14:00");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [presence, setPresence] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const days = [
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday"
  ];

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setLoading(false);
        return;
      }

      const id = auth.user.id;
      setUserId(id);

      const [lunch, status] = await Promise.all([
        db.from("officer_lunch_breaks")
          .select("*")
          .eq("officer_id", id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
        db.from("officer_presence")
          .select("is_in_office")
          .eq("officer_id", id)
          .maybeSingle()
      ]);

      if (lunch.data) {
        setLunchDay(String(lunch.data.day_of_week));
        setLunchStart(lunch.data.start_time.slice(0, 5));
        setLunchEnd(lunch.data.end_time.slice(0, 5));
      }

      if (status.data) setPresence(status.data.is_in_office);
      setLoading(false);
    }
    void load();
  }, []);

  async function saveLunch() {
    setSaving(true);
    setMessage("");

    const { error } = await db.from("officer_lunch_breaks").upsert({
      officer_id: userId,
      day_of_week: Number(lunchDay),
      start_time: lunchStart,
      end_time: lunchEnd,
      is_active: true
    }, { onConflict: "officer_id,day_of_week" });

    setMessage(error ? error.message : "Lunch break saved.");
    setSaving(false);
  }

  async function applyLeave() {
    if (!leaveStart || !leaveEnd || leaveEnd < leaveStart) {
      setMessage("Enter valid leave dates.");
      return;
    }

    setSaving(true);
    setMessage("");

    const { error } = await db.from("officer_availability_exceptions").insert({
      officer_id: userId,
      exception_type: "unavailable",
      starts_at: new Date(`${leaveStart}T00:00:00+03:00`).toISOString(),
      ends_at: new Date(`${leaveEnd}T23:59:59+03:00`).toISOString(),
      reason: leaveReason.trim() || "Officer leave",
      created_by: userId
    });

    setMessage(error ? error.message : "Leave recorded. These dates are blocked from booking.");
    setSaving(false);
  }

  async function togglePresence() {
    const next = !presence;
    setSaving(true);
    setMessage("");

    const { error } = await db.from("officer_presence").upsert({
      officer_id: userId,
      is_in_office: next,
      updated_by: userId,
      updated_at: new Date().toISOString()
    }, { onConflict: "officer_id" });

    if (!error) setPresence(next);
    setMessage(error ? error.message : `You are now marked ${next ? "IN OFFICE" : "OUT OF OFFICE"}.`);
    setSaving(false);
  }

  if (loading) return <div className="rounded-xl border p-5">Loading schedule settings...</div>;
  if (!userId) return null;

  return (
    <section className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold">My Schedule Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage your working availability, lunch breaks, leave and office presence.
        </p>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Building2 className="h-5 w-5" /> Office presence
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className={presence ? "font-semibold text-green-600" : "font-semibold text-muted-foreground"}>
            {presence ? "IN OFFICE" : "OUT OF OFFICE"}
          </span>
          <button type="button" disabled={saving} onClick={() => void togglePresence()}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${presence ? "bg-red-600" : "bg-green-600"}`}>
            {presence ? "Mark Out of Office" : "Mark In Office"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Clock3 className="h-5 w-5" /> Recurring lunch break
        </h3>
        <p className="text-sm text-muted-foreground">
          Choose a weekly lunch period. Appointment slots overlapping this period will not be offered.
        </p>
        <label className="block text-sm">Day
          <select value={lunchDay} onChange={e => setLunchDay(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border bg-background px-3">
            {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">Lunch starts
            <input type="time" value={lunchStart} onChange={e => setLunchStart(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3"/>
          </label>
          <label className="text-sm">Lunch ends
            <input type="time" value={lunchEnd} onChange={e => setLunchEnd(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3"/>
          </label>
        </div>
        <button disabled={saving || lunchEnd <= lunchStart} onClick={() => void saveLunch()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <Save className="h-4 w-4"/> Save lunch break
        </button>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarDays className="h-5 w-5"/> Apply for leave
        </h3>
        <p className="text-sm text-muted-foreground">
          Leave will mark you unavailable for the selected period.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">First day
            <input type="date" value={leaveStart} onChange={e => setLeaveStart(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3"/>
          </label>
          <label className="text-sm">Last day
            <input type="date" value={leaveEnd} min={leaveStart} onChange={e => setLeaveEnd(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border bg-background px-3"/>
          </label>
        </div>
        <label className="block text-sm">Reason
          <textarea value={leaveReason} onChange={e => setLeaveReason(e.target.value)}
            placeholder="Reason for leave (optional)"
            className="mt-1 w-full rounded-lg border bg-background p-3"/>
        </label>
        <button disabled={saving || !leaveStart || !leaveEnd} onClick={() => void applyLeave()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          Submit leave
        </button>
      </div>

      {message && <div role="status" className="rounded-lg border bg-muted p-3 text-sm">{message}</div>}
    </section>
  );
}
