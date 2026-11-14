import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getMaintenanceAccess } from "@/lib/maintenance.functions";
import { BrandedLoadingScreen } from "@/components/LoadingStates";
import { fetchSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingMs: 250,
  pendingComponent: () => (
    <BrandedLoadingScreen message="Verifying your session and maintenance access…" />
  ),
  beforeLoad: async ({ context }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/" });

    const session = await context.queryClient.ensureQueryData({
      queryKey: ["session"],
      queryFn: fetchSession,
    });
    if (!session) throw redirect({ to: "/" });

    let maintenanceAccess: Awaited<ReturnType<typeof getMaintenanceAccess>>;
    try {
      maintenanceAccess = await getMaintenanceAccess({ data: undefined });
    } catch (error) {
      console.error("[maintenance] Could not verify protected route access.", error);
      if (!session.access.isSuperAdmin) throw redirect({ to: "/maintenance" });
      return { user: data.user };
    }
    if (maintenanceAccess.maintenanceEnabled && !maintenanceAccess.isSuperAdmin) {
      throw redirect({ to: "/maintenance" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
