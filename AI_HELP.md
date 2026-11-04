# AI-assisted development

Ride Post was developed with OpenAI Codex in collaboration with its owner. AI-generated code and documentation should be reviewed and tested like any other contribution. Please state substantial AI assistance in pull requests and verify claims and behavior independently.

## Project map

- `index.html`, `styles.css`, `app.js`: social post editor and locally stored photos.
- `server.py`: Python standard-library server and public CodexFit/Wikimedia integrations.
- `invoice.html`, `invoice.css`, `invoice.js`: browser-only payroll import, template handling and invoice PDF export.
- `install.js`, `manifest.webmanifest`, `assets/`: install guidance and web app metadata.
- `vendor/`: locally served PDF dependencies and their licenses.

## Privacy boundaries

Do not add real payrolls, invoice templates, personal bank details, tax identifiers, API keys or private example data to the repository, server logs or builds. Invoice data must remain client-side: do not add analytics or server endpoints that receive payrolls, form contents, templates, or invoices. PDF URL requests go directly from the browser to the entered HTTPS host; the host sees the request. Browser file downloads and JSON templates are unencrypted. Never substitute remote code or CDN dependencies into the invoice page without reassessing this boundary.

## Verification

Start `python3 server.py`, open the site, test post editing, invoice import, editable course amounts, totals, JSON template round trip and PDF export using synthetic data. Test iOS install guidance and responsive layout. Use a synthetic payroll for automated tests and verify extracted courses and totals against the source; recognize that PDF layout changes can break parsing. There is no OCR. Check that malformed amounts and mismatched line totals block invoice creation. Confirm no invoice data is sent to Ride Post and no personal data appears in the Git diff before publishing.
