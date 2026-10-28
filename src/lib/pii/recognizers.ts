// Rule-based PII recognizers (Presidio-style: regex + checksum + context words).
// Pure functions, no network, no AI.

export type EntityType =
  | "PERSON"
  | "EMAIL"
  | "PHONE"
  | "US_SSN"
  | "US_EIN"
  | "IBAN"
  | "SWIFT"
  | "ABA_ROUTING"
  | "CREDIT_CARD"
  | "ACCOUNT_NO"
  | "LOANIQ_ID"
  | "CUSIP"
  | "DATE_OF_BIRTH"
  | "ADDRESS"
  | "CUSTOM";

export interface Detection {
  start: number;
  end: number;
  type: EntityType;
  score: number;
  source: "builtin" | "presidio" | "custom";
}

export const ENTITY_LABELS: Record<EntityType, string> = {
  PERSON: "Person",
  EMAIL: "Email",
  PHONE: "Phone",
  US_SSN: "SSN",
  US_EIN: "Tax ID (EIN)",
  IBAN: "IBAN",
  SWIFT: "SWIFT / BIC",
  ABA_ROUTING: "ABA routing",
  CREDIT_CARD: "Card number",
  ACCOUNT_NO: "Account no.",
  LOANIQ_ID: "LoanIQ ID",
  CUSIP: "CUSIP",
  DATE_OF_BIRTH: "Date of birth",
  ADDRESS: "Address",
  CUSTOM: "Custom term",
};

export function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let mod = 0;
  for (const ch of r) {
    const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) mod = (mod * 10 + Number(d)) % 97;
  }
  return mod === 1;
}

