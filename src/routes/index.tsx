import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Upload, Loader2, CheckCircle2, AlertTriangle, Database, ImageIcon, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
        setDuplicate(dup as LabelRow);
        toast.warning("This label matches a record in the database");
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
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Database className="size-3.5" />
            <span className="font-mono">{labels.length} labels on file</span>
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
                <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 flex gap-3 items-start">
                  <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-warning">Matches a record in the database</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Matched on Brand + Class/Type · added{" "}
                      {new Date(duplicate.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
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
                  "Already on file"
                ) : (
                  <>
                    <Database className="size-4" /> Save to LabelVault
                  </>
                )}
              </Button>
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
                <div key={l.id} className="px-5 py-3 grid grid-cols-[1fr_auto] gap-4 items-center hover:bg-accent/20">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{l.brand_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {l.class_type}
                      {l.alcohol_content ? ` · ${l.alcohol_content}` : ""}
                      {l.net_contents ? ` · ${l.net_contents}` : ""}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground whitespace-nowrap">
                    {new Date(l.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      <Input className="mt-1.5" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
