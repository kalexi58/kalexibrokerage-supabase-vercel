import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import { Input } from "@/components/ui/input";

interface Hit {
  to: string;
  ref: string;
  title: string;
  kind: string;
}

export function GlobalSearch() {
  const { data: session } = useSession();
  const access = session?.access;
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const q = term.trim();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const scopes = useMemo(
    () => ({
      clients: allows(access, "clients.view"),
      opportunities: allows(access, "opportunities.view"),
      deals: allows(access, "deals.view"),
    }),
    [access],
  );

  const { data: hits = [] } = useQuery<Hit[]>({
    queryKey: ["global-search", q, scopes],
    enabled: q.length >= 2,
    queryFn: async () => {
      const like = `%${q}%`;
      const results: Hit[] = [];

      if (scopes.clients) {
        const { data } = await supabase
          .from("clients")
          .select("id, client_ref, full_name, company_name")
          .or(`full_name.ilike.${like},client_ref.ilike.${like},company_name.ilike.${like},phone.ilike.${like}`)
          .limit(5);
        for (const c of data ?? [])
          results.push({
            to: `/clients/${c.id}`,
            ref: c.client_ref,
            title: c.company_name || c.full_name,
            kind: "Client",
          });
      }

      if (scopes.opportunities) {
        const { data } = await supabase
          .from("opportunities")
          .select("id, opportunity_ref, title")
          .or(`title.ilike.${like},opportunity_ref.ilike.${like}`)
          .limit(5);
        for (const o of data ?? [])
          results.push({
            to: `/opportunities/${o.id}`,
            ref: o.opportunity_ref,
            title: o.title,
            kind: "Opportunity",
          });
      }

      if (scopes.deals) {
        const { data } = await supabase
          .from("deals")
          .select("id, deal_ref, title")
          .or(`title.ilike.${like},deal_ref.ilike.${like}`)
          .limit(5);
        for (const d of data ?? [])
          results.push({ to: `/deals/${d.id}`, ref: d.deal_ref, title: d.title, kind: "Deal" });
      }

      return results;
    },
  });

  return (
    <div ref={boxRef} className="relative">
      <Input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search records…"
        className="h-9 border-sidebar-border bg-sidebar-accent/40 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/40"
      />
      {open && q.length >= 2 ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching records</p>
          ) : (
            hits.map((h) => (
              <Link
                key={`${h.kind}-${h.to}`}
                to={h.to}
                onClick={() => {
                  setOpen(false);
                  setTerm("");
                }}
                className="block px-3 py-2 text-sm hover:bg-muted"
              >
                <span className="text-xs text-muted-foreground">{h.kind} · {h.ref}</span>
                <br />
                {h.title}
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
