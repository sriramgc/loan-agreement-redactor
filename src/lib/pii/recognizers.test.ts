import { describe, it, expect } from "vitest";
import { analyze, ibanValid, luhnValid, abaValid, cusipValid } from "./recognizers";

const types = (t: string, deny?: string[]) => analyze(t, deny).map((d) => [d.type, t.slice(d.start, d.end)]);

describe("recognizers", () => {
  it("finds emails", () => {
    expect(types("Contact: jane.doe@acme-bank.com today")).toContainEqual(["EMAIL", "jane.doe@acme-bank.com"]);
  });
  it("finds SSNs", () => {
    expect(types("SSN 123-45-6789")).toContainEqual(["US_SSN", "123-45-6789"]);
  });
  it("validates IBAN checksum", () => {
    expect(ibanValid("GB82 WEST 1234 5698 7654 32")).toBe(true);
    expect(ibanValid("GB82 WEST 1234 5698 7654 33")).toBe(false);
    expect(types("IBAN: GB82 WEST 1234 5698 7654 32")).toContainEqual(["IBAN", "GB82 WEST 1234 5698 7654 32"]);
  });
  it("validates card, ABA and CUSIP checksums", () => {
    expect(luhnValid("4111 1111 1111 1111")).toBe(true);
    expect(abaValid("021000021")).toBe(true);
    expect(abaValid("021000022")).toBe(false);
    expect(cusipValid("037833100")).toBe(true);
  });
  it("finds LoanIQ facility and deal IDs", () => {
    const r = types("Facility FAC-00012345 under Deal DEAL20240091");
    expect(r).toContainEqual(["LOANIQ_ID", "FAC-00012345"]);
    expect(r).toContainEqual(["LOANIQ_ID", "DEAL20240091"]);
  });
  it("finds account number after label", () => {
    expect(types("Account No.: 4471-993021-88")).toContainEqual(["ACCOUNT_NO", "4471-993021-88"]);
  });
  it("only flags SWIFT with context", () => {
    expect(types("BORROWERS AGREE")).toEqual([]);
    expect(types("SWIFT: CHASUS33")).toContainEqual(["SWIFT", "CHASUS33"]);
  });
  it("finds names after By:/Attention:", () => {
    expect(types("By: Jonathan R. Whitfield")).toContainEqual(["PERSON", "Jonathan R. Whitfield"]);
  });
  it("applies deny list terms everywhere", () => {
    const r = types("Northwind Holdings agrees. NORTHWIND HOLDINGS shall pay.", ["Northwind Holdings"]);
    expect(r.filter(([t]) => t === "CUSTOM")).toHaveLength(2);
  });
});

describe("signature blocks", () => {
  it("finds names after By: /s/", () => {
    const t = "By: /s/ Denise Jones";
    expect(analyze(t).map((d) => t.slice(d.start, d.end))).toContain("Denise Jones");
  });
});

describe("notice addresses", () => {
  it("finds street, mail code and state+zip lines", () => {
    const t = "Two American Lane\n900 W. Trade St\nMail Code: NC1-026-06-04\nChicago, Illinois 60601";
    const found = analyze(t).map((d) => t.slice(d.start, d.end));
    expect(found).toContain("Two American Lane");
    expect(found).toContain("900 W. Trade St");
    expect(found).toContain("NC1-026-06-04");
    expect(found).toContain("Illinois 60601");
  });
});
