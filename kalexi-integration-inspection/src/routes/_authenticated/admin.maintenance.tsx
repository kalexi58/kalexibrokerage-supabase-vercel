import { createFileRoute } from "@tanstack/react-router";
import { MaintenanceAdminPage } from "@/routes/maintenance";

export const Route = createFileRoute("/_authenticated/admin/maintenance")({
  head: () => ({
    meta: [
      { title: "System Maintenance — Kalexi Brokerage" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MaintenanceAdminPage,
});