export function luhnValid(raw: string): boolean {
  const s = raw.replace(/\D/g, "");
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let n = Number(s[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function abaValid(s: string): boolean {
  if (!/^\d{9}$/.test(s)) return false;
  const d = s.split("").map(Number) as [number, number, number, number, number, number, number, number, number];
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}

export function cusipValid(s: string): boolean {
  if (!/^[0-9A-Z]{8}\d$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const c = s.charAt(i);
    let v = /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 55;
    if (i % 2 === 1) v *= 2;
    sum += Math.floor(v / 10) + (v % 10);
  }
  return (10 - (sum % 10)) % 10 === Number(s[8]);
}

const FIRST_NAMES =
  "James John Robert Michael William David Richard Joseph Thomas Charles Christopher Daniel Matthew Anthony Mark Donald Steven Paul Andrew Joshua Kenneth Kevin Brian George Timothy Ronald Edward Jason Jeffrey Ryan Jacob Gary Nicholas Eric Jonathan Stephen Larry Justin Scott Brandon Benjamin Samuel Gregory Alexander Patrick Frank Raymond Jack Dennis Jerry Tyler Aaron Henry Peter Oliver Harry Mary Patricia Jennifer Linda Elizabeth Barbara Susan Jessica Sarah Karen Lisa Nancy Betty Margaret Sandra Ashley Kimberly Emily Donna Michelle Carol Amanda Melissa Deborah Stephanie Rebecca Sharon Laura Cynthia Kathleen Amy Angela Anna Emma Olivia Sophie Charlotte Grace Rachel Catherine Victoria Helen Priya Raj Rahul Wei Mohammed Ahmed Fatima Maria Jose Carlos Luis Juan".split(
    " ",
  );

const CONTEXT: Partial<Record<EntityType, RegExp>> = {
  PHONE: /(tel|phone|telephone|fax|mobile|cell)/i,
  US_SSN: /(ssn|social security)/i,
  US_EIN: /(ein|tax id|taxpayer|tin|employer identification)/i,
  ACCOUNT_NO: /(account|acct)/i,
  LOANIQ_ID: /(facility|deal|loan|borrower|outstanding|loaniq)/i,
  ADDRESS: /(address|notice|located|attention|attn)/i,
  PERSON: /(name|by:|attention|attn|signed|signatory|officer|guarantor)/i,
};

type Rule = {
  type: EntityType;
  re: RegExp;
  score: number;
  group?: number;
  validate?: (m: string) => boolean;
  requireContext?: RegExp;
};

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";

const RULES: Rule[] = [
  { type: "EMAIL", re: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, score: 0.95 },
  { type: "US_SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g, score: 0.85 },
  { type: "US_EIN", re: /\b\d{2}-\d{7}\b/g, score: 0.6 },
  {
    type: "PHONE",
    re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\+44\s?\d{2,4}\s?\d{3,4}\s?\d{3,4}\b/g,
    score: 0.7,
  },
  {
    type: "IBAN",
    re: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g,
    score: 0.95,
    validate: ibanValid,
  },
  {
    type: "SWIFT",
    re: /\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g,
    score: 0.85,
    requireContext: /(swift|bic)/i,
  },
  { type: "ABA_ROUTING", re: /\b\d{9}\b/g, score: 0.85, validate: abaValid, requireContext: /(aba|routing)/i },
  { type: "CREDIT_CARD", re: /\b(?:\d[ -]?){12,18}\d\b/g, score: 0.9, validate: luhnValid },
  {
    type: "ACCOUNT_NO",
    re: /\b(?:account|acct\.?|a\/c)\s*(?:no\.?|number|#)?\s*[:#]?\s*([A-Z0-9][A-Z0-9-]{5,24})\b/gi,
    score: 0.85,
    group: 1,
  },
  { type: "LOANIQ_ID", re: /\b(?:FAC|DEAL|LIQ|BRW|LN|OUT|CUST)[-_]?\d{4,12}\b/g, score: 0.85 },
  { type: "CUSIP", re: /\b[0-9]{3}[0-9A-Z]{5}[0-9]\b/g, score: 0.85, validate: cusipValid },
  {
    type: "DATE_OF_BIRTH",
    re: new RegExp(`\\b(?:\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}|(?:${MONTHS})\\s+\\d{1,2},\\s+\\d{4})\\b`, "g"),
    score: 0.85,
    requireContext: /(birth|dob|born)/i,
  },
  {
    type: "ADDRESS",
    re: /\b\d{1,5}\s+(?:[A-Z][a-z]+\s+){1,4}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Way|Plaza|Place|Court|Square)(?:,?\s+(?:Suite|Floor|Fl\.?)\s+\d+)?/g,
    score: 0.75,
  },
  { type: "ADDRESS", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/g, score: 0.7 },
  { type: "ADDRESS", re: /\b[A-Z]{2}\s\d{5}(?:-\d{4})?\b/g, score: 0.6 },
  {
    type: "PERSON",
    re: /\b(?:Name|Attention|Attn|By|Signed|Guarantor)\s*[:.]\s*(?:\/s\/ *)?((?:[A-Z][a-z]+\.? +(?:[A-Z]\. +)?){1,2}[A-Z][a-zA-Z'-]+)/g,
    score: 0.8,
    group: 1,
  },
  { type: "PERSON", re: /\b(?:Mr|Mrs|Ms|Dr)\.? +((?:[A-Z][a-z]+ +)?[A-Z][a-zA-Z'-]+)/g, score: 0.8, group: 1 },
  {
    type: "PERSON",
    re: new RegExp(`\\b(?:${FIRST_NAMES.join("|")})\ +(?:[A-Z]\\.\ +)?[A-Z][a-zA-Z'-]+\\b`, "g"),
    score: 0.65,
  },
];

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function analyze(text: string, denyList: string[] = []): Detection[] {
  const out: Detection[] = [];
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.re.exec(text))) {
      let value = m[0];
      let start = m.index;
      if (rule.group && m[rule.group]) {
        value = m[rule.group]!;
        start = m.index + m[0].lastIndexOf(value);
      }
      if (rule.validate && !rule.validate(value)) continue;
      const before = text.slice(Math.max(0, start - 60), start);
      if (rule.requireContext && !rule.requireContext.test(before)) continue;
      let score = rule.score;
      const ctx = CONTEXT[rule.type];
      if (ctx && ctx.test(before)) score = Math.min(1, score + 0.15);
      out.push({ start, end: start + value.length, type: rule.type, score, source: "builtin" });
    }
  }
  for (const term of denyList.map((t) => t.trim()).filter(Boolean)) {
    const re = new RegExp(escapeRe(term), "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.push({ start: m.index, end: m.index + m[0].length, type: "CUSTOM", score: 1, source: "custom" });
  }
  return mergeDetections(out);
}

/** Drop detections that overlap a higher-scoring one. */
export function mergeDetections(list: Detection[]): Detection[] {
  const sorted = [...list].sort((a, b) => b.score - a.score || b.end - b.start - (a.end - a.start));
  const kept: Detection[] = [];
  for (const d of sorted) {
    if (!kept.some((k) => d.start < k.end && k.start < d.end)) kept.push(d);
  }
  return kept.sort((a, b) => a.start - b.start);
}
