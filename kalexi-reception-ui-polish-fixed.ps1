$ErrorActionPreference = 'Stop'

Write-Host 'KALEXI RECEPTION PAGE UI/UX UPDATE' -ForegroundColor Cyan

if (!(Test-Path '.\package.json')) {
    throw 'Run this script from the Kalexi Brokerage project root (the folder containing package.json).'
}

$routePath = '.\src\routes\_authenticated\reception.scheduling.tsx'
if (!(Test-Path $routePath)) {
    throw "Reception scheduling page was not found at $routePath. Install the scheduling page first. No changes made."
}

$content = Get-Content -LiteralPath $routePath -Raw
$backup = "$routePath.backup-ui-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $routePath -Destination $backup

function Replace-ExactlyOnce([string]$Text, [string]$Old, [string]$New, [string]$Description) {
    $count = ([regex]::Matches($Text, [regex]::Escape($Old))).Count
    if ($count -ne 1) {
        throw "Expected exactly one match for '$Description'; found $count. Original file remains backed up at $backup. No further changes made."
    }
    return $Text.Replace($Old, $New)
}

# Add navigation and search icons/hooks.
$content = Replace-ExactlyOnce $content 'import { createFileRoute, redirect } from "@tanstack/react-router";' 'import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";' 'TanStack navigation import'
$content = Replace-ExactlyOnce $content 'import { CalendarDays, Clock3, Plus, RefreshCw, UserRound, Users } from "lucide-react";' 'import { ArrowLeft, CalendarDays, Clock3, Plus, RefreshCw, Search, UserRound, Users } from "lucide-react";' 'Lucide icon import'
$newHook = "function ReceptionSchedulingPage() {`r`n  const navigate = useNavigate();"
$content = Replace-ExactlyOnce $content 'function ReceptionSchedulingPage() {' $newHook 'navigation hook'
$newSearchState = "  const [filterOfficer, setFilterOfficer] = useState(`"all`");`r`n  const [searchTerm, setSearchTerm] = useState(`"`");"
$content = Replace-ExactlyOnce $content '  const [filterOfficer, setFilterOfficer] = useState("all");' $newSearchState 'search state'

$oldFilter = @'
  const visibleRows = useMemo(() => rows.filter((r) =>
    (filterOfficer === "all" || r.officer_id === filterOfficer) &&
    (filterType === "all" || r.kind === filterType)
  ), [rows, filterOfficer, filterType]);
'@
$newFilter = @'
  const visibleRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesOfficer = filterOfficer === "all" || r.officer_id === filterOfficer;
      const matchesType = filterType === "all" || r.kind === filterType;
      const haystack = [r.title, r.customer_name, r.customer_phone, r.appointment_ref, r.location, officerNameForSearch(r.officer_id)]
        .filter(Boolean).join(" ").toLowerCase();
      return matchesOfficer && matchesType && (!query || haystack.includes(query));
    });
  }, [rows, filterOfficer, filterType, searchTerm, officers]);
'@
# Use a local pure helper inside component scope before visibleRows, avoiding stale/global state.
$newFilter = $newFilter.Replace('officerNameForSearch(r.officer_id)', '(officers.find((o) => o.id === r.officer_id)?.full_name ?? "")')
$content = Replace-ExactlyOnce $content $oldFilter $newFilter 'schedule filtering logic'

$oldMain = @'
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 md:p-7">
      <section className="rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-violet-50 p-6 dark:from-slate-950 dark:via-background dark:to-violet-950">
'@
$newMain = @'
    <main className="mx-auto w-full max-w-7xl space-y-5 p-4 pb-10 md:p-7">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate({ to: "/dashboard" })} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Back to dashboard">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </button>
        <span className="hidden rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground sm:inline-flex">Reception workspace</span>
      </div>
      <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-sky-50 via-white to-violet-50 p-5 shadow-sm dark:from-slate-950 dark:via-background dark:to-violet-950 md:p-7">
'@
$content = Replace-ExactlyOnce $content $oldMain $newMain 'page header and back button'

# Make the hero title responsive and improve action feedback.
$content = Replace-ExactlyOnce $content '<h1 className="mt-2 text-3xl font-bold tracking-tight">Officer Scheduling & Appointments</h1>' '<h1 className="mt-2 text-2xl font-bold tracking-tight md:text-3xl">Officer Scheduling & Appointments</h1>' 'responsive page title'
$content = Replace-ExactlyOnce $content 'className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"' 'className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"' 'primary action styling'

# Improve alerts and form container.
$content = Replace-ExactlyOnce $content 'className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"' 'className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm shadow-sm"' 'error alert styling'
$content = Replace-ExactlyOnce $content 'className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100"' 'className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 shadow-sm dark:bg-emerald-950 dark:text-emerald-100"' 'success alert styling'
$content = Replace-ExactlyOnce $content '<section className="rounded-2xl border bg-card p-5 shadow-sm">' '<section className="rounded-2xl border bg-card p-5 shadow-sm md:p-6">' 'form container styling'

