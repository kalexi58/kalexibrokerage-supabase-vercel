import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { useSession } from "@/hooks/useSession";
import { allows } from "@/lib/rbac";
import {
  createBrandDocumentTemplateUpload,
  deleteBrandDocumentTemplateUpload,
  getBrandDocumentTemplateFile,
} from "@/lib/brand.functions";

type Template = {
  id: string;
  name: string;
  storage_path: string;
  departments: string[];
  file_type: string;
  source: "brand" | "legacy";
};
type ClientRecord = {
  id: string;
  client_ref: string;
  full_name: string;
  email: string | null;
};
type TransactionRecord = {
  id: string;
  client_id: string | null;
  transaction_ref: string;
  amount: number;
  currency: string;
  occurred_on: string;
  purpose: string;
};

const DEPARTMENTS = [
  "Reception",
  "Brokerage",
  "Compliance",
  "Verification",
  "Risk Intelligence",
  "Finance",
  "Operations",
  "Administration",
];

export default function BrandTemplateManager() {
  const { data: session } = useSession();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [selectedTransactionId, setSelectedTransactionId] = useState("");
  const [report, setReport] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const createUpload = useServerFn(createBrandDocumentTemplateUpload);
  const deleteUpload = useServerFn(deleteBrandDocumentTemplateUpload);
  const getTemplateFile = useServerFn(getBrandDocumentTemplateFile);
  const clients = useQuery({
    queryKey: ["brand-document-clients"],
    enabled: allows(session?.access, "clients.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, client_ref, full_name, email")
        .is("archived_at", null)
        .order("full_name")
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });
  const transactions = useQuery({
    queryKey: ["brand-document-transactions"],
    enabled: allows(session?.access, "finance.view"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, client_id, transaction_ref, amount, currency, occurred_on, purpose")
        .is("archived_at", null)
        .order("occurred_on", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data;
    },
  });

  async function refresh(): Promise<boolean> {
    const [legacyResult, brandResult] = await Promise.all([
      supabase
        .from("document_templates")
        .select("id,name,storage_path,departments,file_type")
        .order("created_at", { ascending: false }),
      supabase
        .from("brand_templates")
        .select("id,name,file_path,departments,file_type")
        .not("file_path", "is", null)
        .order("updated_at", { ascending: false }),
    ]);

    if (brandResult.error) {
      setStatus(`Brand Centre templates could not be loaded: ${brandResult.error.message}`);
      return false;
    }
    const brand = (brandResult.data ?? [])
      .filter((template) => template.file_path && template.file_type)
      .map((template) => ({
        id: template.id,
        name: template.name,
        storage_path: template.file_path!,
        departments: template.departments,
        file_type: template.file_type!,
        source: "brand" as const,
      }));
    if (legacyResult.error) {
      console.error("[brand templates] Could not load older imported templates.", legacyResult.error);
      setTemplates(brand);
      setStatus("New Brand Centre templates are available; some older imported templates could not be loaded.");
      return false;
    }
    const legacy = (legacyResult.data ?? []).map((template) => ({
      ...template,
      source: "legacy" as const,
    }));
    setTemplates([...brand, ...legacy]);
    return true;
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function importTemplate() {
    if (!file || !name.trim() || departments.length === 0) {
      setStatus("Enter a name, select a file and assign at least one department.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension !== "docx" && extension !== "pdf") {
      setStatus("Supported uploads: DOCX and PDF.");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setStatus("The file must be smaller than 15 MB.");
      return;
    }

    setBusy(true);
    setStatus("");
    let uploadedPath: string | null = null;
    let saved = false;

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Sign in before importing templates.");

      const slot = await createUpload({ data: { extension } });
      uploadedPath = slot.path;
      const { error: uploadError } = await supabase.storage
        .from("kalexi-vault")
        .uploadToSignedUrl(slot.path, slot.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("brand_templates")
        .insert({
          name: name.trim(),
          kind: "document_template",
          heading: name.trim(),
          file_path: slot.path,
          file_type: extension,
          departments,
          created_by: auth.user.id,
        });

      if (insertError) throw insertError;
      saved = true;

      setName("");
      setFile(null);
      setFileInputKey((key) => key + 1);
      setDepartments([]);
      if (await refresh()) setStatus("Template imported successfully.");
    } catch (error) {
      if (uploadedPath && !saved) {
        try {
          await deleteUpload({ data: { path: uploadedPath } });
        } catch (cleanupError) {
          console.error("[brand templates] Could not clean up an unused template file.", cleanupError);
        }
      }
      setStatus(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  async function generateDocx() {
    const template = templates.find((item) => item.id === selectedId);
    if (!template) {
      setStatus("Select a template.");
      return;
    }

    if (template.file_type !== "docx") {
      setStatus("PDF templates are retained as uploaded. PDF text insertion is not enabled by this component.");
      return;
    }
    if (selectedClientId && !allows(session?.access, "clients.view")) {
      setStatus("Your role cannot use client records in generated documents.");
      return;
    }
    if (selectedTransactionId && !allows(session?.access, "finance.view")) {
      setStatus("Your role cannot use transaction records in generated documents.");
      return;
    }

    setBusy(true);
    try {
      let blob: Blob;
      if (template.source === "brand") {
        const { signedUrl } = await getTemplateFile({ data: { id: template.id } });
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error("The saved template file could not be downloaded.");
        blob = await response.blob();
      } else {
        const { data, error } = await supabase.storage
          .from("document-templates")
          .download(template.storage_path);
        if (error || !data) throw error ?? new Error("Template download failed.");
        blob = data;
      }

      const zip = new PizZip(await blob.arrayBuffer());
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      const { data: auth } = await supabase.auth.getUser();
      const client = clients.data?.find((item) => item.id === selectedClientId);
      const transaction = transactions.data?.find((item) => item.id === selectedTransactionId);
      if (selectedClientId && !client) throw new Error("The selected client is unavailable.");
      if (selectedTransactionId && !transaction) {
        throw new Error("The selected transaction is unavailable.");
      }

      doc.render({
        document_date: new Date().toLocaleDateString(),
        department: session?.profile?.department ?? "",
        prepared_by: auth.user?.email ?? "",
        report_content: report,
        client_name: client?.full_name ?? "",
        client_reference: client?.client_ref ?? "",
        client_email: client?.email ?? "",
        transaction_reference: transaction?.transaction_ref ?? "",
        transaction_amount: transaction ? String(transaction.amount) : "",
        transaction_currency: transaction?.currency ?? "",
        transaction_date: transaction?.occurred_on ?? "",
        transaction_purpose: transaction?.purpose ?? "",
      });

      const output = doc.toBlob();
      const url = URL.createObjectURL(output);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${template.name.replace(/[\\/:*?"<>|]/g, "_")}-report.docx`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Document generated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="my-6 space-y-5 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Document Templates</h2>
      <p className="text-sm">
        Import templates and assign them to departments. DOCX files can use
        {" {{document_date}}, {{department}}, {{prepared_by}}, {{report_content}}, {{client_name}}, {{client_reference}}, {{client_email}}, {{transaction_reference}}, {{transaction_amount}}, {{transaction_currency}}, {{transaction_date}}, and {{transaction_purpose}}."}
      </p>

      <div className="space-y-3">
        <input
          className="w-full rounded border p-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
        />
        <input
          key={fileInputKey}
          type="file"
          accept=".docx,.pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <p className="font-medium">Available departments</p>
        {DEPARTMENTS.map((department) => (
          <label key={department} className="flex gap-2">
            <input
              type="checkbox"
              checked={departments.includes(department)}
              onChange={(e) =>
                setDepartments((current) =>
                  e.target.checked
                    ? [...current, department]
                    : current.filter((value) => value !== department)
                )
              }
            />
            {department}
          </label>
        ))}

        <button
          type="button"
          disabled={busy}
          onClick={importTemplate}
          className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
        >
          Import Template
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void refresh()}
          className="ml-2 rounded border px-4 py-2"
        >
          Refresh
        </button>
      </div>

      <hr />

      <h3 className="font-semibold">Generate a report</h3>
      {allows(session?.access, "clients.view") ? (
        <>
          <label className="block space-y-1 text-sm">
            Client record
            <select
              className="w-full rounded border p-2"
              value={selectedClientId}
              onChange={(event) => setSelectedClientId(event.target.value)}
            >
              <option value="">No client selected</option>
              {(clients.data ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.client_ref} · {client.full_name}
                </option>
              ))}
            </select>
          </label>
          {clients.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Client records could not be loaded: {clients.error.message}
            </p>
          ) : null}
        </>
      ) : null}
      {allows(session?.access, "finance.view") ? (
        <>
          <label className="block space-y-1 text-sm">
            Transaction record
            <select
              className="w-full rounded border p-2"
              value={selectedTransactionId}
              onChange={(event) => setSelectedTransactionId(event.target.value)}
            >
              <option value="">No transaction selected</option>
              {(transactions.data ?? []).map((transaction) => (
                <option key={transaction.id} value={transaction.id}>
                  {transaction.transaction_ref} · {transaction.currency} {transaction.amount}
                </option>
              ))}
            </select>
          </label>
          {transactions.isError ? (
            <p role="alert" className="text-sm text-destructive">
              Transaction records could not be loaded: {transactions.error.message}
            </p>
          ) : null}
        </>
      ) : null}
      <select
        className="w-full rounded border p-2"
        value={selectedId}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        <option value="">Select a template</option>
        {templates.map((template) => (
          <option key={template.id} value={template.id}>
            {template.name} ({template.file_type.toUpperCase()})
          </option>
        ))}
      </select>

      <textarea
        className="min-h-32 w-full rounded border p-2"
        value={report}
        onChange={(e) => setReport(e.target.value)}
        placeholder="Enter report content"
      />

      <button
        type="button"
        disabled={busy}
        onClick={generateDocx}
        className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50"
      >
        Generate DOCX
      </button>

      {status && <p role="status" className="text-sm">{status}</p>}

      <div className="space-y-2">
        <h3 className="font-semibold">Imported templates</h3>
        {templates.map((template) => (
          <div key={template.id} className="rounded border p-3">
            <p className="font-medium">{template.name}</p>
            <p className="text-sm">
              {template.file_type.toUpperCase()} · {template.departments.join(", ")}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
