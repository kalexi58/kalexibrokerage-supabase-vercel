$ErrorActionPreference = 'Stop'

Write-Host 'KALEXI RECEPTION SCHEDULING INSTALLER' -ForegroundColor Cyan
if (!(Test-Path '.\package.json')) { throw 'Run this script from the Kalexi Brokerage project root (the folder containing package.json).' }
if (!(Test-Path '.\src\lib\rbac.ts')) { throw 'Expected src\lib\rbac.ts was not found. No changes made.' }
if (!(Test-Path '.\src\integrations\supabase\client.ts')) { throw 'Supabase client was not found. No changes made.' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = ".\kalexi-reception-scheduling-backup-$stamp"
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item '.\src\lib\rbac.ts' "$backup\rbac.ts"
if (Test-Path '.\src\components\AppShell.tsx') { Copy-Item '.\src\components\AppShell.tsx' "$backup\AppShell.tsx" }
if (!(Test-Path '.\supabase\migrations')) { New-Item -ItemType Directory -Path '.\supabase\migrations' -Force | Out-Null }
if (!(Test-Path '.\src\routes\_authenticated')) { throw 'Authenticated routes folder was not found. No changes made.' }

$migrationPath = '.\supabase\migrations\20261107170000_reception_officer_scheduling.sql'
if (Test-Path $migrationPath) { throw "Migration already exists: $migrationPath. No files overwritten." }

$sql = @'
-- Kalexi Reception: officer programmes and appointment scheduling.
-- Overlap prevention is enforced in PostgreSQL, not only in the browser.
CREATE TABLE IF NOT EXISTS public.officer_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 180),
  programme_type text NOT NULL DEFAULT 'programme',
  details text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT officer_programmes_valid_time CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS public.officer_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_ref text NOT NULL UNIQUE DEFAULT ('KAL-APT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  officer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  customer_name text NOT NULL CHECK (char_length(trim(customer_name)) BETWEEN 2 AND 160),
  customer_phone text NOT NULL,
  customer_email text,
  request_type text NOT NULL DEFAULT 'appointment' CHECK (request_type IN ('booking','meeting','appointment','consultation','website')),
  title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 180),
  description text,
  meeting_method text NOT NULL DEFAULT 'in_person' CHECK (meeting_method IN ('in_person','telephone','online')),
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled','rejected','missed')),
  source text NOT NULL DEFAULT 'internal' CHECK (source IN ('internal','website')),
  external_record_id text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT officer_appointments_valid_time CHECK (ends_at > starts_at),
  CONSTRAINT officer_appointments_external_unique UNIQUE (source, external_record_id)
);

