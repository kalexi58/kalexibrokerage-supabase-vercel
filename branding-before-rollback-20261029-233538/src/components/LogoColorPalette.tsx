import { useEffect, useMemo, useState } from "react";

type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
};

function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b]
    .map(v => Math.max(0, Math.min(255, Math.round(v)))
      .toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function buildPalette(colors: string[]): Palette {
  const primary = colors[0] || "#173F35";
  const secondary = colors[1] || "#D1A85A";
  const accent = colors[2] || "#3B82F6";

  return {
    primary,
    secondary,
    accent,
    background: "#F6F8F7",
    surface: "#FFFFFF",
    text: "#17231F",
  };
}

function extractColors(image: HTMLImageElement): string[] {
  const canvas = document.createElement("canvas");
  const size = 100;
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not read image colours.");

  context.drawImage(image, 0, 0, size, size);
  const pixels = context.getImageData(0, 0, size, size).data;
  const counts = new Map<string, number>();

  for (let i = 0; i < pixels.length; i += 16) {
    const alpha = pixels[i + 3];
    if (alpha < 180) continue;

    const r = Math.round(pixels[i] / 32) * 32;
    const g = Math.round(pixels[i + 1] / 32) * 32;
    const b = Math.round(pixels[i + 2] / 32) * 32;

    const hex = rgbToHex(r, g, b);
    counts.set(hex, (counts.get(hex) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color)
    .filter(color => {
      const previous = colorsAlreadySelected;
      if (previous.includes(color)) return false;
      previous.push(color);
      return true;
    })
    .slice(0, 8);
}

let colorsAlreadySelected: string[] = [];

export default function LogoColorPalette() {
  const [preview, setPreview] = useState("");
  const [palette, setPalette] = useState<Palette | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    return () => {
      if (preview.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const variables = useMemo(() => {
    if (!palette) return {};
    return {
      "--brand-primary": palette.primary,
      "--brand-secondary": palette.secondary,
      "--brand-accent": palette.accent,
      "--brand-background": palette.background,
      "--brand-surface": palette.surface,
      "--brand-text": palette.text,
    } as React.CSSProperties;
  }, [palette]);

  async function handleLogo(file?: File) {
    setError("");
    setCopied(false);

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Logo must be smaller than 8 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      try {
        colorsAlreadySelected = [];
        const colors = extractColors(image);
        if (!colors.length) throw new Error("No usable colours found.");

        setPreview(objectUrl);
        setPalette(buildPalette(colors));
      } catch (e) {
        URL.revokeObjectURL(objectUrl);
        setError(e instanceof Error ? e.message : "Could not extract colours.");
      }
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setError("The image could not be opened.");
    };

    image.src = objectUrl;
  }

  function applyTheme() {
    if (!palette) return;

    const root = document.documentElement;
    root.style.setProperty("--brand-primary", palette.primary);
    root.style.setProperty("--brand-secondary", palette.secondary);
    root.style.setProperty("--brand-accent", palette.accent);
    root.style.setProperty("--brand-background", palette.background);
    root.style.setProperty("--brand-surface", palette.surface);
    root.style.setProperty("--brand-text", palette.text);

    root.style.setProperty("--primary", palette.primary);
    root.style.setProperty("--accent", palette.accent);
    root.style.setProperty("--background", palette.background);
    root.style.setProperty("--foreground", palette.text);
    root.style.setProperty("--card", palette.surface);

    localStorage.setItem("kalexi-generated-brand-theme", JSON.stringify(palette));
  }

  async function copyPalette() {
    if (!palette) return;
    await navigator.clipboard.writeText(JSON.stringify(palette, null, 2));
    setCopied(true);
  }

  return (
    <section className="space-y-5 rounded-2xl border bg-white p-6">
      <div>
        <h2 className="text-xl font-semibold">Logo Colour & Theme Generator</h2>
        <p className="mt-1 text-sm text-gray-500">
          Upload your company logo to generate a coordinated interface palette.
        </p>
      </div>

      <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center">
        {preview ? (
          <img src={preview} alt="Uploaded company logo" className="max-h-28 max-w-full object-contain" />
        ) : (
          <span className="text-4xl">🎨</span>
        )}
        <span className="font-medium">Choose company logo</span>
        <span className="text-xs text-gray-500">PNG, JPEG, WebP or other supported image formats</span>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={e => void handleLogo(e.target.files?.[0])}
        />
      </label>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {palette && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(palette).map(([name, color]) => (
              <div key={name} className="overflow-hidden rounded-xl border">
                <div className="h-16" style={{ backgroundColor: color }} />
                <div className="p-3">
                  <p className="text-sm capitalize">{name}</p>
                  <p className="font-mono text-xs">{color}</p>
                </div>
              </div>
            ))}
          </div>

          <div
            className="space-y-3 rounded-xl border p-5"
            style={{
              ...variables,
              backgroundColor: "var(--brand-background)",
              color: "var(--brand-text)",
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider">Live theme preview</p>
            <div className="rounded-lg p-4" style={{ background: "var(--brand-surface)" }}>
              <h3 className="font-semibold">Company dashboard</h3>
              <p className="mt-1 text-sm">Your identity, consistently applied.</p>
              <button
                type="button"
                className="mt-3 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--brand-primary)" }}
              >
                Primary action
              </button>
              <span
                className="ml-3 inline-block rounded-lg px-3 py-2 text-sm"
                style={{ backgroundColor: "var(--brand-secondary)", color: "#17231F" }}
              >
                Accent label
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={applyTheme}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Apply theme to this browser
            </button>
            <button
              type="button"
              onClick={() => void copyPalette()}
              className="rounded-lg border px-4 py-2 text-sm font-medium"
            >
              {copied ? "Copied" : "Copy palette JSON"}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Applying this theme changes CSS variables in this browser. Persistent,
            company-wide settings require integration with the existing branding
            settings and Supabase.
          </p>
        </>
      )}
    </section>
  );
}
