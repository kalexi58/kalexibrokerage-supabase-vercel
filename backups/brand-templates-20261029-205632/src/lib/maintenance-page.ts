export interface MaintenancePageOptions {
  configurationAvailable: boolean;
  message: string | null;
  estimatedCompletionTime: string | null;
}

const DEFAULT_MESSAGE =
  "We are currently performing scheduled system maintenance to improve the reliability, security, and performance of our services.";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function renderMaintenancePage(options: MaintenancePageOptions): string {
  const title = options.configurationAvailable
    ? "System Under Maintenance"
    : "System Temporarily Unavailable";
  const message = options.configurationAvailable
    ? DEFAULT_MESSAGE
    : "We are unable to verify system availability right now. Please try again shortly.";
  const estimate = options.estimatedCompletionTime
    ? new Date(options.estimatedCompletionTime)
    : null;
  const estimateText =
    estimate && Number.isFinite(estimate.getTime())
      ? `<p class="estimate">Estimated return: <time datetime="${escapeHtml(estimate.toISOString())}">${escapeHtml(
          estimate.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        )}</time></p>`
      : "";
  const customMessage =
    options.configurationAvailable && options.message?.trim()
      ? `<p class="custom">${escapeHtml(options.message.trim())}</p>`
      : "";
  const status = options.configurationAvailable
    ? "Maintenance in progress"
    : "Availability check unavailable";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#f6f8f7">
  <title>${title} — Kalexi Brokerage Ltd</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 28px 18px; color: #172625; background: #f6f8f7; font-family: Inter, "Segoe UI", Arial, sans-serif; }
    main { width: min(100%, 620px); padding: clamp(28px, 6vw, 56px); border: 1px solid #e1e8e5; border-radius: 20px; background: #fff; box-shadow: 0 18px 60px #173b3b12; text-align: center; }
    .brand { display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 34px; }
    .brand img { width: 44px; height: 44px; border-radius: 8px; }
    .brand strong { font-size: 14px; letter-spacing: .05em; }
    .brand span { display: block; margin-top: 3px; color: #71807c; font-size: 10px; letter-spacing: .14em; }
    .icon { display: grid; place-items: center; width: 74px; height: 74px; margin: 0 auto 22px; border-radius: 22px; color: #145453; background: #e6f1ef; }
    h1 { margin: 0; font-size: clamp(26px, 6vw, 36px); letter-spacing: -.035em; }
    .status { display: inline-flex; align-items: center; gap: 8px; margin: 18px 0 12px; padding: 8px 12px; border: 1px solid #cde6d8; border-radius: 999px; color: #226747; background: #f0faf4; font-size: 12px; font-weight: 600; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: #3a9b68; animation: pulse 1.8s ease-in-out infinite; }
    .message { margin: 12px auto 0; max-width: 480px; color: #52615d; font-size: 15px; line-height: 1.7; }
    .custom { margin: 14px auto 0; max-width: 480px; color: #52615d; font-size: 14px; line-height: 1.6; white-space: pre-wrap; }
    .thanks { margin: 10px auto 0; max-width: 470px; color: #71807c; font-size: 13px; line-height: 1.65; }
    .estimate { margin: 20px 0 0; color: #173b3b; font-size: 13px; font-weight: 600; }
    .retry { min-height: 44px; margin-top: 26px; padding: 0 20px; border: 0; border-radius: 9px; color: #fff; background: #173b3b; font: inherit; font-weight: 600; cursor: pointer; }
    .retry:hover { background: #20514f; }
    .admin-link { display: inline-block; margin: 16px 10px 0; color: #145453; font-size: 13px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
    .support { margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf0ef; color: #71807c; font-size: 12px; line-height: 1.8; }
    .support a { color: #145453; text-decoration: none; }
    @keyframes pulse { 50% { opacity: .4; transform: scale(.85); } }
    @media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
  </style>
</head>
<body>
  <main>
    <div class="brand"><img src="/favicon.png" alt=""><div><strong>KALEXI BROKERAGE LTD</strong><span>SYSTEM STATUS</span></div></div>
    <div class="icon" aria-hidden="true"><svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l2.5 2.5"/><circle cx="12" cy="12" r="9"/><path d="M4.9 4.9 3.5 3.5M19.1 4.9l1.4-1.4"/></svg></div>
    <h1>${title}</h1>
    <div class="status"><span class="dot" aria-hidden="true"></span>${status}</div>
    <p class="message">${escapeHtml(message)}</p>
    ${customMessage}
    <p class="thanks">Your access will be restored once maintenance is complete. Thank you for your patience.</p>
    ${estimateText}
    <button class="retry" type="button" onclick="location.reload()">Check availability</button>
    <div><a class="admin-link" href="/maintenance">Administrator sign-in</a></div>
    <div class="support">Need assistance? Contact Kalexi Brokerage Ltd<br><a href="mailto:info@kalexibrokerage.com">info@kalexibrokerage.com</a> · <a href="https://www.kalexibrokerage.com">www.kalexibrokerage.com</a></div>
  </main>
</body>
</html>`;
}