CREATE INDEX IF NOT EXISTS officer_programmes_officer_time_idx ON public.officer_programmes (officer_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS officer_appointments_officer_time_idx ON public.officer_appointments (officer_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS officer_appointments_status_time_idx ON public.officer_appointments (status, starts_at);

CREATE OR REPLACE FUNCTION public.prevent_officer_schedule_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_found boolean := false;
BEGIN
  -- Serialize concurrent schedule writes for the same officer.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.officer_id::text, 0));

  IF TG_TABLE_NAME = 'officer_appointments' THEN
    IF NEW.status IN ('pending','confirmed') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.officer_appointments a
        WHERE a.officer_id = NEW.officer_id
          AND a.id <> NEW.id
          AND a.status IN ('pending','confirmed')
          AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) OR EXISTS (
        SELECT 1 FROM public.officer_programmes p
        WHERE p.officer_id = NEW.officer_id
          AND p.status = 'scheduled'
          AND tstzrange(p.starts_at, p.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) INTO conflict_found;
    END IF;
  ELSE
    IF NEW.status = 'scheduled' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.officer_programmes p
        WHERE p.officer_id = NEW.officer_id
          AND p.id <> NEW.id
          AND p.status = 'scheduled'
          AND tstzrange(p.starts_at, p.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) OR EXISTS (
        SELECT 1 FROM public.officer_appointments a
        WHERE a.officer_id = NEW.officer_id
          AND a.status IN ('pending','confirmed')
          AND tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(NEW.starts_at, NEW.ends_at, '[)')
      ) INTO conflict_found;
    END IF;
  END IF;

  IF conflict_found THEN
    RAISE EXCEPTION 'OFFICER_TIME_CONFLICT: This officer already has a booking or programme during the selected time.'
      USING ERRCODE = '23P01';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS officer_appointments_prevent_overlap ON public.officer_appointments;
CREATE TRIGGER officer_appointments_prevent_overlap
BEFORE INSERT OR UPDATE OF officer_id, starts_at, ends_at, status
ON public.officer_appointments
FOR EACH ROW EXECUTE FUNCTION public.prevent_officer_schedule_overlap();

DROP TRIGGER IF EXISTS officer_programmes_prevent_overlap ON public.officer_programmes;
CREATE TRIGGER officer_programmes_prevent_overlap
BEFORE INSERT OR UPDATE OF officer_id, starts_at, ends_at, status
ON public.officer_programmes
FOR EACH ROW EXECUTE FUNCTION public.prevent_officer_schedule_overlap();

ALTER TABLE public.officer_programmes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS officer_programmes_staff_read ON public.officer_programmes;
CREATE POLICY officer_programmes_staff_read ON public.officer_programmes
FOR SELECT TO authenticated
USING (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS officer_programmes_reception_insert ON public.officer_programmes;
CREATE POLICY officer_programmes_reception_insert ON public.officer_programmes
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
    public.has_role(auth.uid(), 'management'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS officer_programmes_reception_update ON public.officer_programmes;
CREATE POLICY officer_programmes_reception_update ON public.officer_programmes
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS officer_appointments_staff_read ON public.officer_appointments;
CREATE POLICY officer_appointments_staff_read ON public.officer_appointments
FOR SELECT TO authenticated
USING (
  officer_id = auth.uid() OR
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

DROP POLICY IF EXISTS officer_appointments_reception_insert ON public.officer_appointments;
CREATE POLICY officer_appointments_reception_insert ON public.officer_appointments
FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
    public.has_role(auth.uid(), 'management'::public.app_role) OR
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
  )
);

DROP POLICY IF EXISTS officer_appointments_reception_update ON public.officer_appointments;
CREATE POLICY officer_appointments_reception_update ON public.officer_appointments
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'receptionist'::public.app_role) OR
  public.has_role(auth.uid(), 'management'::public.app_role) OR
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

GRANT SELECT, INSERT, UPDATE ON public.officer_programmes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.officer_appointments TO authenticated;
GRANT ALL ON public.officer_programmes, public.officer_appointments TO service_role;
'@
Set-Content -Path $migrationPath -Value $sql -Encoding UTF8

$routePath = '.\src\routes\_authenticated\reception.scheduling.tsx'
if (Test-Path $routePath) { throw "Route already exists: $routePath. No files overwritten." }
$route = @'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { CalendarDays, Clock3, Plus, RefreshCw, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/reception/scheduling")({
  beforeLoad: async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw redirect({ to: "/" });
    const { data: roleRows, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id);
    if (error) throw new Error("Could not verify Reception scheduling permissions.");
    const allowed = (roleRows ?? []).some((row) =>
      ["receptionist", "management", "super_admin"].includes(row.role)
    );
    if (!allowed) throw redirect({ to: "/dashboard" });
  },
  component: ReceptionSchedulingPage,
});

