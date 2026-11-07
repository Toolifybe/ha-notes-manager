/**
 * Notes Manager Card for Home Assistant
 * v3.0.0
 */

const CARD_VERSION = "3.0.0";

const DEFAULT_LABELS = {
  title: "Notities",
  type_text: "Tekst", type_checklist: "Checklist", type_numbered: "Genummerd",
  field_title: "Titel", field_content: "Inhoud", field_category: "Categorie",
  field_reminder: "Herinnering (optioneel)", field_images: "Afbeeldingen", field_color: "Kleur",
  btn_save: "Opslaan", btn_cancel: "Annuleren", btn_add_task: "Taak toevoegen",
  btn_add_item: "Item toevoegen", pin_label: "Vastpinnen bovenaan",
  no_category: "— Geen categorie —", new_category: "Nieuwe categorie...",
  new_category_placeholder: "Naam nieuwe categorie...", category_placeholder: "Naam nieuwe categorie...",
  empty_state: "Geen notities. Klik op + om te beginnen.", empty_search: "Geen notities gevonden voor",
  search_placeholder: "Zoek in notities...", filter_all: "Alle",
  delete_title: "Notitie verwijderen?", delete_confirm: "Weet je zeker dat je deze notitie wilt verwijderen?",
  btn_delete: "Verwijderen", modal_new: "Nieuwe notitie", modal_edit: "Notitie bewerken",
  markdown_hint: "(ondersteunt Markdown)", markdown_placeholder: "Schrijf je notitie hier...",
  task_placeholder: "Taak omschrijving...", item_placeholder: "Item omschrijving...",
  title_placeholder: "Voer een titel in...", image_upload: "Klik of sleep een afbeelding hier",
  pin_yes: "Losmaken", pin_no: "Vastpinnen", reminder_expired: "(verlopen)",
  btn_edit: "Bewerken", btn_duplicate: "Dupliceren", duplicate_prefix: "Kopie van",
  field_priority: "Prioriteit", priority_none: "— Geen prioriteit —",
  priority_low: "Laag", priority_medium: "Normaal", priority_high: "Hoog",
  count_one: "1 notitie", count_many: "{n} notities", reminders_today_one: "1 herinnering vandaag", reminders_today: "{n} herinneringen vandaag",
  open_tasks: "{n} open", error_save: "Opslaan of laden mislukt. Je wijziging is niet bewaard.",
};

const COLORS = {
  yellow: "#f9a825", blue: "#1e88e5", green: "#43a047",
  pink: "#e91e63", purple: "#8e24aa", orange: "#fb8c00",
};
const COLOR_NAMES = { yellow: "Geel", blue: "Blauw", green: "Groen", pink: "Roze", purple: "Paars", orange: "Oranje" };

// Material Design icon, rendered by Home Assistant
const ic = name => `<ha-icon icon="mdi:${name}"></ha-icon>`;

// Everything from notes goes through esc() before it lands in innerHTML.
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Images: uploaded photos (data:image), web links or local paths only
function safeImg(url) {
  const u = String(url ?? "").trim();
  return /^(data:image\/|https?:\/\/|\/(?!\/))/i.test(u) ? u : "";
}

function shrinkCanvas(img, max, quality) {
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

// Photos are stored inside the notes file: keep them small (max 1280 px, JPEG)
function shrinkImage(file, max = 1280, quality = 0.82) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        if (Math.max(img.width, img.height) <= max && file.size < 300000) { resolve(reader.result); return; }
        resolve(shrinkCanvas(img, max, quality));
      };
      img.onerror = () => resolve(reader.result);
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Older notes can hold multi-MB photos; shrink them when the note is saved
function shrinkDataUrl(url, max = 1280, quality = 0.82) {
  if (!/^data:image\//.test(url || "") || url.length < 400000) return Promise.resolve(url);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const out = shrinkCanvas(img, max, quality);
      resolve(out.length < url.length ? out : url);
    };
    img.onerror = () => resolve(url);
    img.src = url;
  });
}

// Markdown → HTML. The text is escaped first (also quotes), links only http(s).
function renderMarkdown(text) {
  if (!text) return "";
  const link = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  return esc(text)
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => link(url, label))
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, (m, pre, url) => pre + link(url, url))
    .replace(/\n/g, "<br>");
}

// Highlight a search term in the TEXT of an element (not in its HTML),
// so markup and entities never break and Markdown stays formatted.
function markText(root, query) {
  if (!query) return;
  const q = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(node => {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let i = lower.indexOf(q);
    if (i < 0 || node.parentElement?.closest("mark")) return;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (i >= 0) {
      frag.appendChild(document.createTextNode(text.slice(last, i)));
      const m = document.createElement("mark");
      m.textContent = text.slice(i, i + q.length);
      frag.appendChild(m);
      last = i + q.length;
      i = lower.indexOf(q, last);
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag, node);
  });
}

