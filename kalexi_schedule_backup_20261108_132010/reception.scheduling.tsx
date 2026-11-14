import OfficerScheduleControls from "@/components/scheduling/OfficerScheduleControls";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft, CalendarDays, Clock3, Plus, RefreshCw, Search,
  UserRound, Users, Printer, CheckCircle2, MapPin
} from "lucide-react";
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

type Officer = {
  id: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
};

type ScheduleRow = {
  id: string;
  officer_id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  status: string;
  location: string | null;
  details?: string | null;
  description?: string | null;
  customer_name?: string;
  customer_phone?: string;
  appointment_ref?: string;
  request_type?: string;
  kind: "programme" | "appointment";
};

type AvailableSlot = {
  slot_start: string;
  slot_end: string;
};

type AppointmentReceipt = {
  appointment_id: string;
  appointment_reference: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  officer_name: string;
  officer_department: string;
  title: string;
  meeting_method: string;
  location: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function localDate(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function localDateTime(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatClock(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Kampala",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function ReceptionSchedulingPage() {
  const navigate = useNavigate();

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

  const [programmeStartsAt, setProgrammeStartsAt] = useState(
    () => localDateTime(new Date(Date.now() + 3600000))
  );
  const [programmeEndsAt, setProgrammeEndsAt] = useState(
    () => localDateTime(new Date(Date.now() + 7200000))
  );

  const [appointmentDate, setAppointmentDate] = useState(() =>
    localDate(new Date(Date.now() + 86400000))
  );
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [receipt, setReceipt] = useState<AppointmentReceipt | null>(null);

  const [filterOfficer, setFilterOfficer] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [staffResult, programmeResult, appointmentResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id,full_name,department,job_title")
        .eq("status", "active")
        .order("full_name"),

      db
        .from("officer_programmes")
        .select("id,officer_id,title,starts_at,ends_at,status,location,details")
        .gte("ends_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(500),

      db
        .from("officer_appointments")
        .select("id,officer_id,title,starts_at,ends_at,status,location,customer_name,customer_phone,appointment_ref,request_type,description")
        .gte("ends_at", new Date(Date.now() - 30 * 86400000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(500),
    ]);

    if (staffResult.error || programmeResult.error || appointmentResult.error) {
      setError([
        staffResult.error?.message,
        programmeResult.error?.message,
        appointmentResult.error?.message,
      ].filter(Boolean).join(" | "));
    } else {
      setOfficers((staffResult.data ?? []) as Officer[]);

      const programmes = (
        (programmeResult.data ?? []) as Omit<ScheduleRow, "kind">[]
      ).map((r) => ({ ...r, kind: "programme" as const }));

      const appointments = (
        (appointmentResult.data ?? []) as Omit<ScheduleRow, "kind">[]
      ).map((r) => ({ ...r, kind: "appointment" as const }));

      setRows(
        [...programmes, ...appointments].sort((a, b) =>
          a.starts_at.localeCompare(b.starts_at)
        )
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Retrieve live available slots whenever the officer or date changes.
  const loadAvailableSlots = useCallback(async () => {
    setSelectedSlot(null);
    setAvailableSlots([]);

    if (!officerId || !appointmentDate) return;

    setSlotsLoading(true);
    setError("");

    const { data, error: slotError } = await db.rpc(
      "get_officer_available_slots",
      {
        p_officer_id: officerId,
        p_date: appointmentDate,
      }
    );

    if (slotError) {
      setError(`Could not retrieve officer availability: ${slotError.message}`);
      setAvailableSlots([]);
    } else {
      setAvailableSlots((data ?? []) as AvailableSlot[]);
    }

    setSlotsLoading(false);
  }, [officerId, appointmentDate]);

  useEffect(() => {
    if (showForm && formType === "appointment") {
      void loadAvailableSlots();
    }
  }, [showForm, formType, loadAvailableSlots]);

  const visibleRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return rows.filter((r) => {
      const matchesOfficer = filterOfficer === "all" || r.officer_id === filterOfficer;
      const matchesType = filterType === "all" || r.kind === filterType;

      const haystack = [
        r.title,
        r.customer_name,
        r.customer_phone,
        r.appointment_ref,
        r.location,
        officers.find((o) => o.id === r.officer_id)?.full_name ?? "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return matchesOfficer && matchesType && (!query || haystack.includes(query));
    });
  }, [rows, filterOfficer, filterType, searchTerm, officers]);

  const officerName = (id: string) =>
    officers.find((o) => o.id === id)?.full_name ?? "Unknown officer";

  const resetBookingForm = () => {
    setTitle("");
    setCustomerName("");
    setCustomerPhone("");
    setCustomerEmail("");
    setDetails("");
    setLocation("");
    setSelectedSlot(null);
    setAvailableSlots([]);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    if (!officerId) {
      setError("Select the officer responsible for this record.");
      setSaving(false);
      return;
    }

    if (formType === "programme") {
      const start = new Date(programmeStartsAt);
      const end = new Date(programmeEndsAt);

      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        end <= start
      ) {
        setError("The programme end time must be later than its start time.");
        setSaving(false);
        return;
      }

      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError || !authData.user) {
        setError("Your session could not be verified. Sign in again.");
        setSaving(false);
        return;
      }

      const result = await db.from("officer_programmes").insert({
        officer_id: officerId,
        title: title.trim(),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        location: location.trim() || null,
        created_by: authData.user.id,
        programme_type: "programme",
        details: details.trim() || null,
        status: "scheduled",
      });

      if (result.error) {
        setError(
          result.error.code === "23P01"
            ? "DOUBLE BOOKING BLOCKED: This officer already has an appointment or programme during that time."
            : `Could not save the programme: ${result.error.message}`
        );
      } else {
        setNotice("Officer programme added to the schedule.");
        setShowForm(false);
        resetBookingForm();
        await load();
      }

      setSaving(false);
      return;
    }

    if (!selectedSlot) {
      setError("Select an available appointment slot first.");
      setSaving(false);
      return;
    }

    if (!customerName.trim() || !customerPhone.trim() || !title.trim()) {
      setError("Complete the title, customer name and customer telephone.");
      setSaving(false);
      return;
    }

    // The database function performs the final availability check
    // and inserts the appointment using the authenticated user.
    const { data, error: bookingError } = await db.rpc(
      "create_reception_appointment",
      {
        p_officer_id: officerId,
        p_customer_name: customerName.trim(),
        p_customer_phone: customerPhone.trim(),
        p_customer_email: customerEmail.trim() || null,
        p_request_type: requestType,
        p_title: title.trim(),
        p_description: details.trim() || null,
        p_meeting_method: meetingMethod,
        p_location: location.trim() || null,
        p_starts_at: selectedSlot.slot_start,
        p_ends_at: selectedSlot.slot_end,
      }
    );

    if (bookingError) {
      setError(
        bookingError.code === "23P01"
          ? "DOUBLE BOOKING BLOCKED: Someone has reserved this officer's time. Refresh the available slots and select another."
          : `Appointment could not be booked: ${bookingError.message}`
      );

      await loadAvailableSlots();
      setSaving(false);
      return;
    }

    const saved = Array.isArray(data) ? data[0] : data;

    if (!saved?.appointment_id || !saved?.appointment_reference) {
      setError("The database did not return the appointment reference. Check the appointment record before retrying.");
      setSaving(false);
      return;
    }

    const selectedOfficer = officers.find((o) => o.id === officerId);

    setReceipt({
      appointment_id: saved.appointment_id,
      appointment_reference: saved.appointment_reference,
      customer_name: customerName.trim(),
      customer_phone: customerPhone.trim(),
      customer_email: customerEmail.trim(),
      officer_name: selectedOfficer?.full_name ?? "Assigned officer",
      officer_department: selectedOfficer?.department ?? "",
      title: title.trim(),
      meeting_method: meetingMethod,
      location: location.trim() || "To be confirmed by the officer",
      starts_at: selectedSlot.slot_start,
      ends_at: selectedSlot.slot_end,
      status: "pending",
    });

    setNotice(`Appointment successfully created. Reference: ${saved.appointment_reference}`);
    setShowForm(false);
    resetBookingForm();

    await load();
    setSaving(false);
  }

  async function updateAppointmentStatus(row: ScheduleRow, status: string) {
    setError("");
    setNotice("");

    const result = await db
      .from("officer_appointments")
      .update({ status })
      .eq("id", row.id);

    if (result.error) {
      setError(
        result.error.code === "23P01"
          ? "That time is no longer available."
          : result.error.message
      );
    } else {
      setNotice(`Appointment marked ${status}.`);
      await load();
    }
  }

  const printReceipt = () => {
    if (!receipt) return;
    window.print();
  };

  return (
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 pb-10 md:p-7">
      <OfficerScheduleControls />
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body * { visibility: hidden !important; }
          #appointment-receipt,
          #appointment-receipt * { visibility: visible !important; }
          #appointment-receipt {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            color: black !important;
            padding: 12px !important;
          }
          .receipt-no-print { display: none !important; }
        }
      `}</style>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate({ to: "/dashboard" })}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </button>
        <span className="hidden rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">
          Reception workspace
        </span>
      </div>

      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:from-slate-950 dark:via-background dark:to-violet-950 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Kalexi Brokerage · Reception
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">
              Officer Scheduling & Appointments
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Book customers into an officer's available working hours, manage
              programmes and track appointments. The database prevents overlapping bookings.
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowForm((v) => !v);
              setError("");
              setReceipt(null);
            }}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add schedule item
          </button>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm shadow-sm">
          {error}
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm dark:bg-emerald-950 dark:text-emerald-100">
          {notice}
        </div>
      )}

      {receipt && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
          <div className="receipt-no-print mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
              <h2 className="font-semibold">Appointment created successfully</h2>
            </div>
            <button
              type="button"
              onClick={printReceipt}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <Printer className="h-4 w-4" /> Print client receipt
            </button>
          </div>

          <div id="appointment-receipt" className="mx-auto max-w-2xl rounded-xl border bg-white p-6 text-slate-900 shadow-sm">
            <div className="border-b-2 border-slate-900 pb-4 text-center">
              <h2 className="text-2xl font-bold tracking-wide">KALEXI BROKERAGE</h2>
              <p className="mt-1 text-sm font-semibold uppercase tracking-widest">
                Client appointment receipt
              </p>
              <p className="mt-3 font-mono text-sm font-bold">
                {receipt.appointment_reference}
              </p>
            </div>

            <div className="my-5 rounded-lg bg-slate-100 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Appointment status</p>
              <p className="mt-1 font-bold uppercase">{receipt.status}</p>
              <p className="mt-2 text-xs text-slate-600">
                This receipt confirms that the appointment request has been recorded.
                It is not a confirmation of attendance until the officer confirms it.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">Client name</p>
                <p className="font-semibold">{receipt.customer_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Telephone</p>
                <p className="font-semibold">{receipt.customer_phone}</p>
              </div>
              {receipt.customer_email && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="font-semibold">{receipt.customer_email}</p>
                </div>
              )}
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Appointment purpose</p>
                <p className="font-semibold">{receipt.title}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Responsible officer</p>
                <p className="font-semibold">{receipt.officer_name}</p>
                {receipt.officer_department && (
                  <p className="text-sm text-slate-600">{receipt.officer_department}</p>
                )}
              </div>
              <div>
                <p className="text-xs text-slate-500">Meeting method</p>
                <p className="font-semibold">
                  {receipt.meeting_method.replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Date</p>
                <p className="font-semibold">
                  {new Intl.DateTimeFormat("en-GB", {
                    timeZone: "Africa/Kampala",
                    dateStyle: "full",
                  }).format(new Date(receipt.starts_at))}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Appointment time</p>
                <p className="font-semibold">
                  {formatClock(receipt.starts_at)} – {formatClock(receipt.ends_at)}
                  <span className="ml-1 text-xs text-slate-500">EAT</span>
                </p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Meeting location / instructions</p>
                <p className="font-semibold">{receipt.location}</p>
              </div>
            </div>

            <div className="mt-8 border-t pt-4 text-center text-xs text-slate-500">
              <p>Please keep this receipt and present the reference when attending.</p>
              <p className="mt-1 font-semibold">Making the transaction secure is our mission.</p>
            </div>
          </div>
        </section>
      )}

      {showForm && (
        <section className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Create schedule record</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setFormType("appointment");
                  setSelectedSlot(null);
                  setError("");
                }}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  formType === "appointment" ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                Appointment / Meeting
              </button>
              <button
                type="button"
                onClick={() => {
                  setFormType("programme");
                  setSelectedSlot(null);
                  setError("");
                }}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  formType === "programme" ? "bg-primary text-primary-foreground" : "bg-background"
                }`}
              >
                Officer Programme
              </button>
            </div>
          </div>

          <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
              Responsible officer
              <select
                required
                value={officerId}
                onChange={(e) => {
                  setOfficerId(e.target.value);
                  setSelectedSlot(null);
                }}
                className="h-10 rounded-md border bg-background px-3 font-normal"
              >
                <option value="">Select officer</option>
                {officers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                    {o.job_title ? ` · ${o.job_title}` : ""}
                    {o.department ? ` · ${o.department}` : ""}
                  </option>
                ))}
              </select>
            </label>

            {formType === "appointment" && (
              <>
                <div className="grid gap-1.5 text-sm font-medium md:col-span-2">
                  <label htmlFor="appointment-date">Select appointment date</label>
                  <input
                    id="appointment-date"
                    required
                    type="date"
                    min={localDate(new Date())}
                    value={appointmentDate}
                    onChange={(e) => {
                      setAppointmentDate(e.target.value);
                      setSelectedSlot(null);
                    }}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  />
                </div>

                <div className="rounded-xl border bg-muted/20 p-4 md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-semibold">Available appointment slots</h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Select an available time. All times are East Africa Time.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!officerId || slotsLoading}
                      onClick={() => void loadAvailableSlots()}
                      className="inline-flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-xs font-medium disabled:opacity-50"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Refresh slots
                    </button>
                  </div>

                  {!officerId ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Select an officer to view their availability.
                    </p>
                  ) : slotsLoading ? (
                    <p className="mt-4 text-sm text-muted-foreground">
                      Checking the officer's availability...
                    </p>
                  ) : availableSlots.length === 0 ? (
                    <p className="mt-4 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      No available slots were returned for this date. The officer may not
                      have configured working hours, or the day may already be fully booked.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {availableSlots.map((slot) => {
                        const selected =
                          selectedSlot?.slot_start === slot.slot_start &&
                          selectedSlot?.slot_end === slot.slot_end;

                        return (
                          <button
                            key={`${slot.slot_start}-${slot.slot_end}`}
                            type="button"
                            onClick={() => setSelectedSlot(slot)}
                            className={`rounded-lg border px-3 py-3 text-sm font-semibold transition ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20"
                                : "bg-background hover:border-primary hover:bg-primary/5"
                            }`}
                          >
                            {formatClock(slot.slot_start)} – {formatClock(slot.slot_end)}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedSlot && (
                    <div className="mt-4 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                      <CheckCircle2 className="mr-2 inline h-4 w-4" />
                      Selected: {formatTime(selectedSlot.slot_start)} to{" "}
                      {formatClock(selectedSlot.slot_end)}
                    </div>
                  )}
                </div>
              </>
            )}

            <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
              {formType === "programme" ? "Programme title" : "Appointment / meeting title"}
              <input
                required
                minLength={2}
                maxLength={180}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-10 rounded-md border bg-background px-3 font-normal"
                placeholder={
                  formType === "programme"
                    ? "e.g. Field inspection programme"
                    : "e.g. Gold testing consultation"
                }
              />
            </label>

            {formType === "appointment" && (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  Customer full name
                  <input
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium">
                  Customer telephone
                  <input
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium">
                  Customer email (optional)
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-medium">
                  Request category
                  <select
                    value={requestType}
                    onChange={(e) => setRequestType(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  >
                    <option value="appointment">Appointment</option>
                    <option value="meeting">Meeting</option>
                    <option value="booking">Service booking</option>
                    <option value="consultation">Consultation</option>
                  </select>
                </label>

                <label className="grid gap-1.5 text-sm font-medium">
                  Meeting method
                  <select
                    value={meetingMethod}
                    onChange={(e) => setMeetingMethod(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  >
                    <option value="in_person">In person</option>
                    <option value="online">Online</option>
                    <option value="telephone">Telephone</option>
                  </select>
                </label>
              </>
            )}

            {formType === "programme" && (
              <>
                <label className="grid gap-1.5 text-sm font-medium">
                  Programme start
                  <input
                    required
                    type="datetime-local"
                    value={programmeStartsAt}
                    onChange={(e) => setProgrammeStartsAt(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium">
                  Programme end
                  <input
                    required
                    type="datetime-local"
                    value={programmeEndsAt}
                    onChange={(e) => setProgrammeEndsAt(e.target.value)}
                    className="h-10 rounded-md border bg-background px-3 font-normal"
                  />
                </label>
              </>
            )}

            <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
              Location / online meeting details
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="h-10 rounded-md border bg-background px-3 font-normal"
                placeholder="Office, address or meeting link"
              />
            </label>

            <label className="grid gap-1.5 text-sm font-medium md:col-span-2">
              {formType === "programme" ? "Programme details" : "Purpose / additional notes"}
              <textarea
                rows={3}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                className="rounded-md border bg-background px-3 py-2 font-normal"
              />
            </label>

            <div className="flex flex-wrap gap-2 md:col-span-2">
              <button
                disabled={
                  saving ||
                  (formType === "appointment" && !selectedSlot)
                }
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : formType === "appointment"
                    ? "Book appointment"
                    : "Save programme"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setError("");
                }}
                className="rounded-lg border px-5 py-2.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">
            Pending and confirmed appointments, plus scheduled programmes, reserve
            the officer's time. The database performs the final conflict check.
          </p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Active officers</p>
            <Users className="h-4 w-4 text-cyan-600" />
          </div>
          <p className="mt-2 text-3xl font-bold">{officers.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Available staff profiles</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Appointments / meetings</p>
            <CalendarDays className="h-4 w-4 text-violet-600" />
          </div>
          <p className="mt-2 text-3xl font-bold">
            {rows.filter((r) => r.kind === "appointment" && ["pending", "confirmed"].includes(r.status)).length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Pending or confirmed</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Scheduled programmes</p>
            <Clock3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-2 text-3xl font-bold">
            {rows.filter((r) => r.kind === "programme" && r.status === "scheduled").length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Officer commitments</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="space-y-3 border-b p-4 md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Officer schedule</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Times displayed in Kampala time (Africa/Kampala).
              </p>
            </div>

            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium transition hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh schedule
            </button>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_220px_180px]">
            <label className="relative block">
              <span className="sr-only">Search schedule</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search customer, officer, reference or title..."
                className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
              />
            </label>

            <select
              aria-label="Filter by officer"
              value={filterOfficer}
              onChange={(e) => setFilterOfficer(e.target.value)}
              className="h-10 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="all">All officers</option>
              {officers.map((o) => (
                <option key={o.id} value={o.id}>{o.full_name}</option>
              ))}
            </select>

            <select
              aria-label="Filter by record type"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-10 rounded-lg border bg-background px-3 text-sm"
            >
              <option value="all">All records</option>
              <option value="appointment">Appointments</option>
              <option value="programme">Programmes</option>
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            Showing {visibleRows.length} of {rows.length} schedule records
          </p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading officer schedules...
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-10 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 font-medium">No matching schedule records</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Try changing the search or filters, or add a new appointment or programme.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {visibleRows.map((r) => (
              <article
                key={`${r.kind}-${r.id}`}
                className="grid gap-4 p-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      r.kind === "appointment"
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200"
                        : "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200"
                    }`}>
                      {r.kind === "appointment" ? r.request_type ?? "appointment" : "officer programme"}
                    </span>

                    <span className="text-xs text-muted-foreground">{r.status}</span>

                    {r.appointment_ref && (
                      <span className="font-mono text-xs text-muted-foreground">
                        {r.appointment_ref}
                      </span>
                    )}
                  </div>

                  <h3 className="mt-2 break-words font-semibold">{r.title}</h3>

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <UserRound className="h-3.5 w-3.5" />
                      {officerName(r.officer_id)}
                    </span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatTime(r.starts_at)} – {formatTime(r.ends_at)}
                    </span>
                  </p>

                  {r.customer_name && (
                    <p className="mt-1 text-sm">
                      Customer: {r.customer_name} · {r.customer_phone}
                    </p>
                  )}

                  {r.location && (
                    <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" /> {r.location}
                    </p>
                  )}
                </div>

                {r.kind === "appointment" && (
                  <div className="flex flex-wrap gap-2">
                    {r.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => void updateAppointmentStatus(r, "confirmed")}
                        className="min-h-9 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
                      >
                        Confirm
                      </button>
                    )}

                    {["pending", "confirmed"].includes(r.status) && (
                      <button
                        type="button"
                        onClick={() => void updateAppointmentStatus(r, "cancelled")}
                        className="min-h-9 rounded-lg border bg-background px-3.5 py-2 text-xs font-medium transition hover:bg-muted"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Website-imported bookings can be added to this same schedule after the website
        API is connected. This page currently creates internal records.
      </p>
    </main>
  );
}

