
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import html2canvas from "html2canvas-pro";
import { jsPDF } from "jspdf";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AgentIdCard, type CardAgent } from "@/components/AgentIdCard";
import {
  getAgentRecord,
  signAgentFiles,
  getAgentIdTheme,
} from "@/lib/agents.functions";
import { DEFAULT_AGENT_ID_THEME } from "@/lib/agent-id-theme";

type LoadedAgent = CardAgent & {
  id: string;
  photo_path?: string | null;
};

function isPrintableAgent(value: unknown): value is LoadedAgent {
  if (!value || typeof value !== "object") return false;

  const a = value as Record<string, unknown>;

  return (
    typeof a.id === "string" &&
    typeof a.full_name === "string" &&
    typeof a.agent_code === "string" &&
    typeof a.phone === "string" &&
    typeof a.referral_code === "string" &&
    typeof a.verification_token === "string" &&
    typeof a.issued_at === "string" &&
    typeof a.expires_at === "string" &&
    typeof a.status === "string"
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }

  return result;
}

/**
 * Convert modern CSS colours into browser-supported RGB colours
 * inside the html2canvas cloned document.
 */
function sanitizeHtml2CanvasColors(doc: Document) {
  const canvas = doc.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Could not initialize PDF colour conversion.");
  }

  const normalizeColor = (value: string): string => {
    if (!value || !/oklch\(/i.test(value)) return value;

    return value.replace(
      /oklch\([^)]*\)/gi,
      (color) => {
        const match = color.match(
          /^oklch\(\s*([+-]?[\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+)%?)?\s*\)$/i,
        );

        if (!match) return "rgb(0, 0, 0)";

        const lightness = Number(match[1]) / 100;
        const chroma = Number(match[2]);
        const hue = (Number(match[3]) * Math.PI) / 180;
        const alpha = match[4] === undefined
          ? 1
          : Number(match[4]) / (color.includes("%") ? 100 : 1);

        const a = chroma * Math.cos(hue);
        const b = chroma * Math.sin(hue);

        const l_ = lightness + 0.3963377774 * a + 0.2158037573 * b;
        const m_ = lightness - 0.1055613458 * a - 0.0638541728 * b;
        const s_ = lightness - 0.0894841775 * a - 1.291485548 * b;

        const l = l_ * l_ * l_;
        const m = m_ * m_ * m_;
        const s = s_ * s_ * s_;

        const linear = [
          4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
          -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
          -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
        ];

        const rgb = linear.map((v) => {
          const encoded =
            v <= 0.0031308
              ? 12.92 * v
              : 1.055 * Math.pow(Math.max(0, v), 1 / 2.4) - 0.055;

          return Math.round(Math.max(0, Math.min(1, encoded)) * 255);
        });

        return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, alpha))})`;
      },
    );
  };

  const elements = Array.from(
    doc.querySelectorAll<HTMLElement>("*"),
  );

  const colorProperties = [
    "color",
    "background-color",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "outline-color",
    "text-decoration-color",
    "column-rule-color",
    "box-shadow",
    "text-shadow",
  ];

  elements.forEach((element) => {
    const computed = doc.defaultView?.getComputedStyle(element);

    if (!computed) return;

    colorProperties.forEach((property) => {
      const value = computed.getPropertyValue(property);

      if (value && /oklch\(/i.test(value)) {
        element.style.setProperty(
          property,
          normalizeColor(value),
          "important",
        );
      }
    });

    for (let i = 0; i < computed.length; i++) {
      const property = computed.item(i);

      if (!property.startsWith("--")) continue;

      const value = computed.getPropertyValue(property);

      if (/oklch\(/i.test(value)) {
        element.style.setProperty(
          property,
          normalizeColor(value),
          "important",
        );
      }
    }
  });

  // Sanitize SVG paint attributes.
  doc.querySelectorAll("svg [fill], svg [stroke]").forEach((element) => {
    ["fill", "stroke"].forEach((attribute) => {
      const value = element.getAttribute(attribute);

      if (value && /oklch\(/i.test(value)) {
        element.setAttribute(attribute, normalizeColor(value));
      }
    });
  });
}

export function BulkAgentIdPrint() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [readyKeys, setReadyKeys] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const printRootRef = useRef<HTMLDivElement>(null);

  const agentsQuery = useQuery({
    queryKey: ["bulk-agent-id-selection"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agents")
        .select("id, full_name, agent_code, status")
        .order("full_name", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const recordsQuery = useQuery({
    queryKey: ["bulk-agent-id-records", selectedIds],
    enabled: selectedIds.length > 0,
    queryFn: async () => {
      return Promise.all(
        selectedIds.map(async (id) => {
          const record = await getAgentRecord({ data: { id } });

          if (!isPrintableAgent(record)) {
            throw new Error(
              `Agent ${id} is missing required official ID information.`,
            );
          }

          return record;
        }),
      );
    },
  });

  const loadedAgents = recordsQuery.data ?? [];

  const photoPaths = useMemo(
    () =>
      Array.from(
        new Set(
          loadedAgents
            .map((agent) => agent.photo_path)
            .filter((path): path is string => Boolean(path)),
        ),
      ),
    [loadedAgents],
  );

  const photosQuery = useQuery({
    queryKey: ["bulk-agent-id-photos", photoPaths],
    enabled: photoPaths.length > 0,
    queryFn: async () =>
      signAgentFiles({ data: { paths: photoPaths } }),
  });

  const themeQuery = useQuery({
    queryKey: ["bulk-agent-id-print-theme"],
    enabled: selectedIds.length > 0,
    queryFn: () => getAgentIdTheme(),
  });

  const theme = themeQuery.data?.theme ?? DEFAULT_AGENT_ID_THEME;

  const cardHeight = Number(theme.heightMm);
  const cardWidth = Number(theme.widthMm);

  const printableHeight = 281;
  const cardGap = 3;

  const cardsPerPage = Math.max(
    1,
    Math.floor(
      (printableHeight + cardGap) / (cardHeight + cardGap),
    ),
  );

  const batches = useMemo(
    () => chunk(loadedAgents, cardsPerPage),
    [loadedAgents, cardsPerPage],
  );

  useEffect(() => {
    setReadyKeys(new Set());
  }, [selectedIds.join("|")]);

  const toggleAgent = (id: string, checked: boolean) => {
    setSelectedIds((previous) =>
      checked
        ? Array.from(new Set([...previous, id]))
        : previous.filter((item) => item !== id),
    );
  };

  const allIds = (agentsQuery.data ?? []).map((agent) => agent.id);

  const allSelected =
    allIds.length > 0 &&
    allIds.every((id) => selectedIds.includes(id));

  const markReady = useCallback(
    (
      key: string,
      download: (() => Promise<void>) | null,
    ) => {
      if (!download) return;

      setReadyKeys((previous) => {
        if (previous.has(key)) return previous;

        const next = new Set(previous);
        next.add(key);

        return next;
      });
    },
    [],
  );

  const expectedReady = loadedAgents.length * 2;

  const busy =
    recordsQuery.isLoading ||
    photosQuery.isLoading ||
    themeQuery.isLoading ||
    loadedAgents.length === 0 ||
    readyKeys.size < expectedReady ||
    generating;

  const handleDownloadPdf = async () => {
    const root = printRootRef.current;

    if (!root || loadedAgents.length === 0) {
      toast.error("There are no agent IDs ready to download.");
      return;
    }

    if (readyKeys.size < expectedReady) {
      toast.error("Wait for all QR codes and barcodes to finish loading.");
      return;
    }

    if (!themeQuery.data) {
      toast.error("Card Designer settings are not ready.");
      return;
    }

    if (recordsQuery.isError || photosQuery.isError) {
      toast.error("Some agent information could not be loaded.");
      return;
    }

    const pages = Array.from(
      root.querySelectorAll<HTMLElement>(".bulk-print-page"),
    );

    if (pages.length === 0) {
      toast.error("No PDF pages were found.");
      return;
    }

    const images = Array.from(root.querySelectorAll("img"));

    const failedImage = images.some(
      (image) => !image.complete || image.naturalWidth === 0,
    );

    if (failedImage) {
      toast.error("An image has not loaded. Check the logo and agent photos.");
      return;
    }

    setGenerating(true);

    const loadingToast = toast.loading("Preparing your agent ID PDF...");

    try {
      await document.fonts.ready;

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = 194;
      const pageHeight = 281;
      const margin = 8;

      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];

        toast.loading(
          `Generating PDF page ${index + 1} of ${pages.length}...`,
          { id: loadingToast },
        );

        const canvas = await html2canvas(page, {
          scale: 3,
          useCORS: true,
          allowTaint: false,
          backgroundColor: "#ffffff",
          logging: false,
          imageTimeout: 30000,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDocument) => {
            sanitizeHtml2CanvasColors(clonedDocument);

            const clonedPage = clonedDocument.querySelector(
              `[data-pdf-page="${index}"]`,
            ) as HTMLElement | null;

            if (clonedPage) {
              clonedPage.style.width = "194mm";
              clonedPage.style.minWidth = "194mm";
              clonedPage.style.height = "281mm";
              clonedPage.style.minHeight = "281mm";
              clonedPage.style.maxHeight = "281mm";
              clonedPage.style.overflow = "hidden";
              clonedPage.style.background = "#ffffff";
              clonedPage.style.display = "flex";
              clonedPage.style.flexDirection = "column";
            }
          },
        });

        if (!canvas.width || !canvas.height) {
          throw new Error(`Could not capture PDF page ${index + 1}.`);
        }

        const imageData = canvas.toDataURL("image/jpeg", 0.95);

        if (index > 0) {
          pdf.addPage("a4", "portrait");
        }

        pdf.addImage(
          imageData,
          "JPEG",
          margin,
          margin,
          pageWidth,
          pageHeight,
          undefined,
          "FAST",
        );

        canvas.width = 0;
        canvas.height = 0;
      }

      const filename = `Kalexi-Agent-IDs-${new Date()
        .toISOString()
        .slice(0, 10)}.pdf`;

      pdf.save(filename);

      toast.success(
        `PDF downloaded successfully. ${pages.length} pages generated.`,
        { id: loadingToast },
      );
    } catch (error) {
      console.error("Agent ID PDF generation failed:", error);

      toast.error(
        error instanceof Error
          ? error.message
          : "Could not generate the PDF.",
        { id: loadingToast },
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section className="mb-6 rounded-xl border bg-white p-5 shadow-sm">
      <style>{`
        .bulk-print-root {
          display: block;
          position: relative;
          width: 100%;
          max-height: 75vh;
          overflow-y: auto;
          overflow-x: auto;
          padding: 16px;
          margin-top: 20px;
          background: #e5e7eb;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          scrollbar-width: auto;
          overscroll-behavior: contain;
        }

        .bulk-print-page {
          display: flex;
          flex-direction: column;
          flex-wrap: nowrap;
          align-items: flex-start;
          gap: 3mm;
          width: 194mm;
          min-width: 194mm;
          height: 281mm;
          min-height: 281mm;
          max-height: 281mm;
          box-sizing: border-box;
          padding: 0;
          margin: 0 auto 20px auto;
          background: white;
          box-shadow: 0 2px 10px rgba(0,0,0,.12);
          overflow: hidden;
        }

        .bulk-print-page > .agent-id-set {
          display: contents !important;
        }

        .bulk-print-page .agent-id {
          display: flex;
          flex-direction: column;
          flex: 0 0 auto !important;
          width: ${cardWidth}mm !important;
          min-width: ${cardWidth}mm !important;
          max-width: ${cardWidth}mm !important;
          height: ${cardHeight}mm !important;
          min-height: ${cardHeight}mm !important;
          max-height: ${cardHeight}mm !important;
          box-sizing: border-box !important;
          margin: 0 !important;
          border-radius: ${Number(theme.radiusMm)}mm !important;
          overflow: hidden !important;
        }

        .bulk-print-page[data-side="front"] .agent-id-back {
          display: none !important;
        }

        .bulk-print-page[data-side="back"] .agent-id-front {
          display: none !important;
        }

        .bulk-print-page .no-print {
          display: none !important;
        }

        .bulk-print-heading {
          display: block;
          width: 100%;
          font-size: 12px;
          font-weight: 700;
          padding-bottom: 8px;
          border-bottom: 1px solid #ddd;
          color: #333;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }

          html,
          body {
            width: auto !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: white !important;
          }

          body * {
            visibility: hidden !important;
          }

          .bulk-print-root,
          .bulk-print-root * {
            visibility: visible !important;
          }

          .bulk-print-root {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-height: none !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            margin: 0 !important;
            border: 0 !important;
            background: white !important;
          }

          .bulk-print-page {
            display: flex !important;
            flex-direction: column !important;
            flex-wrap: nowrap !important;
            align-items: flex-start !important;
            justify-content: flex-start !important;
            gap: 3mm !important;
            width: 100% !important;
            height: 281mm !important;
            min-height: 281mm !important;
            max-height: 281mm !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            box-shadow: none !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            page-break-after: always !important;
          }

          .bulk-print-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }

          .bulk-print-heading {
            display: none !important;
          }

          .bulk-print-page .agent-id {
            flex: 0 0 auto !important;
            width: ${cardWidth}mm !important;
            min-width: ${cardWidth}mm !important;
            max-width: ${cardWidth}mm !important;
            height: ${cardHeight}mm !important;
            min-height: ${cardHeight}mm !important;
            max-height: ${cardHeight}mm !important;
            margin: 0 !important;
            box-sizing: border-box !important;
            break-inside: avoid !important;
            page-break-inside: avoid !important;
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }

          .bulk-print-page[data-side="front"] .agent-id-back {
            display: none !important;
          }

          .bulk-print-page[data-side="back"] .agent-id-front {
            display: none !important;
          }

          .bulk-print-page .no-print {
            display: none !important;
          }

          img, svg {
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">
            Bulk Agent ID Printing
          </h2>
          <p className="text-sm text-muted-foreground">
            Fronts print first. Matching backs print afterwards.
          </p>
        </div>

        <Button
          type="button"
          disabled={
            selectedIds.length === 0 ||
            busy ||
            recordsQuery.isError ||
            themeQuery.isError ||
            photosQuery.isError
          }
          onClick={handleDownloadPdf}
        >
          {generating
            ? "Generating PDF..."
            : `Download PDF (${selectedIds.length} agents)`}
        </Button>
      </div>

      <div className="mt-4 flex items-center gap-2 border-b pb-3">
        <input
          id="bulk-agent-select-all"
          type="checkbox"
          checked={allSelected}
          onChange={(event) =>
            setSelectedIds(event.target.checked ? allIds : [])
          }
        />

        <label
          htmlFor="bulk-agent-select-all"
          className="cursor-pointer text-sm font-medium"
        >
          Select all official agents
        </label>
      </div>

      {agentsQuery.isLoading && (
        <p className="py-4 text-sm text-muted-foreground">
          Loading official agents...
        </p>
      )}

      {agentsQuery.isError && (
        <p className="py-4 text-sm text-red-600">
          Could not load agents: {agentsQuery.error.message}
        </p>
      )}

      <div className="mt-3 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
        {(agentsQuery.data ?? []).map((agent) => (
          <label
            key={agent.id}
            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 hover:bg-muted/40"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(agent.id)}
              onChange={(event) =>
                toggleAgent(agent.id, event.target.checked)
              }
            />

            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {agent.full_name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {agent.agent_code} · {agent.status}
              </span>
            </span>
          </label>
        ))}
      </div>

      {recordsQuery.isError && (
        <p className="mt-3 text-sm text-red-600">
          {recordsQuery.error.message}
        </p>
      )}

      {themeQuery.isError && (
        <p className="mt-3 text-sm text-red-600">
          Could not load saved Card Designer settings.
        </p>
      )}

      {photosQuery.isError && (
        <p className="mt-3 text-sm text-red-600">
          Could not load agent photos.
        </p>
      )}

      {selectedIds.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {recordsQuery.isLoading
            ? "Preparing agent ID cards..."
            : `Cards ready: ${Math.floor(readyKeys.size / 2)} of ${loadedAgents.length} agents`}
          {" · "}
          {batches.length} front page(s) and {batches.length} back page(s)
        </p>
      )}

      <div
        ref={printRootRef}
        className="bulk-print-root"
        aria-label="Agent ID print preview"
      >
        {selectedIds.length === 0 && (
          <p className="py-10 text-center text-sm text-gray-500">
            Select agents above to see the front and back print preview.
          </p>
        )}

        {/* FRONT PAGES */}
        {batches.map((batch, pageIndex) => (
          <section
            key={`front-${pageIndex}`}
            className="bulk-print-page"
            data-side="front"
            data-pdf-page={pageIndex}
          >
            <div className="bulk-print-heading">
              FRONT VIEWS · PAGE {pageIndex + 1}
            </div>

            {batch.map((agent) => (
              <AgentIdCard
                key={`front-${agent.id}`}
                agent={agent}
                photoUrl={
                  agent.photo_path
                    ? photosQuery.data?.[agent.photo_path] ?? null
                    : null
                }
                bulkPrint
                onDownloadReady={(download) =>
                  markReady(`front-${agent.id}`, download)
                }
              />
            ))}
          </section>
        ))}

        {/* BACK PAGES */}
        {batches.map((batch, pageIndex) => (
          <section
            key={`back-${pageIndex}`}
            className="bulk-print-page"
            data-side="back"
            data-pdf-page={batches.length + pageIndex}
          >
            <div className="bulk-print-heading">
              BACK VIEWS · PAGE {pageIndex + 1}
            </div>

            {batch.map((agent) => (
              <AgentIdCard
                key={`back-${agent.id}`}
                agent={agent}
                photoUrl={
                  agent.photo_path
                    ? photosQuery.data?.[agent.photo_path] ?? null
                    : null
                }
                bulkPrint
                onDownloadReady={(download) =>
                  markReady(`back-${agent.id}`, download)
                }
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

