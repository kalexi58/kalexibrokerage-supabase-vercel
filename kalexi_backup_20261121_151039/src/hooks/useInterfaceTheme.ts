import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";

export const DEFAULT_INTERFACE_PREFERENCES = {
  theme_mode: "light",
  density: "comfortable",
  accent: "kalexi",
} as const;

export function useInterfaceTheme() {
  const { data: session } = useSession();
  const preferences = useQuery({
    queryKey: ["user-interface-preferences", session?.userId],
    enabled: !!session?.userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      if (!session) return DEFAULT_INTERFACE_PREFERENCES;
      const { data, error } = await supabase
        .from("user_preferences")
        .select("theme_mode, density, accent")
        .eq("user_id", session.userId)
        .maybeSingle();
      if (error) throw error;
      return data ?? DEFAULT_INTERFACE_PREFERENCES;
    },
  });

  useEffect(() => {
    if (preferences.error) {
      console.error("[appearance] Could not load saved interface preferences.", preferences.error);
    }

    const root = document.documentElement;
    const value = preferences.data ?? DEFAULT_INTERFACE_PREFERENCES;
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark =
        value.theme_mode === "dark" ||
        (value.theme_mode === "system" && systemTheme.matches);
      root.classList.toggle("dark", dark);
      root.dataset["interfaceDensity"] = value.density;
      root.dataset["interfaceAccent"] = value.accent;
    };

    applyTheme();
    if (value.theme_mode === "system") {
      systemTheme.addEventListener("change", applyTheme);
      return () => systemTheme.removeEventListener("change", applyTheme);
    }
    return;
  }, [preferences.data, preferences.error]);
}
