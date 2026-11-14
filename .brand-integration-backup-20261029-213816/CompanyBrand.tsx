import { useEffect, useState } from "react";
import { KalexiMark } from "@/components/KalexiMark";

const BRAND_KEY = "kalexi-brand-settings-v2";

type BrandIdentity = {
  companyName?: string;
  legalName?: string;
  shortName?: string;
  tagline?: string;
  logo?: string;
};

function readIdentity(): BrandIdentity {
  try {
    return JSON.parse(localStorage.getItem(BRAND_KEY) || "{}");
  } catch {
    return {};
  }
}

export function CompanyBrand({
  markClassName = "h-11 w-11",
  className = "",
}: {
  markClassName?: string;
  className?: string;
}) {
  const [brand, setBrand] = useState<BrandIdentity>({});

  useEffect(() => {
    const refresh = () => setBrand(readIdentity());
    refresh();

    window.addEventListener("storage", refresh);
    window.addEventListener("kalexi:brand-updated", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("kalexi:brand-updated", refresh);
    };
  }, []);

  return (
    <div
      className={`inline-flex items-center gap-3 text-left ${className}`}
      aria-label={brand.legalName || "Kalexi Brokerage Ltd"}
    >
      {brand.logo ? (
        <img
          src={brand.logo}
          alt={brand.companyName || "Company logo"}
          className={`${markClassName} rounded-md object-contain`}
        />
      ) : (
        <KalexiMark className={markClassName} />
      )}

      <span>
        <span className="block text-sm font-bold tracking-wide">
          {brand.shortName || "KALEXI"}
        </span>
        <span className="mt-0.5 block text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          {brand.legalName || "Brokerage Ltd"}
        </span>
        {brand.tagline && (
          <span className="mt-1 block text-[10px] text-muted-foreground">
            {brand.tagline}
          </span>
        )}
      </span>
    </div>
  );
}
