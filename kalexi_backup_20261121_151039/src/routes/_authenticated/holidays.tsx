import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Globe2, CalendarDays, Bell, Volume2, VolumeX, Sparkles,
  RefreshCw, Search, MoonStar, Sun, Church, Flower2
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/holidays")({
  component: GlobalHolidaysPage,
});

type Holiday = {
  date: string;
  name?: string;
  localName?: string;
  countryCode?: string;
  types?: string[];
  global?: boolean;
};

const COUNTRIES = [
  ["UG", "Uganda"], ["KE", "Kenya"], ["TZ", "Tanzania"],
  ["RW", "Rwanda"], ["CD", "Democratic Republic of the Congo"],
  ["SS", "South Sudan"], ["US", "United States"],
  ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["IN", "India"], ["JP", "Japan"], ["CN", "China"],
  ["ZA", "South Africa"], ["NG", "Nigeria"], ["GH", "Ghana"],
  ["AE", "United Arab Emirates"], ["SA", "Saudi Arabia"],
  ["FR", "France"], ["DE", "Germany"], ["BR", "Brazil"],
  ["SG", "Singapore"], ["NZ", "New Zealand"], ["PK", "Pakistan"],
  ["ID", "Indonesia"], ["MY", "Malaysia"], ["PH", "Philippines"],
  ["ES", "Spain"], ["IT", "Italy"], ["MX", "Mexico"],
] as const;

const RELIGIOUS_GUIDE = [
  { name: "Islamic observances", icon: MoonStar, color: "bg-emerald-100 text-emerald-800", detail: "Eid al-Fitr, Eid al-Adha, Islamic New Year and Mawlid. Dates can depend on local moon sightings." },
  { name: "Christian observances", icon: Church, color: "bg-sky-100 text-sky-800", detail: "Christmas, Good Friday, Easter and other observances. Some dates vary by Christian tradition." },
  { name: "Hindu observances", icon: Flower2, color: "bg-orange-100 text-orange-800", detail: "Diwali, Holi and other festivals. Dates depend on the relevant Hindu calendar and regional tradition." },
  { name: "Buddhist observances", icon: Sun, color: "bg-amber-100 text-amber-800", detail: "Vesak and other observances vary by country, tradition and lunar calendar." },
  { name: "Jewish observances", icon: MoonStar, color: "bg-indigo-100 text-indigo-800", detail: "Rosh Hashanah, Yom Kippur, Passover and other dates follow the Hebrew calendar." },
];

