# PDF Credit Agreement Redaction Prototype (LoanIQ demo)

## Goal
Upload a credit agreement PDF, auto-detect personal and sensitive details, let a reviewer accept or reject each finding on a review screen, then download a new redacted PDF.

## Privacy: no AI, nothing leaves the browser
- No AI services and no server processing. The PDF is read, analyzed and redacted entirely on the user's computer.
- Nothing is uploaded or stored anywhere.

## About Presidio
Presidio is a Python library and can't run inside this app. For a fast demo we rebuild Presidio's rule-based approach in the browser:
- **Pattern detectors**: emails, phone numbers, SSN/TIN/EIN, IBAN/SWIFT/ABA routing, account and loan numbers, LoanIQ facility/deal/borrower IDs, CUSIP, dates of birth, postcodes/addresses.
- **Context words** (like Presidio): confidence goes up when words such as "Account No.", "Attention:", "Borrower", "SSN" appear nearby.
- **Name detection without AI**: names found next to "By:", "Name:", "Attention:", "Title:" and in notice/signature blocks, plus a list of common first names. A small custom "deny list" lets the reviewer add terms (e.g. the borrower's name) that are then found everywhere.
- Later, a self-hosted Presidio service inside your own network could replace these detectors behind the same review screen.

## User flow
```text
Upload PDF -> Analyze -> Review screen -> Generate redacted PDF -> Download
```

1. **Upload page**: drag and drop a PDF, plus "Load sample agreement" with a made-up credit agreement.
2. **Review screen** (split view):
   - Left: PDF pages with color highlights for each finding.
   - Right: findings grouped by type, each with checkbox, page, confidence and snippet.
   - Accept/reject single items or a whole type, filter by confidence, click to jump to it, draw a box by hand for anything missed, add deny-list terms.
   - Redaction style: black box or label like `[ACCOUNT NO]`.
3. **Generate**: builds the redacted PDF, shows a preview, download plus summary (counts by type).

## Technical details
- No Lovable Cloud and no server functions; fully client-side.
- `pdfjs-dist` (browser-only, lazy-loaded) extracts text with word positions and renders pages.
- Recognizers in `src/lib/pii/recognizers.ts` with checksums (IBAN mod-97, Luhn, ABA) and context-word scoring.
- Redaction: each page drawn to an image with approved boxes painted on, reassembled with `pdf-lib` — no hidden text remains under the boxes.
- Routes: `/` (upload), `/review`. State in a small in-memory store.
- Unit tests for recognizers.
- Design: professional banking look (dark slate, one accent, IBM Plex Sans).

## Out of scope for the demo
Scanned/image-only PDFs, saving history, logins, real Presidio server.
