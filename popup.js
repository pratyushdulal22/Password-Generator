const $ = id => document.getElementById(id);
const MIN_LEN = 5, MAX_LEN = 148;
const MAX_HISTORY = 10;          // how many recent passwords to remember

let history = [];                // last 10 passwords  [{pw, time}]
let pinned = [];                 // pinned passwords, kept until you delete them
let saveTimer;                   // used to wait a moment before saving to history

// ---------- password generation (same as before) ----------

// Uniform secure random integer in [0, max)
function randInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return buf[0] % max;
}
const pick = s => s[randInt(s.length)];

function generate(o) {
  let U = "ABCDEFGHIJKLMNOPQRSTUVWXYZ", L = "abcdefghijklmnopqrstuvwxyz", N = "0123456789", S = "!@#$%^&*";
  const pool = (o.upper ? U : "") + (o.lower ? L : "") + (o.numbers ? N : "") + (o.special ? S : "");
  if (!pool) return "";
  const chars = [];
  while (chars.length < o.length) chars.push(pick(pool));
  for (let i = chars.length - 1; i > 0; i--) {           // Fisher-Yates shuffle
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function render(pw) {
  const el = $("pw");
  el.textContent = "";
  for (const c of pw) {
    const span = document.createElement("span");
    if (/\d/.test(c)) span.className = "n";
    else if (/[^A-Za-z]/.test(c)) span.className = "s";
    span.textContent = c;
    el.appendChild(span);
  }
}

// immediate = true  -> save to history right away (popup open, refresh button)
// immediate = false -> option changed, wait 0.6s so quick changes don't fill the history
function run(immediate) {
  const raw = $("len").value.trim();
  const len = Number(raw);
  const valid = raw !== "" && Number.isInteger(len) && len >= MIN_LEN && len <= MAX_LEN;
  $("lenHint").classList.toggle("bad", !valid);
  if (!valid) return;

  const opts = {
    length: len,
    upper: $("upper").checked, lower: $("lower").checked,
    numbers: $("numbers").checked, special: $("special").checked,
  };
  if (!opts.upper && !opts.lower && !opts.numbers && !opts.special) {
    $("upper").checked = opts.upper = true;
  }
  render(generate(opts));
  updatePinButton();

  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToHistory, immediate ? 0 : 600);
}

// ---------- saving ----------

function persist() {
  chrome.storage.local.set({ history: history, pinned: pinned });
}

function isPinned(pw) {
  return pinned.some(item => item.pw === pw);
}

// Add the current password to the top of the history, keep only the last 10
function saveToHistory() {
  const pw = $("pw").textContent;
  if (!pw) return;
  history = history.filter(item => item.pw !== pw);      // no duplicates
  history.unshift({ pw: pw, time: Date.now() });
  history = history.slice(0, MAX_HISTORY);
  persist();
  renderSaved();
}

// Pin saves a password permanently, pinning again removes it
function togglePin(pw) {
  if (isPinned(pw)) {
    pinned = pinned.filter(item => item.pw !== pw);
  } else {
    pinned.unshift({ pw: pw, time: Date.now() });
  }
  persist();
  renderSaved();
  updatePinButton();
}

function updatePinButton() {
  const on = isPinned($("pw").textContent);
  $("pinBtn").classList.toggle("on", on);
  $("pinBtn").title = on ? "Unpin this password" : "Pin this password";
}

// ---------- saved list on screen ----------

const ICON = {
  pin: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
  copy: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
  trash: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
};

function iconButton(svg, title, onClick, on) {
  const b = document.createElement("button");
  b.className = "icon" + (on ? " on" : "");
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = svg;                     // svg text is fixed above, never user data
  b.addEventListener("click", onClick);
  return b;
}

function showToast(text) {
  $("toast").textContent = text;
  setTimeout(() => $("toast").textContent = "", 2000);
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); showToast("Password copied"); }
  catch { showToast("Copy failed. Select the password and copy it manually."); }
}

function fillList(box, items, emptyText, isPinnedList) {
  box.textContent = "";
  if (items.length === 0) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = emptyText;
    box.appendChild(p);
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "item";

    const text = document.createElement("div");
    text.className = "itemText";
    const pw = document.createElement("div");
    pw.className = "itemPw";
    pw.textContent = item.pw;
    const time = document.createElement("div");
    time.className = "itemTime";
    time.textContent = new Date(item.time).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    text.append(pw, time);

    const btns = document.createElement("div");
    btns.className = "itemBtns";
    btns.appendChild(iconButton(ICON.copy, "Copy", () => copyText(item.pw)));
    if (isPinnedList) {
      btns.appendChild(iconButton(ICON.trash, "Remove from pinned", () => togglePin(item.pw)));
    } else {
      btns.appendChild(iconButton(ICON.pin, isPinned(item.pw) ? "Unpin" : "Pin", () => togglePin(item.pw), isPinned(item.pw)));
    }
    row.append(text, btns);
    box.appendChild(row);
  }
}

function renderSaved() {
  fillList($("pinnedList"), pinned, "Nothing pinned yet. Tap the pin to keep a password forever.", true);
  fillList($("historyList"), history, "No passwords yet.", false);
}

// ---------- tabs ----------

function showTab(name) {
  $("viewGen").hidden = name !== "gen";
  $("viewSaved").hidden = name !== "saved";
  $("tabGen").classList.toggle("active", name === "gen");
  $("tabSaved").classList.toggle("active", name === "saved");
}
$("tabGen").addEventListener("click", () => showTab("gen"));
$("tabSaved").addEventListener("click", () => showTab("saved"));

// ---------- buttons and events ----------

$("copy").addEventListener("click", () => copyText($("pw").textContent));
$("pinBtn").addEventListener("click", () => togglePin($("pw").textContent));
$("regen").addEventListener("click", () => run(true));
$("clearHistory").addEventListener("click", () => {
  history = [];
  persist();
  renderSaved();
});

["len","upper","lower","numbers","special"].forEach(id =>
  $(id).addEventListener("input", () => run(false)));
$("len").addEventListener("change", () => {
  const n = Math.round(Number($("len").value));
  $("len").value = isNaN(n) ? 14 : Math.min(MAX_LEN, Math.max(MIN_LEN, n));
  run(false);
});

// Load what was saved earlier, then make the first password
chrome.storage.local.get(["history", "pinned"]).then(data => {
  history = data.history || [];
  pinned = data.pinned || [];
  renderSaved();
  run(true);
});