type Officer = { id: string; full_name: string; department: string | null; job_title: string | null };
type ScheduleRow = {
  id: string; officer_id: string; title: string; starts_at: string; ends_at: string;
  status: string; location: string | null; details?: string | null; description?: string | null;
  customer_name?: string; customer_phone?: string; appointment_ref?: string;
  request_type?: string; kind: "programme" | "appointment";
};
// The new tables are introduced by the migration installed alongside this route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function localDateTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function ReceptionSchedulingPage() {
  const [officers, setOfficers] = useState<Officer[]>([]);
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [formType, setFormType] = useState<"appointment" | "programme">("appointment");
  const [showForm, setShowForm] = useState(false);
  const [officerId, setOfficerId] = useState("");
  const [title, setTitle] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [requestType, setRequestType] = useState("appointment");
  const [meetingMethod, setMeetingMethod] = useState("in_person");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [startsAt, setStartsAt] = useState(() => localDateTime(new Date(Date.now() + 3600000)));
  const [endsAt, setEndsAt] = useState(() => localDateTime(new Date(Date.now() + 7200000)));
  const [filterOfficer, setFilterOfficer] = useState("all");
  const [filterType, setFilterType] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const [staffResult, programmeResult, appointmentResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,department,job_title").eq("status", "active").order("full_name"),
      db.from("officer_programmes").select("id,officer_id,title,starts_at,ends_at,status,location,details").gte("ends_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("starts_at", { ascending: true }).limit(500),
      db.from("officer_appointments").select("id,officer_id,title,starts_at,ends_at,status,location,customer_name,customer_phone,appointment_ref,request_type,description").gte("ends_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("starts_at", { ascending: true }).limit(500),
    ]);
    if (staffResult.error || programmeResult.error || appointmentResult.error) {
      setError([staffResult.error?.message, programmeResult.error?.message, appointmentResult.error?.message].filter(Boolean).join(" | "));
    } else {
      setOfficers((staffResult.data ?? []) as Officer[]);
      const programmes = ((programmeResult.data ?? []) as Omit<ScheduleRow, "kind">[]).map((r) => ({ ...r, kind: "programme" as const }));
      const appointments = ((appointmentResult.data ?? []) as Omit<ScheduleRow, "kind">[]).map((r) => ({ ...r, kind: "appointment" as const }));
      setRows([...programmes, ...appointments].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visibleRows = useMemo(() => rows.filter((r) =>
    (filterOfficer === "all" || r.officer_id === filterOfficer) &&
    (filterType === "all" || r.kind === filterType)
  ), [rows, filterOfficer, filterType]);

  const officerName = (id: string) => officers.find((o) => o.id === id)?.full_name ?? "Unknown officer";
  const formatTime = (value: string) => new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala", dateStyle: "medium", timeStyle: "short"
  }).format(new Date(value));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    if (!officerId) { setError("Select the officer responsible for this time."); setSaving(false); return; }
    const start = new Date(startsAt); const end = new Date(endsAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError("The end date and time must be later than the start date and time."); setSaving(false); return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { setError("Your session could not be verified. Sign in again."); setSaving(false); return; }

    const common = { officer_id: officerId, title: title.trim(), starts_at: start.toISOString(), ends_at: end.toISOString(), location: location.trim() || null, created_by: authData.user.id };
    const result = formType === "programme"
      ? await db.from("officer_programmes").insert({ ...common, programme_type: "programme", details: details.trim() || null, status: "scheduled" })
      : await db.from("officer_appointments").insert({ ...common, customer_name: customerName.trim(), customer_phone: customerPhone.trim(), customer_email: customerEmail.trim() || null, request_type: requestType, meeting_method: meetingMethod, description: details.trim() || null, status: "pending", source: "internal" });

    if (result.error) {
      setError(result.error.message.includes("OFFICER_TIME_CONFLICT") || result.error.code === "23P01"
        ? "DOUBLE BOOKING BLOCKED: This officer already has an appointment or programme during that time. Choose another time or officer."
        : `Could not save the record: ${result.error.message}`);
    } else {
      setNotice(formType === "programme" ? "Officer programme added to the schedule." : "Appointment request saved as pending.");
      setShowForm(false); setTitle(""); setCustomerName(""); setCustomerPhone(""); setCustomerEmail(""); setDetails(""); setLocation("");
      await load();
    }
    setSaving(false);
  }

  async function updateAppointmentStatus(row: ScheduleRow, status: string) {
    setError(""); setNotice("");
    const result = await db.from("officer_appointments").update({ status }).eq("id", row.id);
    if (result.error) setError(result.error.message.includes("OFFICER_TIME_CONFLICT") ? "That time is no longer available." : result.error.message);
    else { setNotice(`Appointment marked ${status}.`); await load(); }
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-7">
      <section className="rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-violet-50 p-6 dark:from-slate-950 dark:via-background dark:to-violet-950">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Kalexi Brokerage · Reception</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">Officer Scheduling & Appointments</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Manage officer programmes, customer appointments, meetings and bookings. The database blocks overlapping times for the same officer.</p>
          </div>
          <button onClick={() => { setShowForm((v) => !v); setError(""); }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"><Plus className="h-4 w-4" /> Add schedule item</button>
        </div>
      </section>

      {error && <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">{error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">{notice}</div>}

      {showForm && <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Create schedule record</h2><div className="flex gap-2"><button type="button" onClick={() => setFormType("appointment")} className={`rounded-lg border px-3 py-2 text-sm ${formType === "appointment" ? "bg-primary text-primary-foreground" : "bg-background"}`}>Appointment / Meeting</button><button type="button" onClick={() => setFormType("programme")} className={`rounded-lg border px-3 py-2 text-sm ${formType === "programme" ? "bg-primary text-primary-foreground" : "bg-background"}`}>Officer Programme</button></div></div>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">Responsible officer<select required value={officerId} onChange={(e) => setOfficerId(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"><option value="">Select officer</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}{o.job_title ? ` · ${o.job_title}` : ""}{o.department ? ` · ${o.department}` : ""}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">{formType === "programme" ? "Programme title" : "Appointment / meeting title"}<input required minLength={2} maxLength={180} value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal" placeholder={formType === "programme" ? "e.g. Field inspection programme" : "e.g. Gold testing consultation"}/></label>
          {formType === "appointment" && <>
            <label className="grid gap-1.5 text-sm font-medium">Customer full name<input required value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"/></label>
            <label className="grid gap-1.5 text-sm font-medium">Customer telephone<input required value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"/></label>
            <label className="grid gap-1.5 text-sm font-medium">Customer email (optional)<input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"/></label>
            <label className="grid gap-1.5 text-sm font-medium">Request category<select value={requestType} onChange={(e) => setRequestType(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"><option value="appointment">Appointment</option><option value="meeting">Meeting</option><option value="booking">Service booking</option><option value="consultation">Consultation</option></select></label>
            <label className="grid gap-1.5 text-sm font-medium">Meeting method<select value={meetingMethod} onChange={(e) => setMeetingMethod(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"><option value="in_person">In person</option><option value="online">Online</option><option value="telephone">Telephone</option></select></label>
          </>}
          <label className="grid gap-1.5 text-sm font-medium">Start date and time<input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"/></label>
          <label className="grid gap-1.5 text-sm font-medium">End date and time<input required type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal"/></label>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">Location / online meeting details<input value={location} onChange={(e) => setLocation(e.target.value)} className="h-10 rounded-md border bg-background px-3 font-normal" placeholder="Office, address or meeting link"/></label>
          <label className="grid gap-1.5 text-sm font-medium md:col-span-2">{formType === "programme" ? "Programme details" : "Purpose / additional notes"}<textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} className="rounded-md border bg-background px-3 py-2 font-normal"/></label>
          <div className="flex flex-wrap gap-2 md:col-span-2"><button disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? "Saving..." : "Save schedule"}</button><button type="button" onClick={() => setShowForm(false)} className="rounded-lg border px-5 py-2.5 text-sm">Cancel</button></div>
        </form>
        <p className="mt-4 text-xs text-muted-foreground">Pending and confirmed appointments, plus scheduled programmes, reserve the officer's time. Cancelled or rejected appointments do not block availability.</p>
      </section>}

      <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Active officers</p><p className="mt-1 text-2xl font-bold">{officers.length}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Appointments / meetings</p><p className="mt-1 text-2xl font-bold">{rows.filter((r) => r.kind === "appointment" && ["pending","confirmed"].includes(r.status)).length}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Scheduled programmes</p><p className="mt-1 text-2xl font-bold">{rows.filter((r) => r.kind === "programme" && r.status === "scheduled").length}</p></div></section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Officer schedule</h2><p className="text-xs text-muted-foreground">Times displayed in Kampala time (Africa/Kampala).</p></div><div className="flex flex-wrap gap-2"><select value={filterOfficer} onChange={(e) => setFilterOfficer(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="all">All officers</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</select><select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="all">All records</option><option value="appointment">Appointments</option><option value="programme">Programmes</option></select><button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><RefreshCw className="h-3.5 w-3.5"/> Refresh</button></div></div>
        {loading ? <div className="p-8 text-center text-sm text-muted-foreground">Loading officer schedules...</div> : visibleRows.length === 0 ? <div className="p-10 text-center"><CalendarDays className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-2 font-medium">No schedule records found</p><p className="mt-1 text-sm text-muted-foreground">Add an appointment or officer programme to begin.</p></div> : <div className="divide-y">{visibleRows.map((r) => <article key={`${r.kind}-${r.id}`} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${r.kind === "appointment" ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"}`}>{r.kind === "appointment" ? r.request_type ?? "appointment" : "officer programme"}</span><span className="text-xs text-muted-foreground">{r.status}</span>{r.appointment_ref && <span className="font-mono text-xs text-muted-foreground">{r.appointment_ref}</span>}</div><h3 className="mt-2 truncate font-semibold">{r.title}</h3><p className="mt-1 text-sm text-muted-foreground"><UserRound className="mr-1 inline h-3.5 w-3.5"/>{officerName(r.officer_id)} · <Clock3 className="mx-1 inline h-3.5 w-3.5"/>{formatTime(r.starts_at)} – {formatTime(r.ends_at)}</p>{r.customer_name && <p className="mt-1 text-sm">Customer: {r.customer_name} · {r.customer_phone}</p>}{r.location && <p className="mt-1 text-sm text-muted-foreground">Location: {r.location}</p>}</div>{r.kind === "appointment" && <div className="flex flex-wrap gap-2">{r.status === "pending" && <button onClick={() => void updateAppointmentStatus(r, "confirmed")} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">Confirm</button>}{["pending","confirmed"].includes(r.status) && <button onClick={() => void updateAppointmentStatus(r, "cancelled")} className="rounded-md border px-3 py-2 text-xs">Cancel</button>}</div>}</article>)}</div>}
      </section>
      <p className="text-xs text-muted-foreground">Website-imported bookings can be added to this same schedule after the website API is connected. Original website record IDs will be retained in the integration layer; this page currently creates internal records.</p>
    </main>
  );
}
'@
Set-Content -Path $routePath -Value $route -Encoding UTF8

$rbacPath = '.\src\lib\rbac.ts'
$rbac = Get-Content $rbacPath -Raw
if (!$rbac.Contains('"/reception/scheduling"')) {
  $pattern = '(?m)^  \{\r?\n    label: "Overview",'
  $replacement = "  {`r`n    label: `"Reception`",`r`n    items: [{ to: `"/reception/scheduling`", label: `"Appointments & Officer Schedule`", permission: `"clients.view`" }],`r`n  },`r`n  {`r`n    label: `"Overview`"," 
  $updated = [regex]::Replace($rbac, $pattern, $replacement, 1)
  if ($updated -eq $rbac) { throw 'Could not locate the Overview navigation group. No navigation change was made.' }
  Set-Content -Path $rbacPath -Value $updated -Encoding UTF8
}

$appShellPath = '.\src\components\AppShell.tsx'
if (Test-Path $appShellPath) {
  $shell = Get-Content $appShellPath -Raw
  if (!$shell.Contains('"/reception/scheduling": CalendarDays,')) {
    $shell = $shell.Replace('"/calendar": CalendarDays,', '"/calendar": CalendarDays,' + "`r`n  `"/reception/scheduling`": CalendarDays,")
  }
  if (!$shell.Contains('Reception: CalendarDays,')) {
    $shell = $shell.Replace('  Company: CalendarDays,', '  Company: CalendarDays,' + "`r`n  Reception: CalendarDays,")
  }
  Set-Content -Path $appShellPath -Value $shell -Encoding UTF8
}

Write-Host "`nFILES CREATED:" -ForegroundColor Green
Write-Host " - $migrationPath"
Write-Host " - $routePath"
Write-Host "NAVIGATION UPDATED: Reception Scheduling"
Write-Host "BACKUPS: $backup"
Write-Host "`nNEXT: Review the migration, then apply it to Supabase before testing the page." -ForegroundColor Yellow
Write-Host "Run: npm run build" -ForegroundColor Cyan
