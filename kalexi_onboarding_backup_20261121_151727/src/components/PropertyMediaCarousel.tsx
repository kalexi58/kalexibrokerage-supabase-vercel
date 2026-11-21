import { useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Play } from "lucide-react";

export interface PropertyMediaItem {
  id: string;
  display_name: string;
  mime_type: string | null;
  url: string;
}

export function PropertyMediaCarousel({
  items,
  compact = false,
  label = "Property media",
}: {
  items: PropertyMediaItem[];
  compact?: boolean;
  label?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  const active = items[activeIndex];

  useEffect(() => {
    if (items.length < 2 || active?.mime_type?.startsWith("video/")) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, 4500);

    return () => window.clearInterval(timer);
  }, [items.length, activeIndex, active?.mime_type]);

  const previous = () => {
    setActiveIndex((current) => (current - 1 + items.length) % items.length);
  };

  const next = () => {
    setActiveIndex((current) => (current + 1) % items.length);
  };

  const heightClass = compact
    ? "h-48 sm:h-56"
    : "h-[280px] sm:h-[380px] lg:h-[440px]";

  if (!items.length) {
    return (
      <div className={`flex ${heightClass} items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-300 text-slate-500`}>
        <div className="flex flex-col items-center gap-2">
          <Building2 className="h-12 w-12 text-slate-400" />
          <span className="text-xs font-medium">No property images uploaded</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`group relative ${heightClass} overflow-hidden bg-slate-950`}>
      {active?.mime_type?.startsWith("video/") ? (
        <video
          key={active.id}
          src={active.url}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-contain"
          aria-label={active.display_name}
        />
      ) : active ? (
        <img
          key={active.id}
          src={active.url}
          alt={active.display_name || label}
          className={`h-full w-full ${compact ? "object-cover" : "object-contain"}`}
          loading={compact ? "lazy" : "eager"}
        />
      ) : null}

      {active?.mime_type?.startsWith("video/") ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold text-white">
          <Play className="h-3 w-3" />
          VIDEO
        </div>
      ) : null}

      {items.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous property image"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              previous();
            }}
            className="pointer-events-auto absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            aria-label="Next property image"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              next();
            }}
            className="pointer-events-auto absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white opacity-100 shadow transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="pointer-events-auto absolute bottom-3 left-0 right-0 z-20 flex justify-center gap-1.5">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show media ${index + 1}`}
                aria-current={index === activeIndex}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setActiveIndex(index);
                }}
                className={`h-2 rounded-full shadow transition-all ${index === activeIndex ? "w-6 bg-white" : "w-2 bg-white/60 hover:bg-white"}`}
              />
            ))}
          </div>

          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold text-white">
            {activeIndex + 1} / {items.length}
          </div>
        </>
      ) : null}
    </div>
  );
}
