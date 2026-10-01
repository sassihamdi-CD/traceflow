"use client";
import { useRef, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { clsx } from "clsx";

const ACCEPT = ".pdf,.xlsx,.csv";

/** Ledger-styled dropzone. Multi-file; rejects unknown types client-side before upload. */
export function UploadDropzone({ onFiles, busy }: { onFiles: (fs: File[]) => void; busy: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [rejected, setRejected] = useState("");
  function take(list: FileList | File[] | undefined) {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    const bad = files.filter((f) => !/\.(pdf|xlsx|csv)$/i.test(f.name));
    const good = files.filter((f) => /\.(pdf|xlsx|csv)$/i.test(f.name));
    setRejected(bad.length > 0 ? `${bad.map((f) => `"${f.name}"`).join(", ")} not accepted — PDF, XLSX or CSV only.` : "");
    if (good.length > 0) onFiles(good);
  }
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files); }}
        className={clsx(
          "flex w-full items-center gap-4 rounded-xl2 border border-dashed bg-parchment/60 px-5 py-4 text-left shadow-card transition-colors duration-150",
          drag ? "border-ink bg-parchment" : "border-muted/50 hover:border-ink",
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-paper">
          {busy ? <Loader2 size={20} className="animate-spin" /> : <FileUp size={20} />}
        </span>
        <span>
          <span className="block text-sm font-semibold">
            {busy ? "Extracting evidence…" : "Drop source documents, or click to browse"}
          </span>
          <span className="block font-mono text-xs text-muted">BOM · supplier declaration · certificate — PDF, XLSX, CSV · multi-select</span>
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => { take(e.target.files ?? undefined); e.target.value = ""; }}
      />
      {rejected && <p className="mt-2 text-sm font-medium text-brick">{rejected}</p>}
    </div>
  );
}
