# PDF Credit Agreement Redaction Prototype (LoanIQ demo)

## Goal
Upload a credit agreement PDF, auto-detect personal and sensitive details, let a reviewer accept or reject each finding on a review screen, then download a new redacted PDF.

## About Presidio
Presidio is a Python library and this app's server can't run Python. For a fast demo, we copy Presidio's approach in the app instead:
- **Pattern detectors** (like Presidio's recognizers): emails, phone numbers, SSN/TIN/EIN, IBAN/SWIFT, account and loan numbers, LoanIQ facility/deal IDs, CUSIP, dates of birth, addresses with postcodes.
- **AI detector** (like Presidio's name/entity model, via Lovable AI): names of people, signatories, company contacts, addresses written in full text.
Results from both are merged, with a confidence score and a label for each item.

Later, if needed, a real Presidio service could be hosted separately and plugged in behind the same review screen.

## User flow
```text
Upload PDF -> Analyze (shows progress) -> Review screen -> Generate redacted PDF -> Download
```

1. **Upload page**: drag and drop a PDF, plus a "Load sample agreement" button with a made-up credit agreement for demos.
2. **Review screen** (split view):
   - Left: the PDF pages, with highlights over each finding (color by type).
   - Right: list of findings grouped by type (Person, Email, Account No., Address, Tax ID, ...), each with a checkbox, page number, confidence, and the text snippet.
   - Actions: accept/reject single items, accept all of a type, filter by confidence, click an item to jump to it on the page, draw a box by hand to add a missed redaction.
   - Choose style: black box, or a label like `[PERSON]`.
3. **Generate**: builds the redacted PDF, shows a preview, and offers a download plus a short summary report (counts by type).

## Technical details
- No accounts or storage needed: everything runs during the session; the file is kept in the browser only.
- `pdfjs-dist` (loaded only in the browser) reads the text and word positions, and draws the pages.
- Regex recognizers in `src/lib/pii/recognizers.ts`, with checksum checks where they apply (IBAN, Luhn).
- AI entity detection: a server function calls Lovable AI (`google/gemini-3-flash-preview`), sending text one page at a time and getting back structured entity results; these are then matched to word positions. Requires turning on Lovable Cloud.
- Redaction: draw each page as an image with the approved boxes painted on, then put the pages together with `pdf-lib`. This removes the underlying text for real (no text left under the boxes) — a safe default for a demo.
- Routes: `/` (upload), `/review` (review and generate). State is held in a small in-browser store.
- Unit tests for the recognizers (email, SSN, IBAN, loan/facility IDs).
- Design: plain, professional banking look (dark slate color, one accent color, IBM Plex Sans).

## Out of scope for the demo
Scanned/image-only PDFs (would need text recognition), saving history, user logins, a real Presidio server.
