import { supabase } from "@/integrations/supabase/client";

const db = supabase as any;

export async function getMyScheduleSettings() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Authentication required.");

  const { data, error } = await db
    .from("officer_schedule_settings")
    .select("*")
    .eq("officer_id", user.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveMyScheduleSettings(input: {
  lunch_start: string | null;
  lunch_end: string | null;
}) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Authentication required.");

  const { error } = await db.from("officer_schedule_settings").upsert({
    officer_id: user.user.id,
    ...input,
    updated_at: new Date().toISOString()
  }, { onConflict: "officer_id" });

  if (error) throw error;
}

export async function setMyOfficePresence(inOffice: boolean) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Authentication required.");

  const { error } = await db.from("officer_schedule_settings").upsert({
    officer_id: user.user.id,
    presence_status: inOffice ? "in_office" : "out_of_office",
    presence_updated_at: new Date().toISOString()
  }, { onConflict: "officer_id" });

  if (error) throw error;
}

export async function requestOfficerLeave(input: {
  leave_type: string;
  starts_at: string;
  ends_at: string;
  reason?: string;
}) {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("Authentication required.");

  const { error } = await db.from("officer_leave").insert({
    officer_id: user.user.id,
    ...input,
    status: "pending",
    created_by: user.user.id
  });

  if (error) throw error;
}

export async function getOfficerAvailableSlots(officerId: string, date: string) {
  const { data, error } = await db.rpc("get_officer_available_slots", {
    p_officer_id: officerId,
    p_date: date
  });

  if (error) throw error;
  return data ?? [];
}

export async function getOfficePresence() {
  const { data, error } = await db
    .from("profiles")
    .select("id,full_name,department,job_title,status")
    .eq("status", "active")
    .order("full_name");

  if (error) throw error;

  const { data: presence, error: presenceError } = await db
    .from("officer_schedule_settings")
    .select("officer_id,presence_status,presence_updated_at,lunch_start,lunch_end");

  if (presenceError) throw presenceError;

  return (data ?? []).map((officer: any) => ({
    ...officer,
    ...(presence ?? []).find((p: any) => p.officer_id === officer.id),
    presence_status: (presence ?? []).find((p: any) => p.officer_id === officer.id)?.presence_status ?? "out_of_office"
  }));
}
