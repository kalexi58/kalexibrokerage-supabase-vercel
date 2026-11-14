import { KalexiMark } from "@/components/KalexiMark";

export function CompanyBrand({
  markClassName = "h-11 w-11",
  className = "",
}: {
  markClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-3 text-left ${className}`}
      aria-label="Kalexi Brokerage Ltd"
    >
      <KalexiMark className={markClassName} />
      <span>
        <span className="block text-sm font-bold tracking-wide">KALEXI</span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-[#71807c]">
          Brokerage Ltd
        </span>
      </span>
    </div>
  );
}
