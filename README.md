# Ride Post

A small cycling content studio: create Instagram posts, song drops and ride notes, export short videos, and turn a CodexFit payroll PDF into an invoice.

## Run locally

Python 3.12 or later is recommended; the server uses only the standard library.

```sh
python3 server.py
```

Open http://localhost:8080. The timetable and Wikimedia features need an internet connection. Select your instructor in the editor. Images chosen on your device are stored in the browser's IndexedDB, subject to browser storage limits and clearing. Different browsers and installed web apps may have separate storage.

## Invoice generator

Open **Rechnung**. Paste a payroll PDF URL or select a PDF from your device. Ride Post fetches a URL directly from the browser; it is not proxied by the app server. The remote server receives the request and must allow cross-origin access. If it does not, download the PDF separately and choose the local file. The PDF must contain selectable text in the supported CodexFit payroll layout; scanned documents and other layouts may require manual entry. Review all courses, figures, invoice details, and tax wording before using the PDF. The tool does not determine your tax treatment or guarantee an invoice number is unique.

Enter your details and download the JSON template to a safe place on your device. Load the template next time. Template data, extracted payroll data, and generated invoices are processed in the browser and are not saved on the Ride Post server. Template JSON is unencrypted and includes the personal details entered; protect it accordingly. Nothing is automatically saved for invoices; download the template before leaving the page if you want to reuse it. All PDF dependencies are served from this app, not a CDN. The app itself requires a network connection to load.

## Install on iPhone

Open the hosted app in **Safari**, tap **Share**, then **Add to Home Screen**. The in-app install button shows these directions on iOS; other supported browsers may offer their own installation prompt. On iPhone, images saved in Safari may not appear in the installed app: choose them there again if necessary. This is a web app, not an App Store app, and offline use is not currently supported.

## Deploy

`Dockerfile` and `fly.toml` configure Fly.io. With Fly CLI installed and authenticated, use `fly deploy` from this directory. Set a different app name in `fly.toml` when deploying your own copy. The server exposes only a fixed list of static files and the public timetable and Wikimedia APIs; it has no invoice upload endpoint.

## AI assistance

This project was built collaboratively by its owner and OpenAI Codex. AI assisted with implementation, documentation, and testing; the owner directs the project and is responsible for reviewing and using the output. See [AI_HELP.md](AI_HELP.md) for contributor guidance and privacy boundaries.

PDF parsing uses [PDF.js](https://github.com/mozilla/pdf.js) (Apache-2.0) and PDF export uses [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT); their license texts are in `vendor/`.
