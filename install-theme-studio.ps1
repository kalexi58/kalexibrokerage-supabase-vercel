
$ErrorActionPreference = "Stop"
$root = "C:\Users\kalexi group\Downloads\kalexibrokerage-supabase-vercel(v1.0.0 relase)"
Set-Location $root

$component = Join-Path $root "src\components\ThemeGallery.tsx"
$route = Join-Path $root "src\routes\_authenticated\brand.control-center.tsx"
$css = Join-Path $root "src\styles.css"

foreach ($file in @($component, $route, $css)) {
    if (!(Test-Path $file)) { throw "Required file not found: $file" }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backup = Join-Path $root "theme-studio-backup-$stamp"
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item $route $backup
Copy-Item $css $backup
Copy-Item $component $backup
Write-Host "Backup created: $backup"

$routeText = Get-Content $route -Raw
$cssText = Get-Content $css -Raw
$componentText = Get-Content $component -Raw

if ($routeText -notmatch "ThemeGallery") {
    $importLine = 'import ThemeGallery from "../../components/ThemeGallery";'

    if ($routeText -match '(?m)^import .+;$') {
        $lastImport = [regex]::Matches($routeText, '(?m)^import .+;$') |
            Select-Object -Last 1

        $insertAt = $lastImport.Index + $lastImport.Length
        $routeText = $routeText.Insert($insertAt, "`r`n$importLine")
    } else {
        throw "Could not safely find the import section. Backup created; no route changes made."
    }

    $routeText = [regex]::Replace(
        $routeText,
        '(?s)(return\s*\(\s*<main\b[^>]*>)',
        ('$1' + "`r`n      <ThemeGallery`r`n        onPreview={(theme) => applyBrand({ ...draft, ...theme })}`r`n        onApply={(theme) => {`r`n          const next = { ...draft, ...theme };`r`n          setDraft(next);`r`n          setBrand(next);`r`n          applyBrand(next);`r`n          setNotice(`${theme.name} selected. Click Save to keep this theme.`);`r`n        }}`r`n      />"),
        1
    )

    if ($routeText -notmatch '<ThemeGallery') {
        throw "Could not safely locate the page insertion point. Backup created; route not written."
    }

    Set-Content -Path $route -Value $routeText -Encoding UTF8
    Write-Host "Theme Gallery connected to Brand Control Center."
} else {
    Write-Host "Theme Gallery reference already exists; skipped route integration."
}

if ($cssText -notmatch 'KALEXI_THEME_STUDIO_V1') {
    $themeCss = @'

/* KALEXI_THEME_STUDIO_V1 */
.kalexi-theme-gallery { margin: 28px 0; color: var(--text, #182230); }
.kalexi-theme-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:20px; }
.kalexi-theme-heading h2 { margin:4px 0 6px; font-size:1.65rem; font-weight:750; }
.kalexi-theme-heading p,.kalexi-theme-card-copy p { color:var(--muted,#5B6678); line-height:1.55; }
.kalexi-theme-eyebrow { font-size:.72rem; font-weight:800; letter-spacing:.12em; }
.kalexi-theme-count,.kalexi-theme-card-copy small { border:1px solid var(--border,#DCE3ED); border-radius:999px; padding:5px 10px; font-size:.75rem; font-weight:700; }
.kalexi-theme-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr)); gap:18px; }
.kalexi-theme-card { overflow:hidden; min-width:0; border:1px solid var(--border,#DCE3ED); border-radius:15px; background:var(--surface,#fff); box-shadow:0 5px 18px rgb(20 35 60 / 6%); }
.kalexi-theme-preview { display:flex; min-height:148px; overflow:hidden; border-bottom:1px solid; }
.kalexi-theme-sidebar { width:18%; min-width:34px; display:flex; flex-direction:column; align-items:center; gap:12px; padding:12px 5px; }
.kalexi-theme-sidebar span { width:18px; height:18px; border-radius:5px; }
.kalexi-theme-sidebar i { width:65%; height:4px; border-radius:8px; background:rgb(255 255 255 / 45%); }
.kalexi-theme-dashboard { flex:1; min-width:0; padding:12px; }
.kalexi-theme-topline { display:flex; justify-content:space-between; margin-bottom:12px; }
.kalexi-theme-topline i { height:5px; width:35%; border-radius:5px; }
.kalexi-theme-kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:5px; margin-bottom:7px; }
.kalexi-theme-kpis span { display:flex; flex-direction:column; gap:7px; padding:7px 5px; border:1px solid; border-radius:5px; }
.kalexi-theme-kpis i,.kalexi-theme-kpis b { height:4px; width:75%; border-radius:4px; }
.kalexi-theme-kpis b { height:6px; width:55%; }
.kalexi-theme-chart { height:42px; padding:4px; border:1px solid; border-radius:5px; }
.kalexi-theme-chart svg { width:100%; height:100%; }
.kalexi-theme-table { display:flex; gap:5px; padding-top:7px; }
.kalexi-theme-table i { height:3px; flex:1; border-radius:4px; }
.kalexi-theme-swatches { display:flex; gap:6px; padding:13px 14px 0; }
.kalexi-theme-swatches span { width:22px; height:22px; border:1px solid rgb(120 130 145 / 25%); border-radius:50%; }
.kalexi-theme-card-copy { padding:10px 14px 14px; }
.kalexi-theme-card-copy h3 { margin:0 0 5px; font-size:1rem; font-weight:750; }
.kalexi-theme-card-copy p { margin:0 0 10px; font-size:.88rem; }
.kalexi-theme-actions { display:flex; gap:8px; padding:0 14px 14px; }
.kalexi-theme-actions button { flex:1; min-height:38px; padding:8px 10px; border:1px solid var(--border,#DCE3ED); border-radius:9px; background:var(--surface,#fff); color:var(--text,#182230); font:inherit; font-size:.83rem; font-weight:700; cursor:pointer; }
.kalexi-theme-actions button:last-child { background:var(--primary,#2457C5); color:#fff; border-color:transparent; }
.kalexi-theme-actions button:focus-visible { outline:3px solid var(--accent,#0E9F8A); outline-offset:3px; }
.kalexi-theme-footnote { margin-top:14px; color:var(--muted,#5B6678); font-size:.85rem; line-height:1.6; }
@media(max-width:540px) { .kalexi-theme-heading { flex-direction:column; } .kalexi-theme-actions { flex-direction:column; } }
'@

    Add-Content -Path $css -Value $themeCss -Encoding UTF8
    Write-Host "Theme Studio styles added."
} else {
    Write-Host "Theme Studio styles already exist; skipped CSS addition."
}

Write-Host "`n===== BUILD CHECK ====="
npm.cmd run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "BUILD FAILED. Your backup is at: $backup"
    exit $LASTEXITCODE
}

Write-Host "`nBUILD SUCCEEDED."
Write-Host "Backup location: $backup"
