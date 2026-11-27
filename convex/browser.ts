/**
 * Pompi's page tools, as the script that runs on the board's computer
 * (agent.ts sends it with each command, and it's kept under /tmp/pompi). It
 * drives the computer's Chromium over its DevTools protocol, with nothing but
 * Python's standard library: a page's text and its buttons, links and fields
 * (numbered, for the model to act on), much faster than reading screenshots.
 */

export const BROWSER_PY = String.raw`#!/usr/bin/env python3
# Pompi's page tools (convex/browser.ts): drives the computer's Chromium over its
# DevTools protocol, with nothing but Python's standard library. One command per
# run: its JSON comes base64-encoded as the only argument; the page comes back as
# JSON on the last line of output.
import base64, json, os, shutil, socket, struct, subprocess, sys, time, urllib.request

# Orgo's Chrome already listens on 9223 (its wrapper, /usr/local/bin/google-chrome); 9222 is ours otherwise.
PORTS = [int(os.environ["POMPI_CDP_PORT"])] if os.environ.get("POMPI_CDP_PORT") else [9223, 9222]
PORT = PORTS[0]
STATE = "/tmp/pompi/browser-target"
MAX_TEXT = 6000
MAX_ELEMENTS = 80


def out(obj):
    sys.stdout.write("\n" + json.dumps(obj) + "\n")
    sys.stdout.flush()


def fail(msg):
    out({"error": msg})
    sys.exit(0)


def http(path, method="GET"):
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (PORT, path), method=method)
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.loads(r.read().decode())


def up():
    """Is a browser listening? (On whichever port: that's the one used from then on.)"""
    global PORT
    for p in PORTS:
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/version" % p, timeout=3) as r:
                r.read()
            PORT = p
            return True
        except Exception:
            pass
    return False


def launch():
    """The browser, with its DevTools port: started on the screen if it isn't running."""
    if up():
        return
    exe = None
    for b in ("google-chrome", "chromium", "chromium-browser", "google-chrome-stable"):
        exe = shutil.which(b)
        if exe:
            break
    if not exe:
        fail("There's no Chrome or Chromium on this computer, so the page tools can't work: use the screen for websites.")
    env = dict(os.environ)
    env.setdefault("DISPLAY", ":99")
    args = [exe, "--no-first-run", "--no-default-browser-check", "--start-maximized"]
    try:
        wrapped = "remote-debugging-port" in open(exe, errors="ignore").read(4000)
    except Exception:
        wrapped = False
    # A wrapper (Orgo's) brings its own port and profile; else ours, a profile that keeps its logins.
    if not wrapped:
        args += ["--remote-debugging-port=9222", "--user-data-dir=" + os.path.expanduser("~/.config/pompi-chromium")]
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        args.append("--no-sandbox")
    subprocess.Popen(args + ["about:blank"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, start_new_session=True)
    for _ in range(120):
        if up():
            return
        time.sleep(0.25)
    fail("The browser didn't open its DevTools port. Use the screen for this page.")


class WS:
    """Just enough of a WebSocket client for the DevTools protocol."""

    def __init__(self, url):
        rest = url.split("://", 1)[1]
        hostport, path = rest.split("/", 1)
        host, port = hostport.rsplit(":", 1)
        self.s = socket.create_connection((host, int(port)), timeout=40)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall(("GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, hostport, key)).encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            c = self.s.recv(4096)
            if not c:
                raise IOError("the browser closed the connection")
            buf += c
        head, self.buf = buf.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n")[0]:
            raise IOError(head[:200].decode(errors="replace"))
        self.n = 0

    def _read(self, n):
        while len(self.buf) < n:
            c = self.s.recv(1 << 16)
            if not c:
                raise IOError("the browser closed the connection")
            self.buf += c
        data, self.buf = self.buf[:n], self.buf[n:]
        return data

    def send(self, text):
        data = text.encode()
        n = len(data)
        head = b"\x81"
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        self.s.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        msg = b""
        while True:
            b1, b2 = self._read(2)
            op, n = b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            data = self._read(n)
            if b2 & 0x80:
                mask = data[:4]
                data = bytes(x ^ mask[i % 4] for i, x in enumerate(data[4:]))
            if op == 8:
                raise IOError("the browser closed the connection")
            if op in (9, 10):
                continue
            msg += data
            if b1 & 0x80:
                return msg.decode(errors="replace")

    def call(self, method, params=None, timeout=40):
        self.n += 1
        me = self.n
        self.send(json.dumps({"id": me, "method": method, "params": params or {}}))
        end = time.time() + timeout
        while time.time() < end:
            m = json.loads(self.recv())
            if m.get("id") == me:
                if "error" in m:
                    raise RuntimeError(m["error"].get("message", "DevTools error"))
                return m.get("result", {})
        raise TimeoutError(method)

    def js(self, expr, timeout=30):
        r = self.call("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True}, timeout)
        if "exceptionDetails" in r:
            raise RuntimeError(r["exceptionDetails"].get("exception", {}).get("description") or r["exceptionDetails"].get("text", "script error"))
        return r.get("result", {}).get("value")


def page():
    """The tab it works in: the one it used last, else the first; a new one if there are none."""
    pages = [t for t in http("/json/list") if t.get("type") == "page" and not t.get("url", "").startswith(("devtools://", "chrome-extension://"))]
    last = None
    try:
        last = open(STATE).read().strip()
    except Exception:
        pass
    t = next((p for p in pages if p.get("id") == last), None) or (pages[0] if pages else None)
    if not t:
        t = http("/json/new?about:blank", method="PUT")
    try:
        os.makedirs(os.path.dirname(STATE), exist_ok=True)
        open(STATE, "w").write(t["id"])
    except Exception:
        pass
    ws = WS(t["webSocketDebuggerUrl"])
    try:
        ws.call("Page.bringToFront")
    except Exception:
        pass
    return ws


SNAPSHOT = r"""
(() => {
  const MAX = %d, MAX_TEXT = %d;
  document.querySelectorAll('[data-pompi-ref]').forEach((e) => e.removeAttribute('data-pompi-ref'));
  const sel = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=option],[role=combobox],[role=textbox],[role=switch],[contenteditable=""],[contenteditable=true],[onclick]';
  const shown = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const label = (e) => clean(e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].innerText) || e.getAttribute('placeholder') || e.innerText || e.getAttribute('title') || e.getAttribute('alt') || (e.querySelector && e.querySelector('img[alt]') && e.querySelector('img[alt]').alt) || e.getAttribute('name') || e.id);
  const seen = [], later = [];
  for (const e of document.querySelectorAll(sel)) {
    if (!shown(e)) continue;
    const r = e.getBoundingClientRect();
    (r.bottom > 0 && r.top < innerHeight ? seen : later).push(e);
  }
  const elements = [];
  let n = 0;
  for (const e of seen.concat(later)) {
    if (n >= MAX) break;
    n++;
    e.setAttribute('data-pompi-ref', String(n));
    const tag = e.tagName.toLowerCase();
    const type = (e.getAttribute('type') || '').toLowerCase();
    const secret = type === 'password' || /card|cvc|cvv|iban/i.test(e.getAttribute('autocomplete') || '');
    const it = { ref: n, el: e.getAttribute('role') || (tag === 'input' ? 'input' + (type ? ':' + type : '') : tag), name: label(e) };
    if (secret) it.name = it.name || '(secret field)';
    if (!secret && 'value' in e && e.value && tag !== 'button' && tag !== 'option' && type !== 'submit') it.value = String(e.value).slice(0, 60);
    if (secret && e.value) it.value = '(filled)';
    if (tag === 'a' && e.href) it.href = e.href.slice(0, 140);
    if (tag === 'select') it.options = Array.from(e.options).slice(0, 15).map((o) => clean(o.label || o.value));
    if (e.disabled) it.disabled = true;
    if (e.checked) it.checked = true;
    if (!(r => r.bottom > 0 && r.top < innerHeight)(e.getBoundingClientRect())) it.below = true;
    elements.push(it);
  }
  const all = (document.body && document.body.innerText) || '';
  return JSON.stringify({ url: location.href, title: document.title, text: all.replace(/\n{3,}/g, '\n\n').slice(0, MAX_TEXT), cut: all.length > MAX_TEXT, scroll: Math.round(scrollY), height: Math.round(document.documentElement.scrollHeight), view: innerHeight, elements });
})()
""" % (MAX_ELEMENTS, MAX_TEXT)

FIND = r"""
((ref) => {
  const e = document.querySelector('[data-pompi-ref="' + ref + '"]');
  if (!e) return null;
  e.scrollIntoView({ block: 'center', inline: 'center' });
  const r = e.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  return { x, y, sx: Math.round(screenX + x), sy: Math.round(screenY + (outerHeight - innerHeight) + y), tag: e.tagName.toLowerCase() };
})(%s)
"""

KEYS = {
    "enter": ("Enter", "Enter", 13, "\r"), "tab": ("Tab", "Tab", 9, ""), "escape": ("Escape", "Escape", 27, ""), "esc": ("Escape", "Escape", 27, ""),
    "backspace": ("Backspace", "Backspace", 8, ""), "delete": ("Delete", "Delete", 46, ""), "space": (" ", "Space", 32, " "),
    "arrowdown": ("ArrowDown", "ArrowDown", 40, ""), "arrowup": ("ArrowUp", "ArrowUp", 38, ""), "arrowleft": ("ArrowLeft", "ArrowLeft", 37, ""), "arrowright": ("ArrowRight", "ArrowRight", 39, ""),
    "down": ("ArrowDown", "ArrowDown", 40, ""), "up": ("ArrowUp", "ArrowUp", 38, ""), "pagedown": ("PageDown", "PageDown", 34, ""), "pageup": ("PageUp", "PageUp", 33, ""), "home": ("Home", "Home", 36, ""), "end": ("End", "End", 35, ""),
}


def press(ws, name):
    k = KEYS.get(name.strip().lower().replace(" ", ""))
    if not k:
        raise ValueError("Unknown key %r: use Enter, Tab, Escape, Backspace, Delete, Space, ArrowUp/Down/Left/Right, PageUp/Down, Home or End." % name)
    key, code, vk, text = k
    ws.call("Input.dispatchKeyEvent", dict({"type": "keyDown", "key": key, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk}, **({"text": text} if text else {})))
    ws.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": key, "code": code, "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk})


def click(ws, x, y):
    ws.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    ws.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1})
    ws.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})


def settle(ws, before):
    """After an action: a moment, and if it went to another page, till that one's loaded."""
    time.sleep(0.6)
    end = time.time() + 12
    while time.time() < end:
        try:
            if ws.js("location.href") == before and ws.js("document.readyState") == "complete":
                return
            if ws.js("document.readyState") == "complete":
                time.sleep(0.4)
                return
        except Exception:
            pass
        time.sleep(0.3)


def act(ws, a):
    ref = int(a.get("ref") or 0)
    do = str(a.get("do") or "click").lower()
    if do == "scroll":
        up_ = str(a.get("text") or a.get("key") or "down").lower() == "up"
        ws.js("scrollBy(0, %s * innerHeight)" % ("-0.8" if up_ else "0.8"))
        return None
    if do == "press" and not ref:
        press(ws, str(a.get("key") or a.get("text") or "Enter"))
        return None
    if do == "back":
        ws.js("history.back()")
        return None
    at = ws.js(FIND % json.dumps(str(ref)))
    if not at:
        raise ValueError("There's no element %d on the page now: read the page again for fresh numbers." % ref)
    time.sleep(0.15)
    if do in ("click", "check"):
        click(ws, at["x"], at["y"])
    elif do == "type":
        click(ws, at["x"], at["y"])
        # What was in the field goes first, so the text replaces it.
        ws.js("(() => { const e = document.activeElement; if (!e) return; if (typeof e.select === 'function') e.select(); else document.execCommand('selectAll'); })()")
        ws.call("Input.insertText", {"text": str(a.get("text") or "")})
        if a.get("enter"):
            press(ws, "Enter")
    elif do == "select":
        want = str(a.get("text") or "")
        ok = ws.js("""((ref, want) => { const e = document.querySelector('[data-pompi-ref="' + ref + '"]'); if (!e || !e.options) return false; const o = Array.from(e.options).find((o) => o.value === want || o.label.trim() === want) || Array.from(e.options).find((o) => o.label.toLowerCase().includes(want.toLowerCase())); if (!o) return false; e.value = o.value; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })(%s, %s)""" % (json.dumps(str(ref)), json.dumps(want)))
        if not ok:
            raise ValueError("Element %d has no option %r." % (ref, want))
    elif do == "press":
        click(ws, at["x"], at["y"])
        press(ws, str(a.get("key") or a.get("text") or "Enter"))
    else:
        raise ValueError("Unknown action %r: use click, type, select, press, scroll or back." % do)
    return {"x": at["sx"], "y": at["sy"]}


def main():
    try:
        cmd = json.loads(base64.b64decode(sys.argv[1]).decode())
    except Exception:
        fail("Bad command")
    launch()
    try:
        ws = page()
    except Exception as e:
        fail("Couldn't reach the browser: %s" % e)
    at, error, done = [], None, 0
    try:
        if cmd.get("open"):
            url = str(cmd["open"])
            if "://" not in url:
                url = "https://" + url
            ws.call("Page.enable")
            ws.call("Page.navigate", {"url": url})
            settle(ws, "")
        for a in (cmd.get("actions") or [])[:10]:
            before = ws.js("location.href")
            try:
                p = act(ws, a)
            except Exception as e:
                error = "Action %d (%s) failed: %s The ones after it weren't done." % (done + 1, a.get("do") or "click", e)
                break
            done += 1
            if p:
                at.append(p)
            settle(ws, before)
        snap = json.loads(ws.js(SNAPSHOT))
    except Exception as e:
        fail("The page didn't answer: %s" % e)
    snap["at"] = at
    snap["done"] = done
    if error:
        snap["error"] = error
    out(snap)


main()
`;

