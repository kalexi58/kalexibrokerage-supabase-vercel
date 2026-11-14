import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listAgentMessages, createMessageUpload, sendAgentMessage } from "@/lib/agent-messages.functions";
export function AgentMessages({ owner }: { owner?: string }) {
  const [body, setBody] = useState(""); const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const qc = useQueryClient(); const q = useQuery({ queryKey: ["agent-messages", owner], queryFn: () => listAgentMessages({ data: { owner } }), refetchInterval: 15000 });
  async function send() {
    setBusy(true);
    try {
      if (files.length > 5 || files.some(f => f.size > 20 * 1024 * 1024 || !/^(image|video|audio)\//.test(f.type) && f.type !== "application/pdf")) throw new Error("Choose up to five photos, videos, audio or PDFs, each under 20 MB.");
      const attachments = [];
      for (const f of files) { const s = await createMessageUpload({ data: { owner, name: f.name } }); const { error } = await supabase.storage.from("kalexi-vault").uploadToSignedUrl(s.path, s.token, f); if (error) throw error; attachments.push({ path: s.path, name: f.name, type: f.type }); }
      await sendAgentMessage({ data: { owner, body, attachments } }); setBody(""); setFiles([]); await qc.invalidateQueries({ queryKey: ["agent-messages", owner] }); toast.success("Message sent");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not send message"); } finally { setBusy(false); }
  }
  return <section className="space-y-4"><h2 className="font-display text-lg font-semibold">Company conversation</h2>
    {q.isError ? <p role="alert" className="text-destructive">Could not load messages.</p> : null}
    <div className="max-h-96 space-y-4 overflow-y-auto">{q.data?.map(m => <article key={m.id} className="border-l-2 border-primary bg-muted/50 p-3"><p className="text-xs font-semibold text-primary">{m.sender_id === m.owner_user_id ? "Agent" : "Kalexi team"}</p><p className="whitespace-pre-wrap text-sm">{m.body}</p><div className="mt-2 grid gap-2">{m.attachments.map(a => <div key={a.path}>{a.type.startsWith("image/") ? <img src={a.url} alt={a.name} className="max-h-48 max-w-full rounded-md" /> : a.type.startsWith("video/") ? <video src={a.url} controls className="max-h-56 w-full" /> : a.type.startsWith("audio/") ? <audio src={a.url} controls className="w-full" /> : <a href={a.url} target="_blank" rel="noreferrer" className="text-sm text-primary underline">{a.name}</a>}</div>)}</div><p className="mt-2 text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</p></article>)}</div>
    <Textarea aria-label="Message to company" placeholder="Write a message…" value={body} maxLength={4000} onChange={e => setBody(e.target.value)} />
    <div className="flex flex-wrap items-center gap-3"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><Paperclip size={18} />Attach files<input className="sr-only" type="file" multiple accept="image/*,video/*,audio/*,application/pdf" onChange={e => setFiles(Array.from(e.target.files ?? []))} /></label><Button disabled={busy || !body.trim() && !files.length} onClick={send}><Send size={16} />{busy ? "Sending…" : "Send"}</Button></div><p className="text-xs text-muted-foreground">{files.map(f => f.name).join(", ")}</p>
  </section>;
}