export type AppRole =
  | "super_admin"
  | "receptionist"
  | "onboarding_officer"
  | "deals_manager"
  | "verification_officer"
  | "risk_officer"
  | "finance_officer"
  | "management"
  | "auditor";

export const ALL_ROLES: AppRole[] = [
  "super_admin",
  "receptionist",
  "onboarding_officer",
  "deals_manager",
  "verification_officer",
  "risk_officer",
  "finance_officer",
  "management",
  "auditor",
];

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  receptionist: "Receptionist",
  onboarding_officer: "Client Onboarding Officer",
  deals_manager: "Deals Manager",
  verification_officer: "Verification Officer",
  risk_officer: "Risk Officer",
  finance_officer: "Finance Officer",
  management: "Management",
  auditor: "Auditor",
};

export const WORKSPACE_LABEL: Record<AppRole, string> = {
  super_admin: "Administration Workspace",
  receptionist: "Reception Workspace",
  onboarding_officer: "Onboarding Workspace",
  deals_manager: "Deals Workspace",
  verification_officer: "Verification Workspace",
  risk_officer: "Risk Workspace",
  finance_officer: "Finance Workspace",
  management: "Management Workspace",
  auditor: "Audit Workspace",
};

/** Granular permission catalogue - configurable per role by the Super Admin. */
export const PERMISSION_GROUPS: { module: string; label: string; actions: string[] }[] = [
  {
    module: "clients",
    label: "Clients",
    actions: ["view", "create", "edit", "archive", "delete", "export"],
  },
  {
    module: "properties",
    label: "Properties & Assets",
    actions: ["view", "create", "edit", "verify", "archive"],
  },
  {
    module: "requirements",
    label: "Requirements",
    actions: ["view", "create", "edit", "archive", "export"],
  },
  {
    module: "opportunities",
    label: "Opportunities",
    actions: ["view", "create", "edit", "archive", "export"],
  },
  {
    module: "deals",
    label: "Deals",
    actions: ["view", "create", "edit", "close", "archive", "export"],
  },
  {
    module: "verification",
    label: "Verification & Due Diligence",
    actions: ["view", "create", "edit", "close", "export"],
  },
  {
    module: "risk",
    label: "Risk & Investigation",
    actions: ["view", "create", "edit", "close", "export"],
  },
  {
    module: "research",
    label: "Research",
    actions: ["view", "create", "edit", "archive", "export"],
  },
  {
    module: "documents",
    label: "Documents & Media",
    actions: ["view", "create", "edit", "download", "archive", "delete"],
  },
  {
    module: "finance",
    label: "Finance & Accounts",
    actions: ["view", "create", "edit", "approve", "configure", "export"],
  },
  { module: "agents", label: "Digital Agents", actions: ["view", "manage"] },
  { module: "forms", label: "Forms", actions: ["view", "create", "edit", "archive"] },
  { module: "tasks", label: "Tasks", actions: ["view", "create", "edit"] },
  {
    module: "objectives",
    label: "Objectives",
    actions: ["view", "create", "edit", "archive", "export"],
  },
  { module: "archive", label: "Archive", actions: ["view", "restore"] },
  { module: "audit", label: "Audit", actions: ["view"] },
  { module: "admin", label: "Administration", actions: ["users", "roles", "settings"] },
];

export const ALL_PERMISSIONS: string[] = PERMISSION_GROUPS.flatMap((g) =>
  g.actions.map((a) => `${g.module}.${a}`),
);

export const ACTION_LABEL: Record<string, string> = {
  view: "View",
  create: "Create",
  edit: "Edit",
  close: "Close",
  archive: "Archive",
  restore: "Restore",
  delete: "Delete",
  export: "Export",
  download: "Download",
  approve: "Approve",
  configure: "Configure",
  verify: "Verify",
  users: "Manage users",
  roles: "Manage roles & permissions",
  settings: "System settings",
};

export interface AccessState {
  roles: AppRole[];
  permissions: Set<string>;
  isSuperAdmin: boolean;
}

export function makeAccess(roles: AppRole[], permissions: string[]): AccessState {
  const isSuperAdmin = roles.includes("super_admin");
  return {
    roles,
    permissions: new Set(isSuperAdmin ? ALL_PERMISSIONS : permissions),
    isSuperAdmin,
  };
}