/** A short fingerprint of the script, so a changed one replaces the old copy on the computer. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

const SCRIPT = { name: `/tmp/pompi/browser-${hash(BROWSER_PY)}.py`, b64: b64(BROWSER_PY) };

/** What the script is asked to do: open a page, then do these actions (up to ten), then read it. */
export type BrowserCommand = { open?: string; actions?: BrowserAction[] };
export type BrowserAction = { ref?: number; do: "click" | "check" | "type" | "select" | "press" | "scroll" | "back"; text?: string; key?: string; enter?: boolean };

/** The shell command that does `cmd` (putting the script on the computer first if it isn't there). */
export function browserCommand(cmd: BrowserCommand) {
  return `F=${SCRIPT.name}; [ -f $F ] || { mkdir -p /tmp/pompi && echo ${SCRIPT.b64} | base64 -d > $F.tmp && mv $F.tmp $F; }; python3 $F ${b64(JSON.stringify(cmd))}`;
}

export type Snapshot = {
  url: string;
  title: string;
  text: string;
  cut?: boolean;
  scroll?: number;
  height?: number;
  view?: number;
  elements: { ref: number; el: string; name: string; value?: string; href?: string; options?: string[]; disabled?: boolean; checked?: boolean; below?: boolean }[];
  /** Where on the screen each action landed (for the agent's cursor on the board). */
  at?: { x: number; y: number }[];
  done?: number;
  error?: string;
};

