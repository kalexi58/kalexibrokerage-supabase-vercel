import { useEffect, useState } from "react";

type Holiday = {
  date: string;
  name: string;
  country: string;
  category: "Public" | "Christian" | "Muslim";
  tentative?: boolean;
};

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function religiousHolidays(year: number): Holiday[] {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(easter.getUTCDate() - 2);

  const christian: Holiday[] = [
    { date: dateKey(goodFriday), name: "Good Friday ✝️", country: "Worldwide observance", category: "Christian" },
    { date: dateKey(easter), name: "Easter Sunday ✝️", country: "Worldwide observance", category: "Christian" },
    { date: `${year}-12-25`, name: "Christmas Day 🎄", country: "Worldwide observance", category: "Christian" },
  ];

  const muslim: Holiday[] = [];
  try {
    const hijri = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
    });

    const months = [
      "shawwal",
      "dhū al-ḥijja",
      "dhu al-hijja",
      "dhuʻl-ḥijja",
      "dhul hijjah",
    ];

    for (let day = 1; day <= 366; day++) {
      const date = new Date(Date.UTC(year, 0, day));
      if (date.getUTCFullYear() !== year) break;

      const parts = hijri.formatToParts(date);
      const dayPart = Number(parts.find((p) => p.type === "day")?.value);
      const monthPart = (parts.find((p) => p.type === "month")?.value ?? "").toLowerCase();
      const monthIndex = months.findIndex((m) => monthPart.includes(m));

      if (dayPart === 1 && monthPart.toLowerCase().includes("shawwal")) {
        muslim.push({
          date: dateKey(date),
          name: "Eid al-Fitr 🕌",
          country: "Islamic observance",
          category: "Muslim",
          tentative: true,
        });
      }

      if (dayPart === 10 && (monthIndex > 0 || monthPart.includes("hijja") || monthPart.includes("ḥijja"))) {
        muslim.push({
          date: dateKey(date),
          name: "Eid al-Adha 🕌",
          country: "Islamic observance",
          category: "Muslim",
          tentative: true,
        });
      }
    }
  } catch {
    // Browser does not support this Islamic calendar implementation.
  }

  return [...christian, ...muslim];
}

export default function HolidayLoginAnnouncement() {
  const [holiday, setHoliday] = useState<Holiday | null>(null);
  const [visible, setVisible] = useState(false);
  const [soundReady, setSoundReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkHoliday() {
      const today = dateKey(new Date());
      const year = Number(today.slice(0, 4));

      const holidays: Holiday[] = religiousHolidays(year);

      const countries = [
        { code: "UG", label: "Uganda 🇺🇬" },
        { code: "US", label: "United States 🇺🇸" },
      ];

      const responses = await Promise.allSettled(
        countries.map(async ({ code, label }) => {
          const response = await fetch(
            `https://date.nager.at/api/v3/PublicHolidays/${year}/${code}`
          );
          if (!response.ok) throw new Error(`Holiday API failed for ${code}`);
          const data = await response.json();
          return (data as Array<{ date: string; name: string; localName?: string }>).map((item) => ({
            date: item.date,
            name: `${item.localName || item.name} · ${label}`,
            country: label,
            category: "Public" as const,
          }));
        })
      );

      for (const result of responses) {
        if (result.status === "fulfilled") holidays.push(...result.value);
      }

      if (cancelled) return;

      const todaysHoliday = holidays.find((item) => item.date === today);
      if (!todaysHoliday) return;

      setHoliday(todaysHoliday);

      const key = `kalexi-holiday-announced-${today}-${todaysHoliday.name}`;
      if (sessionStorage.getItem(key)) return;

      sessionStorage.setItem(key, "shown");
      setVisible(true);

      if ("Notification" in window && Notification.permission === "granted") {
        new Notification(`🎉 ${todaysHoliday.name}`, {
          body: "Kalexi wishes you a happy holiday!",
        });
      }
    }

    void checkHoliday().catch(() => {
      // Do not block login if a holiday provider is unavailable.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function playCelebration() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) return;

      const context = new AudioContextClass();
      const start = context.currentTime;

      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const time = start + index * 0.14;

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.09, time + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + 0.24);
      });

      window.setTimeout(() => void context.close(), 1100);
      setSoundReady(true);
    } catch {
      setSoundReady(false);
    }
  }

  if (!visible || !holiday) return null;

  return (
    <div role="status" aria-live="polite" className="fixed right-4 top-4 z-[9999] w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-amber-200 bg-white shadow-2xl">
      <div className="bg-gradient-to-r from-violet-700 via-fuchsia-600 to-amber-500 p-4 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold opacity-90">🌍 KALEXI CELEBRATES</p>
            <h2 className="mt-1 text-xl font-bold">🎉 Happy {holiday.name}!</h2>
            <p className="mt-2 text-sm">{holiday.category} holiday</p>
          </div>
          <button type="button" aria-label="Dismiss announcement" onClick={() => setVisible(false)} className="rounded-lg px-2 py-1 text-xl hover:bg-white/20">×</button>
        </div>
      </div>
      <div className="p-4">
        <p className="text-sm leading-6 text-slate-700">
          Wishing you a peaceful and joyful holiday. From everyone at Kalexi.
        </p>
        {holiday.tentative && (
          <p className="mt-2 text-xs text-amber-700">
            Islamic calendar estimate. The confirmed date may vary with local moon sightings.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={playCelebration} className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800">
            🔔 Play celebration sound
          </button>
          <button type="button" onClick={() => setVisible(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Close
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {soundReady ? "Celebration sound played." : "Press the sound button to play audio; browsers restrict automatic sound."}
        </p>
      </div>
    </div>
  );
}
