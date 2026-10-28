<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- PII detection and redaction run fully client-side (`src/lib/pii/`); pdfjs/pdf-lib modules are lazy-loaded behind ClientOnly because they need browser APIs.
- Redacted output is rasterized per page so no text survives under boxes.
- Presidio is optional and called directly from the browser at a user-supplied self-hosted URL; never proxy document text through app servers.