export function GlobalHolidaysPage() {
  const [country, setCountry] = useState("UG");
  const [year, setYear] = useState(new Date().getFullYear());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [worldwide, setWorldwide] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [activeTab, setActiveTab] = useState<"country" | "world" | "religious">("country");

  const countryName = COUNTRIES.find(([code]) => code === country)?.[1] ?? country;

  async function loadHolidays() {
    setLoading(true);
    setError("");
    try {
      const [countryResponse, worldResponse] = await Promise.all([
        fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`),
        fetch("https://date.nager.at/api/v3/NextPublicHolidaysWorldwide"),
      ]);
      if (!countryResponse.ok) throw new Error("The country holiday service is unavailable.");
      const countryData = await countryResponse.json();
      setHolidays(Array.isArray(countryData) ? countryData : []);
      if (worldResponse.ok) {
        const data = await worldResponse.json();
        setWorldwide(Array.isArray(data) ? data : []);
      } else {
        setWorldwide([]);
      }
    } catch {
      setError("Holiday data could not be loaded. Check your internet connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadHolidays(); }, [country, year]);

  const filteredHolidays = useMemo(() => holidays.filter((h) =>
    `${h.name ?? ""} ${h.localName ?? ""}`.toLowerCase().includes(search.toLowerCase())
  ), [holidays, search]);

  function playCelebration() {
    try {
      const AudioContextClass = window.AudioContext ??
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, now + index * 0.16);
        gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.16 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.23);
        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(now + index * 0.16);
        oscillator.stop(now + index * 0.16 + 0.25);
      });
      window.setTimeout(() => void ctx.close(), 1200);
    } catch {
      setNotice("Your browser blocked audio. Try pressing the celebration button again.");
    }
  }

  async function enableCelebrations() {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsEnabled(permission === "granted");
      if (permission === "granted") {
        new Notification("Kalexi Global Holidays 🌍", {
          body: "Holiday notifications are enabled on this device.",
        });
      }
    } else {
      setNotice("Browser notifications are not supported on this device.");
    }
    setSoundEnabled(true);
    playCelebration();
    setNotice("Celebration sound enabled. Browser notifications: " +
      (("Notification" in window && Notification.permission === "granted") ? "enabled." : "not permitted."));
  }

  function announceHoliday(holiday: Holiday) {
    const name = holiday.name ?? holiday.localName ?? "Public holiday";
    setNotice(`🎉 ${name} · ${holiday.date} · ${holiday.countryCode ?? country}`);
    if (notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification(`🎉 ${name}`, {
        body: `${holiday.date} · ${holiday.countryCode ?? country}`,
      });
    }
    if (soundEnabled) playCelebration();
  }

  function HolidayCard({ holiday }: { holiday: Holiday }) {
    const date = new Date(`${holiday.date}T12:00:00`);
    return (
      <button
        type="button"
        onClick={() => announceHoliday(holiday)}
        className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-100 to-sky-100 text-xl">
            🎉
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
            {holiday.countryCode ?? country}
          </span>
        </div>
        <h3 className="mt-3 font-semibold text-slate-900">{holiday.name ?? holiday.localName ?? "Holiday"}</h3>
        {holiday.localName && holiday.localName !== holiday.name && (
          <p className="mt-1 text-sm text-slate-500">{holiday.localName}</p>
        )}
        <p className="mt-3 text-sm text-slate-600">
          <CalendarDays color="#7C3AED" strokeWidth={2.2} className="mr-1 inline h-4 w-4 shrink-0" />
          {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </p>
        <p className="mt-2 text-xs text-violet-700">Click to celebrate 🔔</p>
      </button>
    );
  }

  return (
    <section className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-700 via-violet-700 to-fuchsia-600 p-6 text-white shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-8 -top-12 text-[160px] opacity-15">🌍</div>
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm">
            <Sparkles className="h-4 w-4" /> Kalexi · Global Calendar
          </div>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Global Holidays & Celebrations</h1>
          <p className="mt-2 max-w-2xl text-sm text-indigo-100 md:text-base">
            Explore public holidays worldwide and keep important cultural and religious observances in view.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={() => void loadHolidays()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 font-semibold text-indigo-800 hover:bg-indigo-50">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh holidays
            </button>
            <button onClick={() => void enableCelebrations()} className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-2.5 font-semibold hover:bg-white/20">
              <Bell color="#0891B2" strokeWidth={2.2} className="h-4 w-4 shrink-0" /> Enable celebrations
            </button>
            <button onClick={() => { setSoundEnabled(!soundEnabled); if (!soundEnabled) playCelebration(); }} className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-4 py-2.5 font-semibold hover:bg-white/20">
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              Sound {soundEnabled ? "on" : "off"}
            </button>
          </div>
        </div>
      </section>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-violet-950">
          <p>{notice}</p>
          <button onClick={() => setNotice("")} aria-label="Dismiss notification" className="font-bold">×</button>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Globe2 className="h-6 w-6 text-violet-600" />
          <p className="mt-3 text-sm text-slate-500">Country selected</p>
          <p className="text-xl font-bold text-slate-900">{countryName}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <CalendarDays color="#7C3AED" strokeWidth={2.2} className="h-6 w-6 text-sky-600 shrink-0" />
          <p className="mt-3 text-sm text-slate-500">Public holidays listed</p>
          <p className="text-xl font-bold text-slate-900">{holidays.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Sparkles className="h-6 w-6 text-amber-500" />
          <p className="mt-3 text-sm text-slate-500">Celebration settings</p>
          <p className="text-xl font-bold text-slate-900">{soundEnabled ? "Sound enabled" : "Sound muted"}</p>
          <p className="text-xs text-slate-500">{notificationsEnabled ? "Browser notifications enabled" : "Browser notifications not enabled"}</p>
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {([
          ["country", "🏳️ Country holidays"],
          ["world", "🌍 Worldwide upcoming"],
          ["religious", "🕊️ Religious observances"],
        ] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition ${activeTab === key ? "bg-slate-900 text-white shadow" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
            {label}
          </button>
        ))}
      </section>

      {activeTab === "country" && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
              Country
              <select value={country} onChange={(e) => setCountry(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900">
                {COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Year
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="mt-1.5 block rounded-xl border border-slate-300 bg-white p-3 text-slate-900">
                {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <label className="min-w-48 flex-1 text-sm font-medium text-slate-700">
              Search holidays
              <span className="relative mt-1.5 block">
                <Search color="#64748B" strokeWidth={2.2} className="absolute left-3 top-3 h-4 w-4 text-slate-400 shrink-0" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name..." className="w-full rounded-xl border border-slate-300 p-2.5 pl-9 text-slate-900" />
              </span>
            </label>
          </div>
          {loading && <p className="rounded-xl bg-white p-4 text-slate-600">Loading holiday data…</p>}
          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}
          {!loading && !error && (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredHolidays.map((h, i) => <HolidayCard key={`${h.date}-${h.name}-${i}`} holiday={h} />)}
              {filteredHolidays.length === 0 && <p className="col-span-full rounded-xl bg-white p-6 text-slate-600">No matching holidays found for this selection.</p>}
            </div>
          )}
          <p className="text-xs text-slate-500">Source: Nager.Date public-holiday API. National and regional coverage varies by country.</p>
        </section>
      )}

      {activeTab === "world" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
            This feed lists upcoming holidays worldwide, limited to the provider's next-seven-days endpoint.
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {worldwide.map((h, i) => <HolidayCard key={`${h.date}-${h.countryCode}-${i}`} holiday={h} />)}
          </div>
          {!worldwide.length && !loading && <p className="rounded-xl bg-white p-5 text-slate-600">Worldwide data is unavailable at the moment. Refresh to retry.</p>}
        </section>
      )}

      {activeTab === "religious" && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <strong>Accuracy notice:</strong> religious dates vary by tradition, country and calendar. Some require local confirmation. This guide identifies observance categories; it is not yet a verified date feed for every religion.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {RELIGIOUS_GUIDE.map(({ name, icon: Icon, color, detail }) => (
              <article key={name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-3 ${color}`}><Icon className="h-5 w-5" /></div>
                  <h3 className="font-semibold text-slate-900">{name}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{detail}</p>
                <span className="mt-3 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">Date source integration needed</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
