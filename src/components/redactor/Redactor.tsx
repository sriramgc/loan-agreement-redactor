import { useMemo, useRef, useState } from "react";
import { FileUp, FileText, ShieldCheck, Download, ArrowLeft, Loader2, Plus, X, Square, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { analyze, mergeDetections, ENTITY_LABELS, type EntityType } from "@/lib/pii/recognizers";
import { presidioAnalyze, presidioHealth } from "@/lib/pii/presidio";
import { loadPdf, spanToBoxes, buildRedactedPdf, makeSamplePdf, type PageData, type Box } from "@/lib/pii/pdf";

type Finding = {
  id: string;
  page: number;
  type: EntityType;
  text: string;
  score: number;
  source: string;
  boxes: Box[];
  approved: boolean;
};

const TYPE_COLOR: Record<EntityType, string> = {
  PERSON: "var(--chart-1)",
  EMAIL: "var(--chart-2)",
  PHONE: "var(--chart-2)",
  ADDRESS: "var(--chart-4)",
  US_SSN: "var(--destructive)",
  US_EIN: "var(--destructive)",
  DATE_OF_BIRTH: "var(--destructive)",
  IBAN: "var(--chart-5)",
  SWIFT: "var(--chart-5)",
  ABA_ROUTING: "var(--chart-5)",
  ACCOUNT_NO: "var(--chart-5)",
  CREDIT_CARD: "var(--chart-5)",
  LOANIQ_ID: "var(--chart-3)",
  CUSIP: "var(--chart-3)",
  CUSTOM: "var(--primary)",
};

type Stage = "upload" | "analyzing" | "review" | "done";

export default function Redactor() {
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [pages, setPages] = useState<PageData[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [engine, setEngine] = useState<"builtin" | "presidio">("builtin");
  const [presidioUrl, setPresidioUrl] = useState("http://localhost:5002");
  const [health, setHealth] = useState<null | boolean>(null);
  const [error, setError] = useState("");
  const [deny, setDeny] = useState<string[]>([]);
  const [denyInput, setDenyInput] = useState("");
  const [minScore, setMinScore] = useState(0.5);
  const [labels, setLabels] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [result, setResult] = useState<{ url: string; counts: [string, number][] } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function detect(ps: PageData[], denyList: string[], keepManual: Finding[] = []) {
    const all: Finding[] = [];
    for (const p of ps) {
      let dets = analyze(p.text, denyList);
      if (engine === "presidio") {
        const extra = await presidioAnalyze(presidioUrl, p.text);
        dets = mergeDetections([...dets, ...extra]);
      }
      dets.forEach((d, i) =>
        all.push({
          id: `${p.index}-${i}-${d.start}`,
          page: p.index,
          type: d.type,
          text: p.text.slice(d.start, d.end),
          score: d.score,
          source: d.source,
          boxes: spanToBoxes(p, d.start, d.end),
          approved: d.score >= 0.6,
        }),
      );
    }
    return [...all, ...keepManual];
  }

  async function start(bytes: ArrayBuffer, name: string) {
    setError("");
    setFileName(name);
    setStage("analyzing");
    try {
      const ps = await loadPdf(bytes);
      if (!ps.some((p) => p.text.trim())) throw new Error("No selectable text found — scanned PDFs aren't supported in this demo.");
      setPages(ps);
      setFindings(await detect(ps, deny));
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage("upload");
    }
  }

  async function rerun(nextDeny: string[]) {
    setBusy(true);
    try {
      const manual = findings.filter((f) => f.source === "manual");
      const prev = new Map(findings.map((f) => [`${f.page}|${f.text}|${f.type}`, f.approved]));
      const next = await detect(pages, nextDeny, manual);
      setFindings(next.map((f) => ({ ...f, approved: prev.get(`${f.page}|${f.text}|${f.type}`) ?? f.approved })));
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => findings.filter((f) => f.score >= minScore), [findings, minScore]);
  const groups = useMemo(() => {
    const m = new Map<EntityType, Finding[]>();
    for (const f of visible) m.set(f.type, [...(m.get(f.type) ?? []), f]);
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visible]);
  const approvedCount = visible.filter((f) => f.approved).length;

  const toggle = (id: string, v?: boolean) =>
    setFindings((fs) => fs.map((f) => (f.id === id ? { ...f, approved: v ?? !f.approved } : f)));
  const setGroup = (t: EntityType, v: boolean) =>
    setFindings((fs) => fs.map((f) => (f.type === t && f.score >= minScore ? { ...f, approved: v } : f)));

  async function generate() {
    setBusy(true);
    try {
      const chosen = visible.filter((f) => f.approved);
      const boxes = chosen.flatMap((f) => f.boxes.map((b) => ({ ...b, page: f.page, label: ENTITY_LABELS[f.type].toUpperCase() })));
      const bytes = await buildRedactedPdf(pages, boxes, labels);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const counts = new Map<string, number>();
      chosen.forEach((f) => counts.set(ENTITY_LABELS[f.type], (counts.get(ENTITY_LABELS[f.type]) ?? 0) + 1));
      setResult({ url, counts: [...counts.entries()] });
      setStage("done");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b bg-primary px-6 py-3 text-primary-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-accent" />
          <span className="font-semibold tracking-tight">Redact</span>
          <span className="text-sm opacity-60">· Credit agreement PII redaction</span>
        </div>
        <span className="font-mono text-xs opacity-70">
          {engine === "builtin" ? "Local rules · no data leaves this browser" : `Presidio @ ${presidioUrl}`}
        </span>
      </header>

      {stage === "upload" && (
        <main className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-3xl font-semibold tracking-tight">Redact a credit agreement</h1>
          <p className="mt-2 text-muted-foreground">
            Find names, account numbers, tax IDs, LoanIQ identifiers and contact details. Review every finding before the redacted PDF is created.
          </p>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) f.arrayBuffer().then((b) => start(b, f.name));
            }}
            className="mt-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed bg-card p-12 text-center transition-colors hover:border-accent"
          >
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <div className="font-medium">Drop a PDF here or click to choose</div>
            <div className="text-sm text-muted-foreground">Text-based PDFs only</div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) f.arrayBuffer().then((b) => start(b, f.name));
              }}
            />
          </div>
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={async () => start(await makeSamplePdf(), "sample-credit-agreement.pdf")}>
              <FileText className="h-4 w-4" /> Load sample agreement
            </Button>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

          <section className="mt-10 rounded-lg border bg-card p-5">
            <div className="text-sm font-semibold">Detection engine</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["builtin", "presidio"] as const).map((e) => (
                <button
                  key={e}
                  onClick={() => setEngine(e)}
                  className={`rounded-md border p-3 text-left text-sm transition-colors ${engine === e ? "border-accent bg-accent/10" : "hover:bg-muted"}`}
                >
                  <div className="font-medium">{e === "builtin" ? "Built-in rules" : "Presidio (self-hosted)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e === "builtin" ? "Runs fully in this browser, offline" : "Better names/addresses; runs on your own server"}
                  </div>
                </button>
              ))}
            </div>
            {engine === "presidio" && (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <Input value={presidioUrl} onChange={(e) => setPresidioUrl(e.target.value)} className="font-mono" />
                  <Button variant="secondary" onClick={async () => setHealth(await presidioHealth(presidioUrl))}>
                    Test connection
                  </Button>
                </div>
                {health !== null && (
                  <p className={health ? "text-success" : "text-destructive"}>{health ? "Connected" : "Not reachable (check it's running and allows this site)"}</p>
                )}
                <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">docker run -p 5002:3000 mcr.microsoft.com/presidio-analyzer</pre>
                <p className="text-xs text-muted-foreground">
                  Text is sent only to this address. The server must allow cross-origin requests from this site (e.g. via a small proxy).
                </p>
              </div>
            )}
          </section>
        </main>
      )}

      {stage === "analyzing" && (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" /> Reading and scanning {fileName}…
        </div>
      )}

      {stage === "review" && (
        <div className="grid h-[calc(100vh-49px)] grid-cols-[1fr_400px]">
          <div className="overflow-y-auto bg-paper p-6">
            <div className="mx-auto flex max-w-3xl flex-col gap-6">
              {pages.map((p) => (
                <PageView
                  key={p.index}
                  page={p}
                  findings={visible.filter((f) => f.page === p.index)}
                  active={active}
                  drawMode={drawMode}
                  onToggle={(id) => {
                    setActive(id);
                    toggle(id);
                  }}
                  onDraw={(b) =>
                    setFindings((fs) => [
                      ...fs,
                      { id: `m-${Date.now()}`, page: p.index, type: "CUSTOM", text: "Manual area", score: 1, source: "manual", boxes: [b], approved: true },
                    ])
                  }
                />
              ))}
            </div>
          </div>

          <aside className="flex flex-col border-l bg-card">
            <div className="border-b p-4">
              <div className="flex items-center justify-between">
                <button onClick={() => setStage("upload")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> New file
                </button>
                <span className="truncate pl-2 font-mono text-xs text-muted-foreground">{fileName}</span>
              </div>
              <div className="mt-3 text-2xl font-semibold">
                {approvedCount}
                <span className="text-base font-normal text-muted-foreground"> / {visible.length} to redact</span>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Min. confidence</span>
                  <span className="font-mono">{minScore.toFixed(2)}</span>
                </div>
                <Slider className="mt-2" min={0} max={1} step={0.05} value={[minScore]} onValueChange={(v) => setMinScore(v[0] ?? 0)} />
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  placeholder="Always redact term (e.g. borrower name)"
                  value={denyInput}
                  onChange={(e) => setDenyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && document.getElementById("add-deny")?.click()}
                />
                <Button
                  id="add-deny"
                  size="icon"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    if (!denyInput.trim()) return;
                    const d = [...deny, denyInput.trim()];
                    setDeny(d);
                    setDenyInput("");
                    rerun(d);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {deny.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {deny.map((d) => (
                    <span key={d} className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
                      {d}
                      <X
                        className="h-3 w-3 cursor-pointer"
                        onClick={() => {
                          const n = deny.filter((x) => x !== d);
                          setDeny(n);
                          rerun(n);
                        }}
                      />
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant={drawMode ? "default" : "outline"} onClick={() => setDrawMode(!drawMode)}>
                  <Square className="h-3.5 w-3.5" /> {drawMode ? "Drawing… drag on page" : "Draw box"}
                </Button>
                <Button size="sm" variant={labels ? "default" : "outline"} onClick={() => setLabels(!labels)}>
                  <Tag className="h-3.5 w-3.5" /> {labels ? "Type labels" : "Black boxes"}
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {groups.map(([type, items]) => (
                <div key={type} className="border-b">
                  <div className="sticky top-0 flex items-center justify-between bg-secondary px-4 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: TYPE_COLOR[type] }} />
                      {ENTITY_LABELS[type]} <span className="text-muted-foreground">({items.length})</span>
                    </span>
                    <span className="flex gap-2 text-xs">
                      <button className="hover:underline" onClick={() => setGroup(type, true)}>All</button>
                      <button className="hover:underline" onClick={() => setGroup(type, false)}>None</button>
                    </span>
                  </div>
                  {items.map((f) => (
                    <label
                      key={f.id}
                      onMouseEnter={() => setActive(f.id)}
                      onClick={() => document.getElementById(`mark-${f.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
                      className={`flex cursor-pointer items-start gap-3 px-4 py-2 text-sm hover:bg-muted ${active === f.id ? "bg-muted" : ""}`}
                    >
                      <Checkbox className="mt-0.5" checked={f.approved} onCheckedChange={(v) => toggle(f.id, !!v)} />
                      <div className="min-w-0 flex-1">
                        <div className={`truncate font-mono text-xs ${f.approved ? "" : "text-muted-foreground line-through"}`}>{f.text}</div>
                        <div className="text-xs text-muted-foreground">
                          p.{f.page + 1} · {Math.round(f.score * 100)}% · {f.source}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
              {groups.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nothing found above this confidence.</p>}
            </div>

            <div className="border-t p-4">
              <Button className="w-full" disabled={busy || approvedCount === 0} onClick={generate}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Generate redacted PDF ({approvedCount})
              </Button>
            </div>
          </aside>
        </div>
      )}

      {stage === "done" && result && (
        <div className="grid h-[calc(100vh-49px)] grid-cols-[1fr_320px]">
          <iframe title="Redacted PDF" src={result.url} className="h-full w-full bg-paper" />
          <aside className="border-l bg-card p-5">
            <div className="flex items-center gap-2 text-success">
              <ShieldCheck className="h-5 w-5" /> <span className="font-semibold">Redaction complete</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Pages are flattened, so no hidden text remains under the boxes.</p>
            <ul className="mt-4 space-y-1 text-sm">
              {result.counts.map(([k, v]) => (
                <li key={k} className="flex justify-between border-b py-1">
                  <span>{k}</span>
                  <span className="font-mono">{v}</span>
                </li>
              ))}
            </ul>
            <Button asChild className="mt-6 w-full">
              <a href={result.url} download={fileName.replace(/\.pdf$/i, "") + "-redacted.pdf"}>
                <Download className="h-4 w-4" /> Download PDF
              </a>
            </Button>
            <Button variant="outline" className="mt-2 w-full" onClick={() => setStage("review")}>
              <ArrowLeft className="h-4 w-4" /> Back to review
            </Button>
          </aside>
        </div>
      )}
    </div>
  );
}

function PageView({
  page,
  findings,
  active,
  drawMode,
  onToggle,
  onDraw,
}: {
  page: PageData;
  findings: Finding[];
  active: string | null;
  drawMode: boolean;
  onToggle: (id: string) => void;
  onDraw: (b: Box) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const pct = (b: Box) => ({
    left: `${(b.x / page.width) * 100}%`,
    top: `${(b.y / page.height) * 100}%`,
    width: `${(b.w / page.width) * 100}%`,
    height: `${(b.h / page.height) * 100}%`,
  });
  const toPt = (e: React.MouseEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * page.width, y: ((e.clientY - r.top) / r.height) * page.height };
  };
  return (
    <div
      ref={ref}
      className={`relative bg-card shadow-md ${drawMode ? "cursor-crosshair" : ""}`}
      style={{ aspectRatio: `${page.width} / ${page.height}` }}
      onMouseDown={(e) => {
        if (!drawMode) return;
        const p = toPt(e);
        setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onMouseMove={(e) => drag && setDrag({ ...drag, ...{ x1: toPt(e).x, y1: toPt(e).y } })}
      onMouseUp={() => {
        if (drag) {
          const b = { x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) };
          if (b.w > 3 && b.h > 3) onDraw(b);
          setDrag(null);
        }
      }}
    >
      <img src={page.image} alt={`Page ${page.index + 1}`} className="pointer-events-none h-full w-full select-none" draggable={false} />
      {findings.flatMap((f) =>
        f.boxes.map((b, i) => (
          <div
            key={f.id + i}
            id={i === 0 ? `mark-${f.id}` : undefined}
            title={`${ENTITY_LABELS[f.type]} · ${Math.round(f.score * 100)}%`}
            onClick={(e) => {
              if (drawMode) return;
              e.stopPropagation();
              onToggle(f.id);
            }}
            className={`pii-mark absolute ${f.approved ? "" : "pii-mark-off"} ${active === f.id ? "pii-mark-active" : ""}`}
            style={{ ...pct(b), color: TYPE_COLOR[f.type] }}
          />
        )),
      )}
      {drag && (
        <div
          className="absolute border-2 border-dashed border-primary bg-primary/10"
          style={pct({ x: Math.min(drag.x0, drag.x1), y: Math.min(drag.y0, drag.y1), w: Math.abs(drag.x1 - drag.x0), h: Math.abs(drag.y1 - drag.y0) })}
        />
      )}
      <span className="absolute -left-10 top-0 font-mono text-xs text-muted-foreground">p.{page.index + 1}</span>
    </div>
  );
}