/** The script's answer: the JSON on the last line of its output. */
export function parseSnapshot(output: string): Snapshot {
  const line = output.trim().split("\n").reverse().find((l) => l.startsWith("{"));
  if (!line) throw new Error(`The page tools didn't answer: ${output.trim().slice(-300) || "no output"}`);
  return JSON.parse(line) as Snapshot;
}

/** The page, for the model to read: its text, then what it can act on, by number. */
export function describePage(s: Snapshot): string {
  const where = s.height && s.view && s.height > s.view ? ` (scrolled ${s.scroll ?? 0}px of ${s.height}px)` : "";
  const els = s.elements.map((e) => {
    const bits = [`[${e.ref}] ${e.el} ${JSON.stringify(e.name || "")}`];
    if (e.value) bits.push(`= ${JSON.stringify(e.value)}`);
    if (e.options?.length) bits.push(`options: ${e.options.join(" | ")}`);
    if (e.href) bits.push(`-> ${e.href}`);
    if (e.checked) bits.push("(checked)");
    if (e.disabled) bits.push("(disabled)");
    if (e.below) bits.push("(further down)");
    return bits.join(" ");
  });
  return [
    s.error ?? "",
    `Page: ${s.title || "(untitled)"} - ${s.url}${where}`,
    "",
    s.text.trim() || "(no text)",
    s.cut ? "\n(More text further down: scroll to read it.)" : "",
    "",
    els.length ? `What you can act on (by number, with browser_act):\n${els.join("\n")}` : "Nothing to click or fill in here.",
  ]
    .filter((l, i) => l || i > 0)
    .join("\n")
    .trim();
}
