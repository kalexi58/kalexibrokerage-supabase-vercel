import { createFileRoute } from "@tanstack/react-router";
import UbcResearchPanel from "@/components/UbcResearchPanel";

export const Route = createFileRoute("/_authenticated/research/ubc")({
  component: UbcResearchPage,
});

function UbcResearchPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-8">
      <header>
        <h1 className="text-3xl font-semibold">External Research</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Public-source search and evidence collection for Kalexi Brokerage.
        </p>
      </header>
      <UbcResearchPanel />
    </main>
  );
}