// ISO string → value for <input type=datetime-local> (local time, no shift)
function isoToLocalInput(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

const STYLES = `
  :host {
    display:block;
    --nm-txt:  var(--primary-text-color, #1f1f1f);
    --nm-sub:  var(--secondary-text-color, #6b6b6b);
    --nm-off:  var(--disabled-text-color, #bdbdbd);
    --nm-line: var(--divider-color, #e0e0e0);
    --nm-bg:   var(--ha-card-background, var(--card-background-color, #fff));
    --nm-acc:  var(--primary-color, #03a9f4);
    --nm-red:  var(--error-color, #db4437);
    --nm-tile: color-mix(in srgb, var(--nm-txt) 5%, transparent);
    --nm-tile2: color-mix(in srgb, var(--nm-txt) 9%, transparent);
    --nm-accbg: color-mix(in srgb, var(--nm-acc) 13%, transparent);
    --mdc-icon-size: 18px;
  }
  ha-card {
    padding:0; overflow:hidden; color:var(--nm-txt); background:var(--nm-bg);
    border-radius:var(--ha-card-border-radius, 12px);
    border:var(--ha-card-border-width, 1px) solid var(--ha-card-border-color, var(--nm-line));
  }
  button { font-family:inherit; color:inherit; }
  ha-icon { display:inline-flex; flex:none; }

  /* Header */
  .kop { display:flex; align-items:center; gap:12px; padding:14px 16px; }
  .chip { flex:none; width:36px; height:36px; border-radius:10px; display:grid; place-items:center;
          background:var(--nm-accbg); color:var(--nm-acc); --mdc-icon-size:20px; }
  .kop-txt { min-width:0; flex:1; }
  .kop h2 { margin:0; font-size:16px; font-weight:700; line-height:1.25; }
  .kop p { margin:1px 0 0; font-size:12px; line-height:1.35; color:var(--nm-sub); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .add-btn { flex:none; width:36px; height:36px; border:none; border-radius:10px; display:grid; place-items:center; cursor:pointer;
             background:var(--nm-acc); color:var(--text-primary-color, #fff); --mdc-icon-size:22px; }
  .add-btn:hover { filter:brightness(.92); }

  .body { padding:0 16px 16px; }
  .nm-error { display:none; margin:0 0 10px; padding:8px 12px; border-radius:8px; background:color-mix(in srgb, var(--nm-red) 12%, transparent); color:var(--nm-red); font-size:13px; }
  .nm-error.show { display:block; }

  /* Search + categories */
  .search-bar { display:flex; align-items:center; gap:6px; padding:0 6px 0 10px; border:1px solid var(--nm-line); border-radius:8px; background:var(--nm-tile); margin-bottom:10px; color:var(--nm-sub); }
  .search-bar:focus-within { border-color:var(--nm-acc); }
  .search-bar input { flex:1; min-width:0; border:none; background:transparent; color:var(--nm-txt); font-size:14px; padding:8px 0; outline:none; font-family:inherit; }
  .clear-btn { display:none; }
  .clear-btn.visible { display:inline-grid; }
  .category-bar { display:flex; gap:4px; flex-wrap:wrap; margin-bottom:12px; }
  .category-bar:empty { display:none; }
  .cat-btn { border:none; background:none; padding:5px 12px; font-size:13px; font-weight:600; border-radius:999px; cursor:pointer; color:var(--nm-sub); white-space:nowrap; }
  .cat-btn:hover { color:var(--nm-txt); }
  .cat-btn.active { background:var(--nm-accbg); color:var(--nm-acc); }

  /* Icon buttons */
  .icon-btn { display:inline-grid; place-items:center; width:30px; height:30px; flex:none; padding:0; border:none; border-radius:8px;
              background:none; color:var(--nm-sub); cursor:pointer; --mdc-icon-size:17px; }
  .icon-btn:hover { background:var(--nm-tile2); color:var(--nm-txt); }
  .icon-btn.danger:hover { color:var(--nm-red); }

  /* Notes grid */
  .notes-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px; align-items:start; }
  .note-card { --c: var(--nm-acc); position:relative; border-radius:10px; padding:10px 10px 8px 12px; cursor:pointer;
               background:color-mix(in srgb, var(--c) 12%, var(--nm-bg)); box-shadow:inset 3px 0 0 var(--c); transition:background .15s; min-width:0; }
  .note-card:hover { background:color-mix(in srgb, var(--c) 18%, var(--nm-bg)); }
  .note-header { display:flex; align-items:flex-start; gap:6px; margin-bottom:4px; }
  .note-title-wrap { display:flex; align-items:flex-start; gap:4px; flex:1; min-width:0; }
  .pin-badge { color:var(--c); --mdc-icon-size:15px; margin-top:1px; }
  .note-title { font-weight:700; font-size:14px; line-height:1.3; word-break:break-word; }
  .note-actions { display:flex; margin:-4px -4px 0 0; opacity:0; transition:opacity .15s; }
  .note-card:hover .note-actions, .note-card:focus-within .note-actions { opacity:1; }
  @media (hover: none) { .note-actions { opacity:1; } }
  .badges { display:flex; flex-wrap:wrap; gap:4px; margin:2px 0 6px; }
  .badge { display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:600; border-radius:999px; padding:1px 8px 1px 6px; background:var(--nm-tile2); color:var(--nm-sub); --mdc-icon-size:12px; }
  .badge.high   { background:color-mix(in srgb, var(--nm-red) 15%, transparent); color:var(--nm-red); }
  .badge.medium { background:color-mix(in srgb, var(--warning-color, #ffa600) 18%, transparent); color:var(--warning-color, #ffa600); }
  .badge.low    { background:color-mix(in srgb, var(--success-color, #43a047) 15%, transparent); color:var(--success-color, #43a047); }
  .note-body { font-size:13px; line-height:1.45; word-break:break-word; }
  .note-body h1, .note-body h2, .note-body h3 { margin:4px 0; line-height:1.3; }
  .note-body h1 { font-size:16px; } .note-body h2 { font-size:15px; } .note-body h3 { font-size:14px; }
  .note-body code { background:var(--nm-tile2); padding:1px 4px; border-radius:4px; font-family:monospace; }
  .note-body a { color:var(--nm-acc); }
  .checklist-item, .numbered-item { display:flex; align-items:flex-start; gap:8px; margin:2px 0; font-size:13px; line-height:1.4; }
  .checklist-item input[type=checkbox] { cursor:pointer; width:16px; height:16px; margin:1px 0 0; flex:none; accent-color:var(--c); }
  .checklist-item.done span { text-decoration:line-through; opacity:.5; }
  .num-badge { font-weight:700; color:var(--nm-sub); min-width:18px; text-align:right; flex:none; }
  .note-images { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
  .note-images img { width:56px; height:56px; object-fit:cover; border-radius:6px; cursor:zoom-in; }
  .note-foot { display:flex; align-items:center; justify-content:space-between; gap:6px; margin-top:8px; font-size:11px; color:var(--nm-sub); }
  .note-reminder { display:inline-flex; align-items:center; gap:3px; color:var(--warning-color, #e65100); font-weight:600; --mdc-icon-size:13px; }
  .note-reminder.expired { color:var(--nm-sub); font-weight:400; }
  .empty-state { text-align:center; padding:28px 16px; color:var(--nm-sub); grid-column:1/-1; font-size:14px; }
  .empty-state ha-icon { --mdc-icon-size:36px; opacity:.6; margin-bottom:6px; }
  .empty-state p { margin:0; }
  mark { background:color-mix(in srgb, #ffd600 55%, transparent); color:inherit; border-radius:2px; padding:0 1px; }

  /* Modals */
  .modal-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.5); z-index:9999; align-items:center; justify-content:center; padding:12px; box-sizing:border-box; }
  .modal-overlay.open { display:flex; }
  .modal { background:var(--nm-bg); color:var(--nm-txt); border-radius:16px; padding:20px; width:100%; max-width:540px; box-shadow:0 12px 40px rgba(0,0,0,.35); max-height:90vh; overflow-y:auto; box-sizing:border-box; }
  .modal.small { max-width:360px; text-align:center; }
  .modal h3 { margin:0 0 16px; font-size:18px; font-weight:700; }
  .modal.small p { color:var(--nm-sub); font-size:14px; margin:0; }
  .form-group { margin-bottom:12px; }
  .form-group > label { display:block; font-size:12px; margin-bottom:4px; color:var(--nm-sub); font-weight:600; }
  .form-group > label span { font-weight:400; }
  .field, .form-group input[type=text], .form-group input[type=datetime-local], .form-group textarea, .form-group select {
    width:100%; padding:8px 10px; border:1px solid var(--nm-line); border-radius:8px; font-size:14px;
    background:var(--nm-tile); color:var(--nm-txt); box-sizing:border-box; font-family:inherit; }
  .form-group select option { background:var(--nm-bg); color:var(--nm-txt); }
  .field:focus, .form-group input:focus, .form-group textarea:focus, .form-group select:focus { outline:none; border-color:var(--nm-acc); }
  .form-group textarea { resize:vertical; min-height:100px; }
  .form-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .invalid { border-color:var(--nm-red) !important; }
  .hint { font-size:12px; color:var(--nm-sub); margin-top:4px; }
  .type-toggle { display:flex; gap:2px; padding:3px; border-radius:10px; background:var(--nm-tile); margin-bottom:12px; }
  .type-btn { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:7px 6px; border:none; border-radius:8px; background:none;
              color:var(--nm-sub); font-size:13px; font-weight:600; cursor:pointer; --mdc-icon-size:16px; }
  .type-btn.active { background:var(--nm-bg); color:var(--nm-txt); box-shadow:0 1px 2px rgba(0,0,0,.12); }
  .pin-toggle { display:flex; align-items:center; gap:8px; margin-bottom:12px; cursor:pointer; font-size:14px; }
  .pin-toggle input { width:18px; height:18px; margin:0; accent-color:var(--nm-acc); }
  .color-picker { display:flex; gap:8px; flex-wrap:wrap; }
  .color-option { width:28px; height:28px; border-radius:50%; cursor:pointer; box-shadow:0 0 0 2px var(--nm-bg), 0 0 0 2px transparent; transition:box-shadow .15s; }
  .color-option.selected { box-shadow:0 0 0 2px var(--nm-bg), 0 0 0 4px var(--nm-txt); }
  .checklist-editor { display:flex; flex-direction:column; gap:6px; }
  .checklist-row { display:flex; align-items:center; gap:8px; }
  .checklist-row input[type=checkbox] { flex:none; width:18px; height:18px; margin:0; accent-color:var(--nm-acc); }
  .checklist-row .field { flex:1; min-width:0; padding:7px 10px; }
  .checklist-row .num-badge { min-width:22px; }
  .add-item-btn { align-self:flex-start; display:inline-flex; align-items:center; gap:4px; margin-top:6px; padding:6px 10px; border:none; border-radius:8px;
                  background:var(--nm-tile); cursor:pointer; font-size:13px; font-weight:600; --mdc-icon-size:16px; }
  .add-item-btn:hover { background:var(--nm-tile2); }
  .image-upload-area { display:flex; align-items:center; justify-content:center; gap:8px; border:2px dashed var(--nm-line); border-radius:10px; padding:14px; cursor:pointer; font-size:13px; color:var(--nm-sub); }
  .image-upload-area:hover, .image-upload-area.drag { border-color:var(--nm-acc); color:var(--nm-acc); }
  .image-previews { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .image-preview-wrap { position:relative; }
  .image-preview-wrap img { width:64px; height:64px; object-fit:cover; border-radius:8px; display:block; }
  .remove-img { position:absolute; top:-6px; right:-6px; width:20px; height:20px; border:none; border-radius:50%; display:grid; place-items:center; padding:0;
                background:var(--nm-red); color:#fff; cursor:pointer; --mdc-icon-size:13px; }
  .modal-actions { display:flex; justify-content:flex-end; gap:8px; margin-top:16px; }
  .modal.small .modal-actions { justify-content:center; }
  .btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:8px 16px; border:none; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600; }
  .btn:disabled { opacity:.5; cursor:default; }
  .btn-primary { background:var(--nm-acc); color:var(--text-primary-color, #fff); }
  .btn-primary:hover { filter:brightness(.92); }
  .btn-secondary { background:var(--nm-tile); }
  .btn-secondary:hover { background:var(--nm-tile2); }
  .btn-danger { background:var(--nm-red); color:#fff; }
  .lightbox { display:none; position:fixed; inset:0; background:rgba(0,0,0,.85); z-index:99999; align-items:center; justify-content:center; cursor:zoom-out; }
  .lightbox.open { display:flex; }
  .lightbox img { max-width:92vw; max-height:92vh; border-radius:8px; }
  @media (max-width:480px) { .form-row { grid-template-columns:1fr; } .type-btn span { display:none; } }
`;

class NotesManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._notes = [];
    this._editingNote = null;
    this._initialized = false;
    this._searchQuery = "";
    this._activeCategory = "all";
    this._categories = [];
    this._l = { ...DEFAULT_LABELS };
  }

  setConfig(config) {
    this._config = config || {};
    const own = Object.fromEntries(Object.entries(this._config.labels || {}).filter(([, v]) => v !== "" && v != null));
    this._l = { ...DEFAULT_LABELS, ...own };
    // "category": this card only shows (and creates) notes of one category
    this._fixedCategory = String(this._config.category || "").trim();
    if (this._fixedCategory) this._activeCategory = this._fixedCategory;
    if (this._initialized) { this._render(); this._renderNotes(); }
  }

  getCardSize() { return 4; }
  static getStubConfig() { return {}; }
  static getConfigElement() { return document.createElement("notes-manager-card-editor"); }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._fetchNotes();
    }
    if (this.isConnected) this._subscribe();
  }

  connectedCallback() {
    if (this._hass) this._subscribe();
    this._onVisible = () => { if (document.visibilityState === "visible" && this._hass) this._fetchNotes(); };
    document.addEventListener("visibilitychange", this._onVisible);
  }

  disconnectedCallback() {
    if (this._unsub) { try { this._unsub(); } catch (e) {} }
    this._unsub = null;
    document.removeEventListener("visibilitychange", this._onVisible);
  }

  // notes_manager/subscribe works for every user; subscribeEvents on a custom
  // event only for admins (fallback for an older integration)
  _subscribe() {
    if (this._unsub || this._subscribing) return;
    this._subscribing = true;
    const conn = this._hass.connection;
    const onEvent = data => this._applyChange(data || {});
    conn.subscribeMessage(onEvent, { type: "notes_manager/subscribe" })
      .catch(() => conn.subscribeEvents(ev => onEvent(ev.data), "notes_manager_updated"))
      .then(unsub => {
        this._subscribing = false;
        if (!this.isConnected) { unsub(); return; }
        this._unsub = unsub;
      })
      .catch(e => { this._subscribing = false; console.warn("Notes: no live updates", e); });
  }

  // Apply a change locally instead of downloading all notes (and photos) again
  _applyChange(data) {
    if (data.action === "delete" && data.note_id) {
      this._notes = this._notes.filter(n => n.id !== data.note_id);
    } else if (data.note?.id) {
      const i = this._notes.findIndex(n => n.id === data.note.id);
      if (i >= 0) this._notes[i] = data.note; else this._notes.push(data.note);
    } else {
      this._fetchNotes();
      return;
    }
    this._updateCategories();
    this._renderCategoryFilter();
    this._renderNotes();
  }

  _updateCategories() {
    const cats = new Set();
    this._notes.forEach(n => { if (n.category) cats.add(n.category); });
    this._categories = [...cats].sort((a, b) => a.localeCompare(b, "nl"));
  }

  _showError(e) {
    const el = this.shadowRoot?.getElementById("nm-error");
    console.error("Notes:", e);
    if (!el) return;
    const detail = e?.body?.error || e?.body?.message || e?.message || "";
    el.textContent = this._l.error_save + (detail ? ` (${detail})` : "");
    el.classList.add("show");
    clearTimeout(this._errTimer);
    this._errTimer = setTimeout(() => el.classList.remove("show"), 10000);
  }

  async _fetchNotes() {
    try {
      this._notes = await this._hass.callApi("GET", "notes_manager/notes");
      this._updateCategories();
      this._renderCategoryFilter();
      this._renderNotes();
    } catch (e) { this._showError(e); }
  }

  // Returns true when the server really saved it
  async _saveNote(noteData, id = null) {
    try {
      const note = id
        ? await this._hass.callApi("PUT", `notes_manager/notes/${encodeURIComponent(id)}`, noteData)
        : await this._hass.callApi("POST", "notes_manager/notes", noteData);
      this._applyChange({ action: id ? "update" : "add", note });
      return true;
    } catch (e) {
      this._showError(e);
      this._fetchNotes();
      return false;
    }
  }

  async _deleteNote(id) {
    try {
      await this._hass.callApi("DELETE", `notes_manager/notes/${encodeURIComponent(id)}`);
      this._applyChange({ action: "delete", note_id: id });
    } catch (e) { this._showError(e); }
  }

  _renderCategoryFilter() {
    const bar = this.shadowRoot.getElementById("category-bar");
    if (!bar) return;
    bar.innerHTML = "";
    if (this._fixedCategory || !this._categories.length) return;
    const add = (value, text) => {
      const btn = document.createElement("button");
      btn.className = "cat-btn" + (this._activeCategory === value ? " active" : "");
      btn.textContent = text;
      btn.addEventListener("click", () => { this._activeCategory = value; this._renderCategoryFilter(); this._renderNotes(); });
      bar.appendChild(btn);
    };
    add("all", this._l.filter_all);
    this._categories.forEach(cat => add(cat, cat));
  }

  _render() {
    const L = k => esc(this._l[k]);
    const title = this._config?.title || this._l.title;
    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <ha-card>
        <div class="kop">
          <div class="chip">${ic("note-text-outline")}</div>
          <div class="kop-txt">
            <h2>${esc(title)}</h2>
            <p id="kop-sub">&nbsp;</p>
          </div>
          <button class="add-btn" id="add-btn" title="${L("modal_new")}">${ic("plus")}</button>
        </div>
        <div class="body">
          <div class="nm-error" id="nm-error"></div>
          <div class="search-bar">
            ${ic("magnify")}
            <input type="text" id="search-input" placeholder="${L("search_placeholder")}" />
            <button class="icon-btn clear-btn" id="clear-search" title="Wissen">${ic("close")}</button>
          </div>
          <div class="category-bar" id="category-bar"></div>
          <div class="notes-grid" id="notes-grid"></div>
        </div>
      </ha-card>

      <div class="modal-overlay" id="note-modal">
        <div class="modal">
          <h3 id="modal-title">${L("modal_new")}</h3>
          <div class="type-toggle">
            <button class="type-btn active" id="type-text-btn">${ic("text")}<span>${L("type_text")}</span></button>
            <button class="type-btn" id="type-check-btn">${ic("checkbox-marked-outline")}<span>${L("type_checklist")}</span></button>
            <button class="type-btn" id="type-numbered-btn">${ic("format-list-numbered")}<span>${L("type_numbered")}</span></button>
          </div>

          <div class="form-group">
            <label>${L("field_title")}</label>
            <input type="text" id="note-title-input" placeholder="${L("title_placeholder")}" />
          </div>

          <div class="form-group" id="text-section">
            <label>${L("field_content")} <span>${L("markdown_hint")}</span></label>
            <textarea id="note-content-input" placeholder="${L("markdown_placeholder")}"></textarea>
            <div class="hint">**vet** &nbsp;·&nbsp; *cursief* &nbsp;·&nbsp; # Kop &nbsp;·&nbsp; \`code\` &nbsp;·&nbsp; [tekst](url)</div>
          </div>

          <div class="form-group" id="checklist-section" style="display:none">
            <label>${L("type_checklist")}</label>
            <div class="checklist-editor" id="checklist-editor"></div>
            <button class="add-item-btn" id="add-checklist-item">${ic("plus")}${L("btn_add_task")}</button>
          </div>

          <div class="form-group" id="numbered-section" style="display:none">
            <label>${L("type_numbered")}</label>
            <div class="checklist-editor" id="numbered-editor"></div>
            <button class="add-item-btn" id="add-numbered-item">${ic("plus")}${L("btn_add_item")}</button>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>${L("field_category")}</label>
              <select id="category-select">
                <option value="">${L("no_category")}</option>
                <option value="__new__">${L("new_category")}</option>
              </select>
              <div id="category-new-wrap" style="margin-top:6px;display:none;">
                <input type="text" id="category-new-input" placeholder="${L("category_placeholder")}" />
              </div>
            </div>
            <div class="form-group">
              <label>${L("field_priority")}</label>
              <select id="priority-select">
                <option value="">${L("priority_none")}</option>
                <option value="low">${L("priority_low")}</option>
                <option value="medium">${L("priority_medium")}</option>
                <option value="high">${L("priority_high")}</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label>${L("field_reminder")}</label>
            <input type="datetime-local" id="reminder-input" />
          </div>

          <div class="form-group">
            <label>${L("field_images")}</label>
            <div class="image-upload-area" id="image-upload-area">
              ${ic("camera-outline")}<span>${L("image_upload")}</span>
              <input type="file" id="image-file-input" accept="image/*" multiple style="display:none" />
            </div>
            <div class="image-previews" id="image-previews"></div>
          </div>

          <div class="form-group">
            <label>${L("field_color")}</label>
            <div class="color-picker" id="color-picker">
              ${Object.entries(COLORS).map(([k, c]) => `<div class="color-option" data-color="${k}" style="background:${c}" title="${COLOR_NAMES[k]}"></div>`).join("")}
            </div>
          </div>

          <label class="pin-toggle"><input type="checkbox" id="pin-input" /> ${L("pin_label")}</label>

          <div class="modal-actions">
            <button class="btn btn-secondary" id="cancel-btn">${L("btn_cancel")}</button>
            <button class="btn btn-primary" id="save-btn">${L("btn_save")}</button>
          </div>
        </div>
      </div>

      <div class="modal-overlay" id="confirm-modal">
        <div class="modal small">
          <h3>${L("delete_title")}</h3>
          <p>${L("delete_confirm")}</p>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="confirm-cancel">${L("btn_cancel")}</button>
            <button class="btn btn-danger" id="confirm-delete">${ic("delete-outline")}${L("btn_delete")}</button>
          </div>
        </div>
      </div>

      <div class="lightbox" id="lightbox"><img id="lightbox-img" src="" alt="" /></div>
    `;
    // clicking next to a dialog closes it
    this.shadowRoot.querySelectorAll(".modal-overlay").forEach(ov =>
      ov.addEventListener("click", e => { if (e.target === ov) ov.classList.remove("open"); }));
    this._setupEventListeners();
    this._renderCategoryFilter();
  }

  _setupEventListeners() {
    const r = this.shadowRoot;
    let selectedColor = "yellow";
    let selectedType = "text";
    let pendingImages = [];
    let pendingDeleteId = null;

    // Search
    const searchInput = r.getElementById("search-input");
    const clearBtn = r.getElementById("clear-search");
    searchInput.addEventListener("input", () => {
      this._searchQuery = searchInput.value.trim().toLowerCase();
      clearBtn.classList.toggle("visible", this._searchQuery.length > 0);
      this._renderNotes();
    });
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      this._searchQuery = "";
      clearBtn.classList.remove("visible");
      this._renderNotes();
    });

    const updateColorUI = (color) => {
      selectedColor = COLORS[color] ? color : "yellow";
      r.querySelectorAll(".color-option").forEach(el => el.classList.toggle("selected", el.dataset.color === selectedColor));
    };

    const makeRow = (text, placeholder, lead) => {
      const row = document.createElement("div");
      row.className = "checklist-row";
      row.appendChild(lead);
      const inp = document.createElement("input");
      inp.type = "text"; inp.className = "field"; inp.placeholder = placeholder; inp.value = text;
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = "icon-btn danger"; btn.title = this._l.btn_delete;
      btn.innerHTML = ic("delete-outline");
      row.appendChild(inp); row.appendChild(btn);
      return { row, inp, btn };
    };

    const addChecklistRow = (text = "", checked = false, focus = true) => {
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = checked;
      const { row, inp, btn } = makeRow(text, this._l.task_placeholder, cb);
      btn.addEventListener("click", () => row.remove());
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addChecklistRow(); } });
      r.getElementById("checklist-editor").appendChild(row);
      if (focus) inp.focus();
    };

    const addNumberedRow = (text = "", focus = true) => {
      const editor = r.getElementById("numbered-editor");
      const updateNumbers = () => editor.querySelectorAll(".num-badge").forEach((b, i) => { b.textContent = (i + 1) + "."; });
      const badge = document.createElement("span");
      badge.className = "num-badge";
      const { row, inp, btn } = makeRow(text, this._l.item_placeholder, badge);
      btn.addEventListener("click", () => { row.remove(); updateNumbers(); });
      inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addNumberedRow(); } });
      editor.appendChild(row);
      updateNumbers();
      if (focus) inp.focus();
    };

    // Items currently in the editor of a type, as [{text, checked}]
    const collectItems = (type) => {
      if (type === "text") {
        return r.getElementById("note-content-input").value.split("\n")
          .map(l => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim()).filter(Boolean)
          .map(text => ({ text, checked: false }));
      }
      const editor = r.getElementById(type === "checklist" ? "checklist-editor" : "numbered-editor");
      return [...editor.querySelectorAll(".checklist-row")].map(row => ({
        text: row.querySelector("input[type=text]").value.trim(),
        checked: !!row.querySelector("input[type=checkbox]")?.checked,
      })).filter(i => i.text);
    };

    const updateTypeUI = (type) => {
      selectedType = type;
      r.getElementById("type-text-btn").classList.toggle("active", type === "text");
      r.getElementById("type-check-btn").classList.toggle("active", type === "checklist");
      r.getElementById("type-numbered-btn").classList.toggle("active", type === "numbered");
      r.getElementById("text-section").style.display = type === "text" ? "" : "none";
      r.getElementById("checklist-section").style.display = type === "checklist" ? "" : "none";
      r.getElementById("numbered-section").style.display = type === "numbered" ? "" : "none";
    };

    // Switching type in the editor carries the content over instead of losing it
    const switchType = (type) => {
      if (type === selectedType) return;
      const items = collectItems(selectedType);
      if (type === "text") {
        const ta = r.getElementById("note-content-input");
        if (!ta.value.trim() && items.length) ta.value = items.map(i => "- " + i.text).join("\n");
      } else {
        const editor = r.getElementById(type === "checklist" ? "checklist-editor" : "numbered-editor");
        if (!editor.querySelector(".checklist-row")) {
          items.forEach(i => type === "checklist" ? addChecklistRow(i.text, i.checked, false) : addNumberedRow(i.text, false));
        }
      }
      updateTypeUI(type);
    };

    const renderImagePreviews = () => {
      const container = r.getElementById("image-previews");
      container.innerHTML = "";
      pendingImages.forEach((src, i) => {
        const wrap = document.createElement("div");
        wrap.className = "image-preview-wrap";
        wrap.innerHTML = `<img src="${esc(safeImg(src))}" /><button type="button" class="remove-img">${ic("close")}</button>`;
        wrap.querySelector(".remove-img").addEventListener("click", () => { pendingImages.splice(i, 1); renderImagePreviews(); });
        container.appendChild(wrap);
      });
    };

    const updateCategorySelect = (selectedCat = "") => {
      const sel = r.getElementById("category-select");
      const cats = [...new Set([...this._categories, ...(this._fixedCategory ? [this._fixedCategory] : [])])];
      sel.innerHTML = `<option value="">${esc(this._l.no_category)}</option>` +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("") +
        `<option value="__new__">${esc(this._l.new_category)}</option>`;
      if (selectedCat && !cats.includes(selectedCat)) {
        sel.value = "__new__";
        r.getElementById("category-new-input").value = selectedCat;
        r.getElementById("category-new-wrap").style.display = "block";
      } else {
        sel.value = selectedCat || "";
        r.getElementById("category-new-wrap").style.display = "none";
      }
    };

    r.getElementById("category-select").addEventListener("change", () => {
      const val = r.getElementById("category-select").value;
      r.getElementById("category-new-wrap").style.display = val === "__new__" ? "block" : "none";
      if (val === "__new__") setTimeout(() => r.getElementById("category-new-input").focus(), 50);
    });

    const openModal = (note = null) => {
      this._editingNote = note;
      r.getElementById("modal-title").textContent = note ? this._l.modal_edit : this._l.modal_new;
      r.getElementById("note-title-input").value = note?.title || "";
      r.getElementById("note-title-input").classList.remove("invalid");
      r.getElementById("note-content-input").value = note?.content || "";
      r.getElementById("pin-input").checked = note?.pinned || false;
      r.getElementById("priority-select").value = note?.priority || "";
      r.getElementById("reminder-input").value = isoToLocalInput(note?.reminder);
      r.getElementById("checklist-editor").innerHTML = "";
      r.getElementById("numbered-editor").innerHTML = "";
      pendingImages = note?.images ? [...note.images] : [];
      // a new note in a category card or filtered view gets that category
      const defaultCat = this._fixedCategory || (this._activeCategory !== "all" ? this._activeCategory : "");
      updateCategorySelect(note ? (note.category || "") : defaultCat);
      const type = note?.type || "text";
      updateTypeUI(type);
      updateColorUI(note?.color || this._config?.default_color || "yellow");
      if (type === "checklist") (note?.checklist || []).forEach(item => addChecklistRow(item.text, item.checked, false));
      if (type === "numbered") (note?.checklist || []).forEach(item => addNumberedRow(item.text, false));
      renderImagePreviews();
      r.getElementById("note-modal").classList.add("open");
      if (window.matchMedia?.("(hover: hover)").matches) setTimeout(() => r.getElementById("note-title-input").focus(), 50);
    };

    r.getElementById("add-btn").addEventListener("click", () => openModal());
    r.getElementById("type-text-btn").addEventListener("click", () => switchType("text"));
    r.getElementById("type-check-btn").addEventListener("click", () => switchType("checklist"));
    r.getElementById("type-numbered-btn").addEventListener("click", () => switchType("numbered"));
    r.getElementById("color-picker").addEventListener("click", e => {
      const opt = e.target.closest(".color-option");
      if (opt) updateColorUI(opt.dataset.color);
    });
    r.getElementById("add-checklist-item").addEventListener("click", () => addChecklistRow());
    r.getElementById("add-numbered-item").addEventListener("click", () => addNumberedRow());
    const drop = r.getElementById("image-upload-area");
    drop.addEventListener("click", e => { if (e.target.id !== "image-file-input") r.getElementById("image-file-input").click(); });
    drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
    drop.addEventListener("drop", e => {
      e.preventDefault();
      drop.classList.remove("drag");
      [...e.dataTransfer.files].forEach(f => this._readImageFile(f, pendingImages, renderImagePreviews));
    });
    r.getElementById("image-file-input").addEventListener("change", e => {
      [...e.target.files].forEach(f => this._readImageFile(f, pendingImages, renderImagePreviews));
      e.target.value = "";
    });
    r.getElementById("cancel-btn").addEventListener("click", () => r.getElementById("note-modal").classList.remove("open"));

    r.getElementById("save-btn").addEventListener("click", async () => {
      const titleInput = r.getElementById("note-title-input");
      const title = titleInput.value.trim();
      if (!title) { titleInput.classList.add("invalid"); titleInput.focus(); return; }
      titleInput.classList.remove("invalid");
      const checklist = selectedType === "text" ? [] : collectItems(selectedType)
        .map(i => ({ text: i.text, checked: selectedType === "checklist" ? i.checked : false }));
      const saveBtn = r.getElementById("save-btn");
      saveBtn.disabled = true;
      const images = await Promise.all(pendingImages.map(src => shrinkDataUrl(src)));
      const sel = r.getElementById("category-select").value;
      const noteData = {
        title,
        content: r.getElementById("note-content-input").value.trim(),
        color: selectedColor,
        type: selectedType,
        checklist,
        images,
        pinned: r.getElementById("pin-input").checked,
        priority: r.getElementById("priority-select").value,
        category: sel === "__new__" ? r.getElementById("category-new-input").value.trim() : sel,
        reminder: localInputToIso(r.getElementById("reminder-input").value),
      };
      const ok = await this._saveNote(noteData, this._editingNote?.id || null);
      saveBtn.disabled = false;
      if (ok) r.getElementById("note-modal").classList.remove("open");
    });

    r.getElementById("confirm-cancel").addEventListener("click", () => {
      r.getElementById("confirm-modal").classList.remove("open");
      pendingDeleteId = null;
    });
    r.getElementById("confirm-delete").addEventListener("click", async () => {
      if (pendingDeleteId) { await this._deleteNote(pendingDeleteId); pendingDeleteId = null; }
      r.getElementById("confirm-modal").classList.remove("open");
    });
    r.getElementById("lightbox").addEventListener("click", () => r.getElementById("lightbox").classList.remove("open"));

    this._openModal = openModal;
    this._triggerDelete = (id) => { pendingDeleteId = id; r.getElementById("confirm-modal").classList.add("open"); };
    this._openLightbox = (src) => { r.getElementById("lightbox-img").src = src; r.getElementById("lightbox").classList.add("open"); };
    this._toggleChecklistItem = async (noteId, itemIndex, checked) => {
      const note = this._notes.find(n => n.id === noteId);
      if (!note) return;
      const checklist = [...(note.checklist || [])];
      if (checklist[itemIndex]) checklist[itemIndex] = { ...checklist[itemIndex], checked };
      await this._saveNote({ checklist }, noteId);
    };
    this._togglePin = async (note) => { await this._saveNote({ pinned: !note.pinned }, note.id); };
  }

  async _duplicateNote(note) {
    await this._saveNote({
      title: `${this._l.duplicate_prefix} ${note.title}`,
      content: note.content || "",
      color: note.color || "yellow",
      type: note.type || "text",
      checklist: note.checklist ? JSON.parse(JSON.stringify(note.checklist)) : [],
      images: note.images ? [...note.images] : [],
      pinned: false,
      category: note.category || "",
      reminder: null,
      priority: note.priority || "",
    });
  }

  async _readImageFile(file, pendingImages, callback) {
    if (!file || !file.type.startsWith("image/")) return;
    pendingImages.push(await shrinkImage(file));
    callback();
  }

  _formatReminder(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    const str = d.toLocaleString("nl-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    return { str, expired: d < new Date() };
  }

  _renderHeader(visible) {
    const sub = this.shadowRoot.getElementById("kop-sub");
    if (!sub) return;
    const n = visible.length;
    const parts = [n === 1 ? this._l.count_one : this._l.count_many.replace("{n}", n)];
    const open = visible.filter(x => x.type === "checklist").reduce((s, x) => s + (x.checklist || []).filter(i => !i.checked).length, 0);
    if (open) parts.push(this._l.open_tasks.replace("{n}", open));
    const today = new Date().toDateString();
    const rem = visible.filter(x => x.reminder && new Date(x.reminder).toDateString() === today).length;
    if (rem) parts.push(rem === 1 ? this._l.reminders_today_one : this._l.reminders_today.replace("{n}", rem));
    sub.textContent = parts.join(" · ");
  }

  _renderNotes() {
    const grid = this.shadowRoot.getElementById("notes-grid");
    if (!grid) return;

    let notes = [...this._notes];
    if (this._activeCategory !== "all") notes = notes.filter(n => n.category === this._activeCategory);
    this._renderHeader(notes);

    const q = this._searchQuery;
    if (q) {
      notes = notes.filter(n =>
        n.title?.toLowerCase().includes(q) ||
        n.content?.toLowerCase().includes(q) ||
        n.category?.toLowerCase().includes(q) ||
        n.checklist?.some(i => i.text?.toLowerCase().includes(q))
      );
    }

    if (!notes.length) {
      grid.innerHTML = q
        ? `<div class="empty-state">${ic("magnify")}<p>${esc(this._l.empty_search)} '${esc(q)}'</p></div>`
        : `<div class="empty-state">${ic("note-outline")}<p>${esc(this._l.empty_state)}</p></div>`;
      return;
    }

    const pOrder = { high: 0, medium: 1, low: 2 };
    notes.sort((a, b) =>
      (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      (pOrder[a.priority] ?? 3) - (pOrder[b.priority] ?? 3) ||
      new Date(b.updated_at) - new Date(a.updated_at));

    grid.innerHTML = "";
    const priorityLabels = { high: this._l.priority_high, medium: this._l.priority_medium, low: this._l.priority_low };

    notes.forEach(note => {
      const color = COLORS[note.color] || COLORS.yellow;
      const date = new Date(note.updated_at).toLocaleDateString("nl-BE", { day: "numeric", month: "short", year: "numeric" });
      const reminder = this._formatReminder(note.reminder);

      let bodyHtml = "";
      if (note.type === "checklist" && note.checklist?.length) {
        bodyHtml = note.checklist.map((item, i) => `
          <label class="checklist-item ${item.checked ? "done" : ""}">
            <input type="checkbox" ${item.checked ? "checked" : ""} data-idx="${i}" />
            <span>${esc(item.text)}</span>
          </label>`).join("");
      } else if (note.type === "numbered" && note.checklist?.length) {
        bodyHtml = note.checklist.map((item, i) => `
          <div class="numbered-item"><span class="num-badge">${i + 1}.</span><span>${esc(item.text)}</span></div>`).join("");
      } else if (note.content) {
        bodyHtml = `<div class="note-body">${renderMarkdown(note.content)}</div>`;
      }

      const imgs = (note.images || []).map(safeImg).filter(Boolean);
      const badges = [
        priorityLabels[note.priority] ? `<span class="badge ${note.priority}">${ic("flag")}${esc(priorityLabels[note.priority])}</span>` : "",
        note.category && !this._fixedCategory ? `<span class="badge">${ic("folder-outline")}${esc(note.category)}</span>` : "",
      ].join("");

      const card = document.createElement("div");
      card.className = "note-card" + (note.pinned ? " pinned" : "");
      card.style.setProperty("--c", color);
      card.innerHTML = `
        <div class="note-header">
          <div class="note-title-wrap">
            ${note.pinned ? `<span class="pin-badge">${ic("pin")}</span>` : ""}
            <div class="note-title">${esc(note.title)}</div>
          </div>
          <div class="note-actions">
            <button class="icon-btn pin-btn" title="${esc(note.pinned ? this._l.pin_yes : this._l.pin_no)}">${ic(note.pinned ? "pin-off-outline" : "pin-outline")}</button>
            <button class="icon-btn dupe-btn" title="${esc(this._l.btn_duplicate)}">${ic("content-copy")}</button>
            <button class="icon-btn danger delete-btn" title="${esc(this._l.btn_delete)}">${ic("delete-outline")}</button>
          </div>
        </div>
        ${badges ? `<div class="badges">${badges}</div>` : ""}
        ${bodyHtml}
        ${imgs.length ? `<div class="note-images">${imgs.map((src, i) => `<img src="${esc(src)}" data-i="${i}" class="note-img" loading="lazy" />`).join("")}</div>` : ""}
        <div class="note-foot">
          ${reminder ? `<span class="note-reminder ${reminder.expired ? "expired" : ""}">${ic(reminder.expired ? "bell-check-outline" : "bell-outline")}${esc(reminder.str)}</span>` : "<span></span>"}
          <span>${esc(date)}</span>
        </div>`;
      if (q) markText(card, q);

      card.querySelector(".pin-btn").addEventListener("click", e => { e.stopPropagation(); this._togglePin(note); });
      card.querySelector(".dupe-btn").addEventListener("click", e => { e.stopPropagation(); this._duplicateNote(note); });
      card.querySelector(".delete-btn").addEventListener("click", e => { e.stopPropagation(); this._triggerDelete(note.id); });
      card.querySelectorAll("input[type=checkbox][data-idx]").forEach(cb => {
        cb.addEventListener("click", e => e.stopPropagation());
        cb.addEventListener("change", e => { e.stopPropagation(); this._toggleChecklistItem(note.id, parseInt(cb.dataset.idx), cb.checked); });
      });
      card.querySelectorAll(".note-img").forEach(img => {
        img.addEventListener("click", e => { e.stopPropagation(); this._openLightbox(imgs[+img.dataset.i]); });
      });
      // tap/click a note to edit it (not on links, buttons, checkboxes or photos)
      card.addEventListener("click", e => {
        if (e.target.closest("a, button, input, label, .note-img")) return;
        this._openModal(note);
      });
      grid.appendChild(card);
    });
  }
}

// ─── CARD EDITOR ──────────────────────────────────────────────
class NotesManagerCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    this._render();
  }

  _set(key, value) {
    const cfg = { ...this._config };
    if (value === "" || value == null) delete cfg[key]; else cfg[key] = value;
    this._config = cfg;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
  }

  _render() {
    const c = this._config;
    this.innerHTML = `
      <style>
        .editor { padding:8px 0; display:flex; flex-direction:column; gap:16px; }
        .editor label.t { display:block; font-size:12px; font-weight:600; color:var(--secondary-text-color); margin-bottom:4px; }
        .editor input, .editor select { width:100%; padding:9px 10px; border:1px solid var(--divider-color); border-radius:8px; font-size:14px;
          background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); color:var(--primary-text-color); box-sizing:border-box; font-family:inherit; }
        .editor select option { background:var(--card-background-color); color:var(--primary-text-color); }
        .editor .hint { font-size:12px; color:var(--secondary-text-color); margin-top:4px; }
      </style>
      <div class="editor">
        <div>
          <label class="t">Titel</label>
          <input type="text" id="title" placeholder="${esc(DEFAULT_LABELS.title)}" value="${esc(c.title || "")}" />
        </div>
        <div>
          <label class="t">Enkel deze categorie tonen (optioneel)</label>
          <input type="text" id="category" placeholder="bv. Winkel" value="${esc(c.category || "")}" />
          <div class="hint">Toont enkel notities van die categorie; nieuwe notities krijgen ze automatisch.</div>
        </div>
        <div>
          <label class="t">Standaardkleur voor nieuwe notities</label>
          <select id="default-color">
            ${Object.keys(COLORS).map(k => `<option value="${k}" ${(c.default_color || "yellow") === k ? "selected" : ""}>${COLOR_NAMES[k]}</option>`).join("")}
          </select>
        </div>
        <div class="hint">Teksten zijn aanpasbaar via YAML onder <code>labels:</code> (zie README).</div>
      </div>
    `;
    this.querySelector("#title").addEventListener("change", e => this._set("title", e.target.value.trim()));
    this.querySelector("#category").addEventListener("change", e => this._set("category", e.target.value.trim()));
    this.querySelector("#default-color").addEventListener("change", e => this._set("default_color", e.target.value === "yellow" ? "" : e.target.value));
  }
}

// The integration adds this file as a dashboard resource; an old manual
// resource may load it a second time. Only the first one counts.
if (!customElements.get("notes-manager-card")) {
  customElements.define("notes-manager-card-editor", NotesManagerCardEditor);
  customElements.define("notes-manager-card", NotesManagerCard);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "notes-manager-card",
    name: "Notes Manager",
    description: "Notes Manager - customizable notes with categories, search, pin, reminders, Markdown, checklists and numbered lists.",
    preview: true,
  });
}
console.info(
  `%c NOTES-MANAGER-CARD %c v${CARD_VERSION} `,
  "background:#03a9f4;color:#fff;font-weight:700;padding:2px 6px;border-radius:4px 0 0 4px;",
  "background:#eee;color:#333;font-weight:700;padding:2px 6px;border-radius:0 4px 4px 0;"
);
