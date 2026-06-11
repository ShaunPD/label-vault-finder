import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Upload, Loader2, CheckCircle2, AlertTriangle, Database, ImageIcon, Sparkles, Trash2, Pencil, X, Save, FileSpreadsheet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { scanLabel, type ScannedFields } from "@/lib/labels.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LabelVault — Scan & catalog beverage labels" },
      {
        name: "description",
        content:
          "Upload beverage label photos. LabelVault scans Brand, Class/Type, Alcohol Content, Net Contents and Government Warning, then tells you if it's already on file.",
      },
      { property: "og:title", content: "LabelVault" },
      { property: "og:description", content: "Scan beverage labels and catalog them automatically." },
    ],
  }),
  component: LabelVault,
});

type LabelRow = {
  id: string;
  brand_name: string;
  class_type: string;
  alcohol_content: string | null;
  net_contents: string | null;
  government_warning: string | null;
  image_url: string | null;
  created_at: string;
};

function LabelVault() {
  const scan = useServerFn(scanLabel);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<ScannedFields | null>(null);
  const [duplicate, setDuplicate] = useState<LabelRow | null>(null);
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [active, setActive] = useState<LabelRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadLabels = useCallback(async () => {
    const { data, error } = await supabase
      .from("labels")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error && data) setLabels(data as LabelRow[]);
  }, []);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const reset = () => {
    setFile(null);
    setFields(null);
    setDuplicate(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (id: string) => {
    setDeletingId(null);
    try {
      const { error } = await supabase.from("labels").delete().eq("id", id);
      if (error) throw error;
      toast.success("Label deleted");
      await loadLabels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const onFile = (f: File | null) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/i.test(f.type)) {
      toast.error("Please upload a .jpg or .png image");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setFile(f);
    setFields(null);
    setDuplicate(null);
  };

  const fileToDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });

  const handleScan = async () => {
    if (!file) return;
    setScanning(true);
    setFields(null);
    setDuplicate(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const result = await scan({ data: { imageDataUrl: dataUrl } });
      if (!result.brand_name || !result.class_type) {
        toast.error("Could not read Brand Name and Class/Type. Try a clearer photo.");
        setFields(result);
        return;
      }
      setFields(result);
      // duplicate check
      const { data: dup } = await supabase
        .from("labels")
        .select("*")
        .eq("brand_name_norm", result.brand_name.trim().toLowerCase())
        .eq("class_type_norm", result.class_type.trim().toLowerCase())
        .maybeSingle();
      if (dup) {
        const dupRow = dup as LabelRow;
        setDuplicate(dupRow);
        const mismatches = diffFields(result, dupRow);
        if (mismatches.length === 0) {
          toast.success("Label matches a record in the database and meets acceptance criteria");
        } else {
          toast.warning(`Label matches a record, but ${mismatches.length} field(s) differ: ${mismatches.join(", ")}`);
        }
      } else {
        toast.success("Label scanned — review and save");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  };

  const handleSave = async () => {
    if (!fields || !file) return;
    if (duplicate) {
      toast.error("Already in database — not saving");
      return;
    }
    setSaving(true);
    try {
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("labels").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from("labels").createSignedUrl(path, 60 * 60 * 24 * 365 * 10);

      const { error: insErr } = await supabase.from("labels").insert({
        brand_name: fields.brand_name,
        class_type: fields.class_type,
        alcohol_content: fields.alcohol_content || null,
        net_contents: fields.net_contents || null,
        government_warning: fields.government_warning || null,
        image_url: signed?.signedUrl ?? null,
      });
      if (insErr) {
        if (insErr.code === "23505") {
          toast.warning("That label was just added by someone else");
          await loadLabels();
          return;
        }
        throw insErr;
      }
      toast.success("Saved to LabelVault");
      reset();
      await loadLabels();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (k: keyof ScannedFields, v: string) =>
    setFields((f) => (f ? { ...f, [k]: v } : f));

  return (
    <div className="min-h-screen grid-bg">
      <header className="border-b border-border bg-background/70 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-md bg-primary/15 text-primary flex items-center justify-center glow-ring">
              <FlaskConical className="size-5" />
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight">LabelVault</h1>
              <p className="text-xs text-muted-foreground">Beverage label intake & registry</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <BulkImport onDone={loadLabels} />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="size-3.5" />
              <span className="font-mono">{labels.length} labels on file</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Upload */}
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
              1 · Upload label
            </h2>
            {file && (
              <Button variant="ghost" size="sm" onClick={reset}>
                <Trash2 className="size-3.5" /> Clear
              </Button>
            )}
          </div>

          {!previewUrl ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                onFile(e.dataTransfer.files?.[0] ?? null);
              }}
              className={`block border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-accent/30"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
              <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Upload className="size-5" />
              </div>
              <p className="text-sm font-medium">Drop a label image, or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">.jpg or .png — up to 10 MB</p>
            </label>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-lg overflow-hidden border border-border bg-black/30">
                <img src={previewUrl} alt="Label preview" className="w-full max-h-[420px] object-contain" />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ImageIcon className="size-3.5" />
                <span className="truncate font-mono">{file?.name}</span>
              </div>
              <Button onClick={handleScan} disabled={scanning} className="w-full" size="lg">
                {scanning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Scanning label…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Scan label
                  </>
                )}
              </Button>
            </div>
          )}
        </section>

        {/* Results */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground mb-4">
            2 · Extracted fields
          </h2>

          {!fields && !scanning && (
            <div className="h-[300px] flex flex-col items-center justify-center text-center text-muted-foreground">
              <FlaskConical className="size-8 mb-3 opacity-50" />
              <p className="text-sm">Scan a label to see results</p>
              <p className="text-xs mt-1 opacity-70">Brand · Class/Type · Alcohol · Net Contents · Gov. Warning</p>
            </div>
          )}

          {scanning && (
            <div className="h-[300px] flex flex-col items-center justify-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin mb-3 text-primary" />
              <p className="text-sm">Reading label…</p>
            </div>
          )}

          {fields && (
            <div className="space-y-4">
              {duplicate ? (
                (() => {
                  const mismatches = diffFields(fields, duplicate);
                  const allMatch = mismatches.length === 0;
                  return allMatch ? (
                    <div className="rounded-lg border border-success/40 bg-success/10 p-3 flex gap-3 items-start">
                      <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-success">Matches a record — meets acceptance criteria</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          All 5 fields match the record added{" "}
                          {new Date(duplicate.created_at).toLocaleDateString()}.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex gap-3 items-start">
                      <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-warning">Matches a record — does not meet acceptance criteria</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Brand + Class/Type match a record from{" "}
                          {new Date(duplicate.created_at).toLocaleDateString()}, but these fields differ:{" "}
                          <span className="text-warning font-medium">{mismatches.join(", ")}</span>.
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="rounded-lg border border-success/40 bg-success/10 p-3 flex gap-3 items-start">
                  <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-success">New label — ready to save</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Edit any field below if the scan misread it.
                    </p>
                  </div>
                </div>
              )}

              <Field label="Brand Name" value={fields.brand_name} onChange={(v) => updateField("brand_name", v)} />
              <Field label="Class / Type" value={fields.class_type} onChange={(v) => updateField("class_type", v)} />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Alcohol Content"
                  value={fields.alcohol_content}
                  onChange={(v) => updateField("alcohol_content", v)}
                />
                <Field
                  label="Net Contents"
                  value={fields.net_contents}
                  onChange={(v) => updateField("net_contents", v)}
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Government Warning
                </Label>
                <Textarea
                  rows={4}
                  className="mt-1.5 font-mono text-xs"
                  value={fields.government_warning}
                  onChange={(e) => updateField("government_warning", e.target.value)}
                />
              </div>

              {duplicate && diffFields(fields, duplicate).length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    This label matches an existing record on Brand + Class/Type, but does not meet
                    acceptance criteria. Reject this import to discard it.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      onClick={reset}
                      className="w-full"
                      size="lg"
                    >
                      <Trash2 className="size-4" /> Reject import
                    </Button>
                    <Button disabled className="w-full" size="lg">
                      Cannot save
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  onClick={handleSave}
                  disabled={saving || !!duplicate}
                  className="w-full"
                  size="lg"
                >
                  {saving ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Saving…
                    </>
                  ) : duplicate ? (
                    "Already on file — meets acceptance criteria"
                  ) : (
                    <>
                      <Database className="size-4" /> Save to LabelVault
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Registry */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">
              Registry
            </h2>
            <span className="text-xs font-mono text-muted-foreground">{labels.length} entries</span>
          </div>
          {labels.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No labels yet. Upload one above to get started.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {labels.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setActive(l)}
                  className="w-full text-left px-5 py-3 grid grid-cols-[1fr_auto] gap-4 items-center hover:bg-accent/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate flex items-center gap-2">
                      {l.brand_name}
                      {!l.image_url && (
                        <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                          No image
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.class_type}
                      {l.alcohol_content ? ` · ${l.alcohol_content}` : ""}
                      {l.net_contents ? ` · ${l.net_contents}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <RecordDialog
        record={active}
        onClose={() => setActive(null)}
        onSaved={async (updated) => {
          setActive(null);
          await loadLabels();
          toast.success(`Updated "${updated.brand_name}"`);
        }}
      />
    </div>
  );
}

const norm = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toLowerCase();

function diffFields(scanned: ScannedFields, record: LabelRow): string[] {
  const checks: Array<[string, string, string | null]> = [
    ["Brand Name", scanned.brand_name, record.brand_name],
    ["Class / Type", scanned.class_type, record.class_type],
    ["Alcohol Content", scanned.alcohol_content, record.alcohol_content],
    ["Net Contents", scanned.net_contents, record.net_contents],
    ["Government Warning", scanned.government_warning, record.government_warning],
  ];
  return checks.filter(([, a, b]) => norm(a) !== norm(b)).map(([label]) => label);
}



function Field({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input
        className="mt-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
      />
    </div>
  );
}

function RecordDialog({
  record,
  onClose,
  onSaved,
}: {
  record: LabelRow | null;
  onClose: () => void;
  onSaved: (updated: LabelRow) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<LabelRow | null>(null);

  useEffect(() => {
    setEditing(false);
    setDraft(record);
  }, [record]);

  if (!record || !draft) return null;

  const update = (k: keyof LabelRow, v: string) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const handleSave = async () => {
    if (!draft.brand_name.trim() || !draft.class_type.trim()) {
      toast.error("Brand Name and Class / Type are required");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("labels")
        .update({
          brand_name: draft.brand_name.trim(),
          class_type: draft.class_type.trim(),
          alcohol_content: draft.alcohol_content?.trim() || null,
          net_contents: draft.net_contents?.trim() || null,
          government_warning: draft.government_warning?.trim() || null,
        })
        .eq("id", draft.id)
        .select()
        .single();
      if (error) throw error;
      await onSaved(data as LabelRow);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!record} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">{record.brand_name}</DialogTitle>
          <DialogDescription>
            Added {new Date(record.created_at).toLocaleString()}
          </DialogDescription>
        </DialogHeader>

        {record.image_url ? (
          <div className="rounded-lg overflow-hidden border border-border bg-black/30">
            <img
              src={record.image_url}
              alt={`${record.brand_name} label`}
              className="w-full max-h-[320px] object-contain"
            />
          </div>
        ) : (
          <AttachImage record={record} onAttached={onSaved} />
        )}

        <div className="space-y-4">
          <Field
            label="Brand Name"
            value={draft.brand_name}
            onChange={(v) => update("brand_name", v)}
            readOnly={!editing}
          />
          <Field
            label="Class / Type"
            value={draft.class_type}
            onChange={(v) => update("class_type", v)}
            readOnly={!editing}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Alcohol Content"
              value={draft.alcohol_content ?? ""}
              onChange={(v) => update("alcohol_content", v)}
              readOnly={!editing}
            />
            <Field
              label="Net Contents"
              value={draft.net_contents ?? ""}
              onChange={(v) => update("net_contents", v)}
              readOnly={!editing}
            />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Government Warning
            </Label>
            <Textarea
              rows={4}
              className="mt-1.5 font-mono text-xs"
              value={draft.government_warning ?? ""}
              onChange={(e) => update("government_warning", e.target.value)}
              readOnly={!editing}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {editing ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setDraft(record);
                  setEditing(false);
                }}
                disabled={saving}
              >
                <X className="size-4" /> Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save changes
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <Button onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Edit
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



// --- CSV parsing (handles quoted fields, escaped quotes, newlines in quotes) ---
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(cur);
        cur = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
      } else cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const TEMPLATE_HEADERS = [
  "brand_name",
  "class_type",
  "alcohol_content",
  "net_contents",
  "government_warning",
] as const;

const TEMPLATE_CSV =
  TEMPLATE_HEADERS.join(",") +
  "\n" +
  '"Example Bourbon","Bourbon Whiskey","40% ALC/VOL (80 Proof)","750 ML","GOVERNMENT WARNING: According to the Surgeon General..."\n';

function BulkImport({ onDone }: { onDone: () => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "labelvault-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    setBusy(true);
    try {
      const name = f.name.toLowerCase();
      const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls");
      let rows: string[][];
      if (isXlsx) {
        const XLSX = await import("xlsx");
        const buf = await f.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const arr = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
        rows = arr.map((r) => (r as unknown[]).map((c) => (c == null ? "" : String(c))));
      } else {
        rows = parseCsv(await f.text());
      }
      if (rows.length < 2) throw new Error("File is empty");
      const headers = rows[0].map((h) => h.trim().toLowerCase());
      const idx = Object.fromEntries(
        TEMPLATE_HEADERS.map((h) => [h, headers.indexOf(h)]),
      ) as Record<(typeof TEMPLATE_HEADERS)[number], number>;
      if (idx.brand_name < 0 || idx.class_type < 0) {
        throw new Error("File must include brand_name and class_type columns");
      }


      let inserted = 0;
      let skipped = 0;
      const errors: string[] = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        const get = (k: (typeof TEMPLATE_HEADERS)[number]) =>
          idx[k] >= 0 ? (r[idx[k]] ?? "").trim() : "";
        const brand = get("brand_name");
        const cls = get("class_type");
        if (!brand || !cls) {
          errors.push(`Row ${i + 1}: missing brand_name or class_type`);
          continue;
        }
        // duplicate check
        const { data: dup } = await supabase
          .from("labels")
          .select("id")
          .eq("brand_name_norm", brand.toLowerCase())
          .eq("class_type_norm", cls.toLowerCase())
          .maybeSingle();
        if (dup) {
          skipped++;
          continue;
        }
        const { error } = await supabase.from("labels").insert({
          brand_name: brand,
          class_type: cls,
          alcohol_content: get("alcohol_content") || null,
          net_contents: get("net_contents") || null,
          government_warning: get("government_warning") || null,
          image_url: null,
        });
        if (error) errors.push(`Row ${i + 1}: ${error.message}`);
        else inserted++;
      }

      if (inserted > 0) toast.success(`Imported ${inserted} label${inserted === 1 ? "" : "s"}`);
      if (skipped > 0) toast.info(`Skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`);
      if (errors.length > 0) toast.warning(`${errors.length} row(s) failed — ${errors[0]}`);
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <Button variant="outline" size="sm" onClick={downloadTemplate}>
        <Download className="size-3.5" /> Template
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileSpreadsheet className="size-3.5" />}
        Bulk import
      </Button>
    </div>
  );
}

function AttachImage({
  record,
  onAttached,
}: {
  record: LabelRow;
  onAttached: (updated: LabelRow) => void | Promise<void>;
}) {
  const scan = useServerFn(scanLabel);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mismatches, setMismatches] = useState<string[] | null>(null);

  useEffect(() => {
    if (!file) return setPreviewUrl(null);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const pick = (f: File | null) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g)$/i.test(f.type)) {
      toast.error("Please upload a .jpg or .png image");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error("Image must be under 10 MB");
      return;
    }
    setFile(f);
    setMismatches(null);
  };

  const fileToDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });

  const handleVerifyAndAttach = async () => {
    if (!file) return;
    setBusy(true);
    setMismatches(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const scanned = await scan({ data: { imageDataUrl: dataUrl } });
      const diff = diffFields(scanned, record);
      if (diff.length > 0) {
        setMismatches(diff);
        toast.warning(`Image does not match record — ${diff.length} field(s) differ`);
        return;
      }
      // matches → upload and link
      const ext = file.type === "image/png" ? "png" : "jpg";
      const path = `${record.id}-${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("labels").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from("labels")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 10);

      const { data: updated, error: updErr } = await supabase
        .from("labels")
        .update({ image_url: signed?.signedUrl ?? null })
        .eq("id", record.id)
        .select()
        .single();
      if (updErr) throw updErr;
      toast.success("Image matches — record is now complete");
      await onAttached(updated as LabelRow);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="font-medium text-warning">No image attached</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload a label image to verify against this record. All 5 fields must match
            exactly to attach.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? null)}
      />

      {previewUrl && (
        <div className="rounded-md overflow-hidden border border-border bg-black/30">
          <img src={previewUrl} alt="Label preview" className="w-full max-h-[260px] object-contain" />
        </div>
      )}

      {mismatches && mismatches.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <p className="font-medium text-destructive mb-1">Image rejected — fields do not match</p>
          <p className="text-muted-foreground">
            Differing: <span className="text-destructive font-medium">{mismatches.join(", ")}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload className="size-3.5" /> {file ? "Choose different" : "Choose image"}
        </Button>
        <Button size="sm" onClick={handleVerifyAndAttach} disabled={!file || busy}>
          {busy ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Verifying…
            </>
          ) : (
            <>
              <Sparkles className="size-3.5" /> Verify & attach
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

