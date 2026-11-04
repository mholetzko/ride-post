#!/usr/bin/env python3
"""Local-only server for preparing a weekly cycling post."""
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request, urlopen, build_opener, HTTPRedirectHandler
import hashlib
import json
import mimetypes
import os
import re
import sys
import threading
import webbrowser
import uuid

ROOT = Path(__file__).resolve().parent
BASE = 'https://blackbike.codexfit.com/api/customer/v2'
WIKIMEDIA_IMAGES = {}
WIKIMEDIA_LOCK = threading.Lock()
WIKIMEDIA_HOSTS = {'upload.wikimedia.org', 'thumb.wikimedia.org'}

def is_wikimedia_image_url(url):
    p = urlsplit(url)
    return p.scheme == 'https' and p.hostname in WIKIMEDIA_HOSTS and p.port in (None, 443) and not p.username and not p.password

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_wikimedia_image_url(newurl):
            raise ValueError('Bildadresse nicht erlaubt.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)

class PlainText(HTMLParser):
    def __init__(self):
        super().__init__(); self.parts = []
    def handle_data(self, data):
        self.parts.append(data)

def plain_text(value):
    parser = PlainText(); parser.feed(value or '')
    return ' '.join(''.join(parser.parts).split())[:500]

def search_commons(query):
    query = query.strip()
    if not query or len(query) > 120:
        raise ValueError('Bitte einen Suchbegriff mit bis zu 120 Zeichen eingeben.')
    params = {'action': 'query', 'generator': 'search', 'gsrsearch': 'filetype:bitmap ' + query,
              'gsrnamespace': '6', 'gsrlimit': '12', 'prop': 'imageinfo',
              'iiprop': 'url|extmetadata|mime', 'iiurlwidth': '1200', 'format': 'json'}
    url = 'https://commons.wikimedia.org/w/api.php?' + urlencode(params)
    req = Request(url, headers={'User-Agent': 'RidePost/1.0 (local cycling post creator)', 'Accept': 'application/json'})
    with urlopen(req, timeout=15) as response:
        payload = json.load(response)
    pages = sorted(payload.get('query', {}).get('pages', {}).values(), key=lambda page: page.get('index', 9999))
    results = []
    with WIKIMEDIA_LOCK:
        for page in pages:
            info = (page.get('imageinfo') or [{}])[0]
            image_url = info.get('thumburl') or info.get('url') or ''
            source = info.get('descriptionurl') or ''
            if not is_wikimedia_image_url(image_url) or urlsplit(source).hostname != 'commons.wikimedia.org':
                continue
            if info.get('mime', '').startswith('image/') is False:
                continue
            meta = info.get('extmetadata') or {}
            ident = uuid.uuid4().hex
            WIKIMEDIA_IMAGES[ident] = image_url
            results.append({'id': ident, 'name': page.get('title', '').removeprefix('File:'),
                            'url': '/api/commons/image?id=' + ident, 'source': source,
                            'artist': plain_text((meta.get('Artist') or {}).get('value')),
                            'license': plain_text((meta.get('LicenseShortName') or {}).get('value')),
                            'license_url': (meta.get('LicenseUrl') or {}).get('value') or ''})
        while len(WIKIMEDIA_IMAGES) > 200:
            WIKIMEDIA_IMAGES.pop(next(iter(WIKIMEDIA_IMAGES)))
    return {'images': results}

def get_commons_image(ident):
    with WIKIMEDIA_LOCK:
        url = WIKIMEDIA_IMAGES.get(ident)
    if not url or not is_wikimedia_image_url(url):
        raise ValueError('Bild nicht gefunden. Bitte erneut suchen.')
    req = Request(url, headers={'User-Agent': 'RidePost/1.0 (local cycling post creator)'})
    with build_opener(SafeRedirect()).open(req, timeout=15) as response:
        content_type = response.headers.get_content_type()
        if content_type not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif'):
            raise ValueError('Dieses Bildformat wird nicht unterstützt.')
        data = response.read(12 * 1024 * 1024 + 1)
        if len(data) > 12 * 1024 * 1024:
            raise ValueError('Das Bild ist zu groß.')
    return data, content_type

def get_json(resource, params=None):
    fixture_dir = os.environ.get('RIDE_POST_TEST_FIXTURES')
    if fixture_dir:
        page = (params or {}).get('page[number]', 1)
        path = Path(fixture_dir) / f'{resource}-{page}.json'
        return json.loads(path.read_text())
    url = BASE + '/' + resource + ('?' + urlencode(params) if params else '')
    req = Request(url, headers={'Accept': 'application/json', 'User-Agent': 'RidePost/1.0'})
    with urlopen(req, timeout=12) as response:
        return json.load(response)

def weekly_events(week, instructor_handle=None):
    instructor_handle = instructor_handle or 'matthias-eng'
    if not re.fullmatch(r'[a-z0-9-]{1,100}', instructor_handle):
        raise ValueError('Ungültiger Instructor.')
    start = date.fromisoformat(week)
    if start.weekday() != 0:
        raise ValueError('Bitte einen Montag als Wochenbeginn angeben.')
    end = start + timedelta(days=7)
    result, page = [], 1
    seen = set()
    while True:
        payload = get_json('events', {'page[size]': 100, 'page[number]': page,
                                      'filter[instructor.handle]': instructor_handle})
        records = payload.get('data')
        if not isinstance(records, list) or not isinstance(payload.get('relations'), dict):
            raise ValueError('Unerwartete Antwort vom Stundenplan.')
        rel = payload['relations']
        instructors = {i['id']: i for i in rel.get('instructors', [])}
        studios = {s['id']: s for s in rel.get('studios', [])}
        locations = {l['id']: l for l in rel.get('locations', [])}
        kinds = {k['id']: k for k in rel.get('event_types', [])}
        for item in records:
            instructor = instructors.get(item.get('instructor_id'), {})
            studio = studios.get(item.get('studio_id'), {})
            location = locations.get(studio.get('location_id'), {})
            if instructor.get('handle') != instructor_handle or location.get('handle') not in ('munich-hofstatt', 'munich-schwabing', 'stuttgart'):
                continue
            if not item.get('is_visible') or item.get('status') == 'cancelled':
                continue
            stamp = item.get('start_at', '')
            try:
                event_date = date.fromisoformat(stamp[:10])
                event_time = datetime.fromisoformat(stamp).strftime('%H:%M')
            except (ValueError, TypeError):
                continue
            if not start <= event_date < end or item.get('id') in seen:
                continue
            seen.add(item.get('id'))
            result.append({'id': item.get('id'), 'date': event_date.isoformat(),
                           'time': event_time, 'duration': item.get('duration'),
                           'studio': {'munich-hofstatt': 'Hofstatt', 'munich-schwabing': 'Schwabing', 'stuttgart': 'Stuttgart'}[location['handle']],
                           'course': kinds.get(item.get('event_type_id'), {}).get('name', 'Class'),
                           'theme': (item.get('metafields') or {}).get('themed_class')})
        meta = payload.get('meta') or {}
        last = int(meta.get('last_page', 1))
        if last > 100:
            raise ValueError('Zu viele Seiten im Stundenplan; bitte erneut versuchen.')
        if page >= last:
            break
        page += 1
    result.sort(key=lambda event: (event['date'], event['time']))
    return {'events': result, 'week_start': start.isoformat(),
            'week_end': (end - timedelta(days=1)).isoformat(), 'source': 'CodexFit'}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send_data(self, data, status=200, kind='application/json; charset=utf-8', cache='no-store'):
        if isinstance(data, (dict, list)):
            data = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', cache)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urlsplit(self.path)
        args = parse_qs(parsed.query)
        try:
            if parsed.path == '/api/commons/search':
                return self.send_data(search_commons(args.get('q', [''])[0]))
            if parsed.path == '/api/commons/image':
                data, kind = get_commons_image(args.get('id', [''])[0])
                return self.send_data(data, kind=kind, cache='private, max-age=3600')
            if parsed.path == '/api/instructors':
                instructors, page = [], 1
                while True:
                    payload = get_json('instructors', {'page[size]': 100, 'page[number]': page})
                    instructors.extend({'handle': i.get('handle'), 'name': i.get('full_name') or i.get('first_name') or i.get('handle')} for i in payload.get('data', []) if i.get('handle') and i.get('is_visible', True))
                    last = int((payload.get('meta') or {}).get('last_page', 1))
                    if last > 100:
                        raise ValueError('Zu viele Seiten in der Instructor-Liste.')
                    if page >= last:
                        break
                    page += 1
                instructors.sort(key=lambda i: i['name'].casefold())
                return self.send_data({'instructors': instructors})
            if parsed.path == '/api/events':
                week = args.get('week', [''])[0]
                return self.send_data(weekly_events(week, args.get('instructor', ['matthias-eng'])[0]))
            static = {path: name for path, name in [('/', 'index.html'), ('/index.html', 'index.html'), ('/invoice', 'invoice.html'), ('/invoice.html', 'invoice.html'), *[('/' + name, name) for name in ('app.js', 'styles.css', 'install.js', 'invoice.js', 'invoice.css', 'manifest.webmanifest', 'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png', 'vendor/pdf.min.mjs', 'vendor/pdf.worker.min.mjs', 'vendor/pdf-lib.min.js')]]}
            name = static.get(parsed.path)
            if not name:
                return self.send_data({'error': 'Nicht gefunden.'}, 404)
            return self.send_data((ROOT / name).read_bytes(), kind=('application/javascript' if name.endswith('.mjs') else 'application/manifest+json' if name.endswith('.webmanifest') else mimetypes.guess_type(name)[0] or 'text/plain'))
        except (OSError, ValueError, KeyError, TypeError) as exc:
            print(f'Anfrage fehlgeschlagen: {exc}', file=sys.stderr, flush=True)
            return self.send_data({'error': 'Stundenplan oder Datei konnte nicht geladen werden. Bitte Internetverbindung prüfen und erneut versuchen.'}, 502)

def main():
    server = ThreadingHTTPServer(('0.0.0.0', int(os.environ.get('PORT', '8080'))), Handler)
    print(f'Ride Post läuft auf Port {server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()

if __name__ == '__main__':
    main()
