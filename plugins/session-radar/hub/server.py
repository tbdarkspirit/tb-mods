"""session-radar hub: collects the state of Claude Code sessions from several machines.

PUT    /api/sessions/<id>   upsert {machine, project, title, state, cwd, detail}
DELETE /api/sessions/<id>   session ended
GET    /api/sessions        every known session, newest first
GET    /health              liveness (no auth)
Every /api call needs `Authorization: Bearer $HUB_TOKEN`.
"""
import hmac, json, os, re, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ["HUB_TOKEN"]
DATA = os.environ.get("HUB_DATA", "/data/sessions.json")
STALE_AFTER = 6 * 60        # no heartbeat for 6 min -> shown as "plus de signal"
DROP_AFTER = 30 * 60        # forgotten after 30 min of silence
STATES = {"working", "waiting", "permission", "idle"}
ID_RE = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")
FIELDS = {"machine": 64, "project": 120, "title": 200, "cwd": 300, "detail": 200, "surface": 32, "url": 200, "version": 16}

lock = threading.Lock()
sessions: dict[str, dict] = {}


def load():
    global sessions
    try:
        with open(DATA) as f:
            sessions = json.load(f)
    except (FileNotFoundError, ValueError):
        sessions = {}


def save():
    tmp = DATA + ".tmp"
    with open(tmp, "w") as f:
        json.dump(sessions, f)
    os.replace(tmp, DATA)


def snapshot():
    now = time.time()
    out = []
    for sid, s in list(sessions.items()):
        age = now - s["updatedAt"]
        if age > DROP_AFTER:
            del sessions[sid]
            continue
        out.append({**s, "id": sid, "isStale": age > STALE_AFTER, "now": now})
    out.sort(key=lambda s: s["updatedAt"], reverse=True)
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "session-radar-hub"

    def log_message(self, *a):
        pass

    def reply(self, code, body=None):
        raw = json.dumps(body if body is not None else {}).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def authed(self):
        got = self.headers.get("Authorization", "")
        if hmac.compare_digest(got.encode(), f"Bearer {TOKEN}".encode()):
            return True
        self.reply(401, {"error": "unauthorized"})
        return False

    def sid(self):
        m = re.match(r"^/api/sessions/([^/?]+)$", self.path)
        return m.group(1) if m and ID_RE.match(m.group(1)) else None

    def do_GET(self):
        if self.path == "/health":
            return self.reply(200, {"ok": True})
        if self.path.split("?")[0] != "/api/sessions":
            return self.reply(404, {"error": "not found"})
        if not self.authed():
            return
        with lock:
            snap = snapshot()
        self.reply(200, {"sessions": snap, "now": time.time()})

    def do_PUT(self):
        if not self.authed():
            return
        sid = self.sid()
        if not sid:
            return self.reply(404, {"error": "bad id"})
        try:
            n = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(min(n, 16384)) or b"{}")
        except ValueError:
            return self.reply(400, {"error": "bad json"})
        state = body.get("state")
        if state not in STATES:
            return self.reply(400, {"error": "bad state"})
        now = time.time()
        with lock:
            prev = sessions.get(sid, {})
            rec = {k: str(body.get(k) or prev.get(k) or "")[:lim] for k, lim in FIELDS.items()}
            rec["state"] = state
            rec["stateSince"] = prev.get("stateSince", now) if prev.get("state") == state else now
            rec["startedAt"] = prev.get("startedAt", now)
            rec["updatedAt"] = now
            sessions[sid] = rec
            save()
        self.reply(200, {"ok": True})

    def do_DELETE(self):
        if not self.authed():
            return
        sid = self.sid()
        if not sid:
            return self.reply(404, {"error": "bad id"})
        with lock:
            if sessions.pop(sid, None) is not None:
                save()
        self.reply(200, {"ok": True})


if __name__ == "__main__":
    os.makedirs(os.path.dirname(DATA), exist_ok=True)
    load()
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
