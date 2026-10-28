import type { Detection, EntityType } from "./recognizers";

// Calls a user-hosted Presidio Analyzer directly from the browser.
const MAP: Record<string, EntityType> = {
  PERSON: "PERSON",
  EMAIL_ADDRESS: "EMAIL",
  PHONE_NUMBER: "PHONE",
  US_SSN: "US_SSN",
  US_ITIN: "US_EIN",
  IBAN_CODE: "IBAN",
  CREDIT_CARD: "CREDIT_CARD",
  US_BANK_NUMBER: "ACCOUNT_NO",
  LOCATION: "ADDRESS",
  DATE_TIME: "DATE_OF_BIRTH",
};

export async function presidioHealth(url: string): Promise<boolean> {
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/health`);
    return r.ok;
  } catch {
    return false;
  }
}

export async function presidioAnalyze(url: string, text: string): Promise<Detection[]> {
  const r = await fetch(`${url.replace(/\/$/, "")}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: "en" }),
  });
  if (!r.ok) throw new Error(`Presidio returned ${r.status}`);
  const rows = (await r.json()) as Array<{ entity_type: string; start: number; end: number; score: number }>;
  return rows
    .filter((x) => MAP[x.entity_type] && x.entity_type !== "DATE_TIME")
    .map((x) => ({ start: x.start, end: x.end, type: MAP[x.entity_type]!, score: x.score, source: "presidio" as const }));
}
