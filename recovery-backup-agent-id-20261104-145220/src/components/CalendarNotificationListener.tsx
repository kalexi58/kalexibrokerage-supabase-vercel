import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { enableNotificationSound, isNotificationSoundEnabled, playNotificationSound } from "@/lib/notification-sound";

type CalendarNotification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
};

export function CalendarNotificationListener() {
  const processedIds = useRef(new Set<string>());
  const notifications = useQuery({
    queryKey: ["calendar-event-notifications"],
    queryFn: async () => {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userResult.user) return [];

      const { data, error } = await supabase
        .from("notifications")
        .select("id,title,body,link")
        .is("read_at", null)
        .like("link", "/calendar?event=%")
        .order("created_at", { ascending: true })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as CalendarNotification[];
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  useEffect(() => {
    const pending = (notifications.data ?? []).filter(
      (notification) => !processedIds.current.has(notification.id),
    );
    if (!pending.length) return;

    pending.forEach((notification) => processedIds.current.add(notification.id));
    void (async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .in(
          "id",
          pending.map((notification) => notification.id),
        );
      if (error) {
        pending.forEach((notification) => processedIds.current.delete(notification.id));
        console.error("[calendar notifications] Could not mark event notices as read.", error);
        return;
      }

      if (isNotificationSoundEnabled()) playNotificationSound();
      for (const notification of pending) {
        toast.info(notification.title, {
          description: notification.body ?? undefined,
          action: notification.link
            ? {
                label: "View calendar",
                onClick: () => window.location.assign(notification.link!),
              }
            : undefined,
          cancel: isNotificationSoundEnabled()
              ? undefined
              : {
                  label: "Enable sound",
                  onClick: enableNotificationSound,
                },
        });
      }
    })();
  }, [notifications.data]);

  useEffect(() => {
    if (!notifications.isError || !notifications.error) return;
    console.error("[calendar notifications] Could not load event notices.", notifications.error);
  }, [notifications.error, notifications.isError]);

  return null;
}
