import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCompanyBranding } from "@/lib/brand.functions";

export function KalexiMark({ className = "h-8 w-8" }: { className?: string }) {
  const getBranding = useServerFn(getCompanyBranding);
  const { data: branding } = useQuery({
    queryKey: ["company-branding"],
    queryFn: () => getBranding({ data: undefined }),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (!branding) return;
    document.documentElement.style.setProperty("--company-primary", branding.primaryColor);
    document.documentElement.style.setProperty("--company-accent", branding.accentColor);
  }, [branding]);

  return (
    <img
      src={branding?.logoUrl ?? "/favicon.png"}
      alt="Kalexi Brokerage Ltd"
      className={`${className} rounded-md object-contain`}
      loading="eager"
    />
  );
}