# Upgrade metric cards with consistent hierarchy.
$content = Replace-ExactlyOnce $content '<section className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Active officers</p><p className="mt-1 text-2xl font-bold">{officers.length}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Appointments / meetings</p><p className="mt-1 text-2xl font-bold">{rows.filter((r) => r.kind === "appointment" && ["pending","confirmed"].includes(r.status)).length}</p></div><div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">Scheduled programmes</p><p className="mt-1 text-2xl font-bold">{rows.filter((r) => r.kind === "programme" && r.status === "scheduled").length}</p></div></section>' '<section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md"><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Active officers</p><Users className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-3xl font-bold tracking-tight">{officers.length}</p><p className="mt-1 text-xs text-muted-foreground">Available staff profiles</p></div><div className="rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md"><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Appointments / meetings</p><CalendarDays className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-3xl font-bold tracking-tight">{rows.filter((r) => r.kind === "appointment" && ["pending","confirmed"].includes(r.status)).length}</p><p className="mt-1 text-xs text-muted-foreground">Pending or confirmed</p></div><div className="rounded-2xl border bg-card p-4 shadow-sm transition hover:shadow-md"><div className="flex items-center justify-between"><p className="text-sm font-medium text-muted-foreground">Scheduled programmes</p><Clock3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-3xl font-bold tracking-tight">{rows.filter((r) => r.kind === "programme" && r.status === "scheduled").length}</p><p className="mt-1 text-xs text-muted-foreground">Officer commitments</p></div></section>' 'summary cards'

# Add a searchable field and cleaner filter toolbar.
$oldToolbar = @'
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Officer schedule</h2><p className="text-xs text-muted-foreground">Times displayed in Kampala time (Africa/Kampala).</p></div><div className="flex flex-wrap gap-2"><select value={filterOfficer} onChange={(e) => setFilterOfficer(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="all">All officers</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</select><select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm"><option value="all">All records</option><option value="appointment">Appointments</option><option value="programme">Programmes</option></select><button onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><RefreshCw className="h-3.5 w-3.5"/> Refresh</button></div></div>
'@
$newToolbar = @'
        <div className="space-y-3 border-b p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Officer schedule</h2><p className="mt-1 text-xs text-muted-foreground">Times displayed in Kampala time (Africa/Kampala).</p></div><button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm font-medium transition hover:bg-muted"><RefreshCw className="h-3.5 w-3.5"/> Refresh schedule</button></div><div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_220px_180px]"><label className="relative block"><span className="sr-only">Search schedule</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search customer, officer, reference or title..." className="h-10 w-full rounded-lg border bg-background pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><select aria-label="Filter by officer" value={filterOfficer} onChange={(e) => setFilterOfficer(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="all">All officers</option>{officers.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</select><select aria-label="Filter by record type" value={filterType} onChange={(e) => setFilterType(e.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="all">All records</option><option value="appointment">Appointments</option><option value="programme">Programmes</option></select></div><p className="text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length} schedule records</p></div>
'@
$content = Replace-ExactlyOnce $content $oldToolbar $newToolbar 'schedule search and filters'

# Improve schedule list cards and buttons.
$content = Replace-ExactlyOnce $content '<div className="divide-y">{visibleRows.map((r) => <article key={`${r.kind}-${r.id}`} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">' '<div className="divide-y">{visibleRows.map((r) => <article key={`${r.kind}-${r.id}`} className="grid gap-4 p-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-5">' 'schedule list card'
$content = Replace-ExactlyOnce $content 'className="mt-2 truncate font-semibold"' 'className="mt-2 break-words font-semibold"' 'schedule item title'
$metadataPattern = '(?s)<p\b[^>]*>\s*<UserRound\b.*?</p>'
$metadataReplacement = '<p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5"/>{officerName(r.officer_id)}</span><span className="text-border">•</span><span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5"/>{formatTime(r.starts_at)} – {formatTime(r.ends_at)}</span></p>'
$metadataMatches = [regex]::Matches($content, $metadataPattern)
if ($metadataMatches.Count -ne 1) {
    $line = ($content -split "`r?`n" | Where-Object { $_ -match '<UserRound' } | Select-Object -First 1)
    throw "Could not uniquely identify the officer/time metadata paragraph (found $($metadataMatches.Count)). Matching source line: $line. Original file remains backed up at $backup. No changes made."
}
$content = [regex]::Replace($content, $metadataPattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $metadataReplacement }, 1)
$content = Replace-ExactlyOnce $content 'className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"' 'className="min-h-9 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"' 'confirm button styling'
$content = Replace-ExactlyOnce $content 'className="rounded-md border px-3 py-2 text-xs"' 'className="min-h-9 rounded-lg border bg-background px-3.5 py-2 text-xs font-medium transition hover:bg-muted"' 'cancel button styling'

# More useful empty state for filtered searches.
$content = Replace-ExactlyOnce $content '<p className="mt-2 font-medium">No schedule records found</p><p className="mt-1 text-sm text-muted-foreground">Add an appointment or officer programme to begin.</p>' '<p className="mt-2 font-medium">No matching schedule records</p><p className="mt-1 text-sm text-muted-foreground">Try changing the search or filters, or add a new appointment or officer programme.</p>' 'empty state'

Set-Content -LiteralPath $routePath -Value $content -Encoding UTF8
Write-Host "`nUI/UX update applied successfully." -ForegroundColor Green
Write-Host "Updated page: $routePath"
Write-Host "Backup: $backup"
Write-Host "`nNext run: npm.cmd run build" -ForegroundColor Cyan
