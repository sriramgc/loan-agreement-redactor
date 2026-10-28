// Browser-only PDF helpers. Import this module lazily (never from SSR code).
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Seg {
  start: number;
  end: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PageData {
  index: number;
  width: number;
  height: number;
  text: string;
  segs: Seg[];
  image: string; // data URL preview
}

export async function loadPdf(bytes: ArrayBuffer): Promise<PageData[]> {
  const doc = await pdfjs.getDocument({ data: bytes.slice(0) }).promise;
  const pages: PageData[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let text = "";
    const segs: Seg[] = [];
    let lastY: number | null = null;
    for (const item of content.items as Array<{ str: string; transform: number[]; width: number }>) {
      if (!("str" in item) || !item.str) continue;
      const t = pdfjs.Util.transform(vp.transform, item.transform);
      const h = Math.hypot(t[2], t[3]);
      const y = t[5] - h;
      if (lastY !== null) text += Math.abs(lastY - y) > 2 ? "\n" : text.endsWith(" ") ? "" : " ";
      lastY = y;
      const start = text.length;
      text += item.str;
      segs.push({ start, end: text.length, x: t[4], y, w: item.width, h: h * 1.15 });
    }
    const canvas = document.createElement("canvas");
    const scale = 1.5;
    const v2 = page.getViewport({ scale });
    canvas.width = v2.width;
    canvas.height = v2.height;
    await page.render({ canvasContext: canvas.getContext("2d")!, viewport: v2 }).promise;
    pages.push({ index: i - 1, width: vp.width, height: vp.height, text, segs, image: canvas.toDataURL("image/png") });
  }
  return pages;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measure(s: string) {
  if (!measureCtx) {
    measureCtx = document.createElement("canvas").getContext("2d")!;
    measureCtx.font = "20px Helvetica, Arial, sans-serif";
  }
  return measureCtx.measureText(s).width;
}

/** Map a character span on a page to rectangles (PDF points, top-left origin). */
export function spanToBoxes(page: PageData, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  for (const s of page.segs) {
    if (s.end <= start || s.start >= end) continue;
    const str = page.text.slice(s.start, s.end);
    const a = Math.max(start, s.start) - s.start;
    const b = Math.min(end, s.end) - s.start;
    const full = measure(str) || 1;
    const x0 = (s.w * measure(str.slice(0, a))) / full;
    const x1 = (s.w * measure(str.slice(0, b))) / full;
    boxes.push({ x: s.x + x0 - 1, y: s.y - 1, w: x1 - x0 + 2, h: s.h + 2 });
  }
  return boxes;
}

export interface RedactBox extends Box {
  page: number;
  label?: string;
}

/** Rasterize each page with approved boxes burned in → no text survives under redactions. */
export async function buildRedactedPdf(pages: PageData[], boxes: RedactBox[], withLabels: boolean): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const scale = 2;
  for (const p of pages) {
    const img = new Image();
    img.src = p.image;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = p.width * scale;
    canvas.height = p.height * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const b of boxes.filter((b) => b.page === p.index)) {
      ctx.fillStyle = "#000";
      ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
      if (withLabels && b.label) {
        ctx.fillStyle = "#fff";
        const fs = Math.min(b.h * scale * 0.7, 18);
        ctx.font = `bold ${fs}px monospace`;
        ctx.textBaseline = "middle";
        ctx.save();
        ctx.beginPath();
        ctx.rect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
        ctx.clip();
        ctx.fillText(`[${b.label}]`, b.x * scale + 2, (b.y + b.h / 2) * scale);
        ctx.restore();
      }
    }
    const jpg = await out.embedJpg(canvas.toDataURL("image/jpeg", 0.92));
    const page = out.addPage([p.width, p.height]);
    page.drawImage(jpg, { x: 0, y: 0, width: p.width, height: p.height });
  }
  out.setTitle("Redacted document");
  out.setProducer("Redaction prototype");
  return out.save();
}

/** Fictional credit agreement for demos. */
export async function makeSamplePdf(): Promise<ArrayBuffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pagesText: string[][] = [
    [
      "#CREDIT AGREEMENT",
      "dated as of March 14, 2025",
      "",
      "among NORTHWIND HOLDINGS LLC, as Borrower,",
      "the Lenders party hereto, and HARBOR STATE BANK, N.A., as Administrative Agent.",
      "",
      "#LoanIQ Reference Data",
      "Deal ID: DEAL20250314   Facility ID: FAC-00098211   Borrower ID: BRW-554120",
      "Term Loan A Outstanding: OUT-7731902   CUSIP: 037833100",
      "Borrower Tax ID (EIN): 84-3920175",
      "",
      "#Section 2.07 Payments",
      "All payments shall be made to the Administrative Agent's account:",
      "Bank: Harbor State Bank, ABA routing 021000021, SWIFT: HSBKUS33",
      "Account No.: 4471-993021-88",
      "IBAN: GB82 WEST 1234 5698 7654 32 (for GBP tranche)",
      "",
      "#Section 9.01 Notices",
      "If to the Borrower: Northwind Holdings LLC, 1200 Market Street, Suite 400,",
      "Philadelphia, PA 19107. Attention: Jonathan R. Whitfield, Chief Financial Officer",
      "Telephone: (215) 555-0143   Email: j.whitfield@northwind-holdings.com",
      "",
      "If to the Administrative Agent: Harbor State Bank, 45 Canary Wharf Place,",
      "London E14 5AB. Attention: Ms. Priya Raman, Agency Services",
      "Telephone: +44 20 7946 0958   Email: agency.ops@harborstate.example",
    ],
    [
      "#Schedule 5.12 Guarantor Information",
      "Guarantor: Margaret L. Ostrowski",
      "Date of birth: 07/22/1968   SSN: 512-44-9031",
      "Residential address: 88 Willow Creek Lane, Bryn Mawr, PA 19010",
      "Corporate card on file: 4111 1111 1111 1111",
      "",
      "#Signatures",
      "NORTHWIND HOLDINGS LLC, as Borrower",
      "By: Jonathan R. Whitfield",
      "Title: Chief Financial Officer",
      "",
      "HARBOR STATE BANK, N.A., as Administrative Agent and Lender",
      "By: Daniel Okafor",
      "Title: Managing Director",
    ],
  ];
  for (const lines of pagesText) {
    const page = doc.addPage([612, 792]);
    let y = 740;
    for (const line of lines) {
      const isH = line.startsWith("#");
      const t = isH ? line.slice(1) : line;
      if (t) page.drawText(t, { x: 56, y, size: isH ? 13 : 10, font: isH ? bold : font, color: rgb(0.1, 0.1, 0.12) });
      y -= isH ? 22 : 16;
    }
  }
  const bytes = await doc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
