import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { enableNotificationSound, isNotificationSoundEnabled, playNotificationSound } from "@/lib/notification-sound";

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DailyOperationsBriefing() {
  const announcedDays = useRef(new Set<string>());
  const { data: session } = useSession();
  const day = localDateKey(new Date());
  const canViewObjectives = allows(session?.access, "objectives.view");
  const canViewCalendar = allows(session?.access, "clients.view");
  const canViewTasks = allows(session?.access, "tasks.view");

  const briefing = useQuery({
    queryKey: ["daily-operations-briefing", session?.userId, day],
    enabled: Boolean(session?.userId && (canViewObjectives || canViewCalendar || canViewTasks)),
    queryFn: async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);

      const [objectivesResult, eventsResult, tasksResult] = await Promise.all([
        canViewObjectives
          ? supabase
              .from("objectives")
              .select("id,title,target_date,progress,status")
              .is("archived_at", null)
              .in("status", ["planned", "in_progress"])
              .order("target_date", { ascending: true })
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
        canViewCalendar
          ? supabase
              .from("calendar_events")
              .select("id,title,starts_at")
              .gte("starts_at", start.toISOString())
              .lt("starts_at", end.toISOString())
              .order("starts_at", { ascending: true })
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
        canViewTasks
          ? supabase
              .from("tasks")
              .select("id,title,due_date,status")
              .eq("assigned_to", session!.userId)
              .eq("due_date", day)
              .is("archived_at", null)
              .order("due_date", { ascending: true })
              .limit(10)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const error = objectivesResult.error ?? eventsResult.error ?? tasksResult.error;
      if (error) throw error;

      return {
        objectives: objectivesResult.data ?? [],
        events: eventsResult.data ?? [],
        tasks: (tasksResult.data ?? []).filter(
          (task) => !["completed", "complete", "done"].includes(task.status.toLowerCase()),
        ),
      };
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    if (!session?.userId || !briefing.data) return;
    const storageKey = `kalexi-daily-briefing-${session.userId}-${day}`;
    if (announcedDays.current.has(storageKey)) return;
    try {
      if (window.localStorage.getItem(storageKey)) {
        announcedDays.current.add(storageKey);
        return;
      }
    } catch (error) {
      console.warn("[daily briefing] Could not read the reminder preference.", error);
    }

    const { objectives, events, tasks } = briefing.data;
    const lines = [
      `${objectives.length} active company objective${objectives.length === 1 ? "" : "s"}`,
      `${events.length} calendar event${events.length === 1 ? "" : "s"} today`,
      `${tasks.length} task${tasks.length === 1 ? "" : "s"} due today`,
    ];
    const objectiveTitles = objectives.slice(0, 3).map((objective) => objective.title);
    const eventTitles = events.slice(0, 3).map((event) => event.title);
    const taskTitles = tasks.slice(0, 3).map((task) => task.title);
    const details = [
      ...objectiveTitles.map((title) => `Objective: ${title}`),
      ...eventTitles.map((title) => `Event: ${title}`),
      ...taskTitles.map((title) => `Due: ${title}`),
    ];

    announcedDays.current.add(storageKey);
    try {
      window.localStorage.setItem(storageKey, "shown");
    } catch (error) {
      console.warn("[daily briefing] Could not store the reminder date.", error);
    }
    if (isNotificationSoundEnabled()) playNotificationSound();
    toast.info("Daily company briefing", {
      description: `${lines.join(" · ")}${details.length ? `\n${details.join(" · ")}` : ""}`,
      duration: 12_000,
      action: isNotificationSoundEnabled()
        ? undefined
        : {
            label: "Enable sound",
            onClick: enableNotificationSound,
          },
    });
  }, [briefing.data, day, session?.userId]);

  useEffect(() => {
    if (briefing.isError && briefing.error) {
      console.error("[daily briefing] Could not load company reminders.", briefing.error);
    }
  }, [briefing.error, briefing.isError]);

  return null;
}