export function allows(access: AccessState | undefined | null, permission: string): boolean {
  if (!access) return false;
  return access.isSuperAdmin || access.permissions.has(permission);
}

export function primaryRole(roles: AppRole[]): AppRole | null {
  for (const role of ALL_ROLES) if (roles.includes(role)) return role;
  return null;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export interface NavLeaf {
  to: string;
  label: string;
  permission: string;
}
export interface NavGroup {
  label: string;
  items: NavLeaf[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Company",
    items: [{ to: "/calendar", label: "Company Calendar", permission: "clients.view" }],
  },
  {
    label: "Overview",
    items: [{ to: "/dashboard", label: "Dashboard", permission: "clients.view" }],
  },
  {
    label: "Clients",
    items: [
      { to: "/clients", label: "All Clients", permission: "clients.view" },
      { to: "/clients/new", label: "New Client", permission: "clients.create" },
      { to: "/requirements", label: "Requirements", permission: "requirements.view" },
      { to: "/forms", label: "Forms", permission: "forms.view" },
    ],
  },
  {
    label: "Properties",
    items: [
      { to: "/properties", label: "Property Register", permission: "properties.view" },
      { to: "/properties/new", label: "Register Property", permission: "properties.create" },
    ],
  },
  {
    label: "Opportunities",
    items: [
      { to: "/opportunities", label: "All Opportunities", permission: "opportunities.view" },
      { to: "/opportunities/new", label: "New Opportunity", permission: "opportunities.create" },
      { to: "/matches", label: "Matches", permission: "requirements.view" },
    ],
  },
  {
    label: "Deals",
    items: [
      { to: "/deals", label: "Pipeline", permission: "deals.view" },
      { to: "/deals/new", label: "New Deal", permission: "deals.create" },
    ],
  },
  {
    label: "Verification",
    items: [{ to: "/verification", label: "Verification & KYC", permission: "verification.view" }],
  },
  {
    label: "Risk & Intelligence",
    items: [
      { to: "/risk", label: "Risk & Investigations", permission: "risk.view" },
      { to: "/risk/search", label: "Internal Search", permission: "risk.view" },
      { to: "/research", label: "Research", permission: "research.view" },
      { to: "/intelligence", label: "Intelligence & Analytics", permission: "admin.users" },
    ],
  },
  {
    label: "Documents",
    items: [
      { to: "/documents", label: "Document Vault", permission: "documents.view" },
      { to: "/media", label: "Media Archive", permission: "documents.view" },
    ],
  },
  {
    label: "Finance & Accounts",
    items: [
      { to: "/finance", label: "Overview & Transactions", permission: "finance.view" },
      { to: "/finance/approvals", label: "Approvals", permission: "finance.view" },
      { to: "/finance/ledger", label: "General Ledger", permission: "finance.view" },
      { to: "/finance/receipts", label: "Receipts", permission: "finance.view" },
    ],
  },
  {
    label: "Digital Agents",
    items: [
      { to: "/agents", label: "Agent Programme", permission: "agents.view" },
      { to: "/agents/redemptions", label: "Token Redemptions", permission: "agents.view" },
    ],
  },
  {
    label: "Objectives",
    items: [{ to: "/objectives", label: "Company Objectives", permission: "objectives.view" }],
  },
  {
    label: "Archive",
    items: [{ to: "/archive", label: "Kalexi Archive", permission: "archive.view" }],
  },
  {
    label: "Administration",
    items: [
      { to: "/admin", label: "Control Centre", permission: "admin.users" },
      { to: "/employee-intelligence", label: "Employee Intelligence", permission: "admin.users" },
      { to: "/brand", label: "Brand Centre", permission: "admin.users" },
      { to: "/admin/maintenance", label: "System Maintenance", permission: "admin.settings" },
      { to: "/admin/users", label: "Users", permission: "admin.users" },
      { to: "/admin/roles", label: "Roles & Permissions", permission: "admin.roles" },
      { to: "/admin/audit", label: "Audit Logs", permission: "audit.view" },
    ],
  },
];

export function navFor(access: AccessState | undefined | null): NavGroup[] {
  return NAV_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter((i) => allows(access, i.permission)),
  })).filter((g) => g.items.length > 0);
}
