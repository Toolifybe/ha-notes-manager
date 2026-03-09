/**
 * Notes Manager Card for Home Assistant
 * v2.0.0 - With Markdown, Checklists, Images & Clickable Links
 */

const CARD_VERSION = "2.1.0";

// Minimal Markdown renderer (bold, italic, headings, links, code)
function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold & italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Links [text](url)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    // Auto-links
    .replace(/(^|[\s])((https?:\/\/)[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
    // Line breaks
    .replace(/\n/g, "<br>");
  return html;
}

// Make plain text links clickable (for non-markdown content)
function linkify(text) {
  if (!text) return "";
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

class NotesManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._notes = [];
    this._editingNote = null;
    this._initialized = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._render();
      this._fetchNotes();
      hass.connection.subscribeEvents(() => this._fetchNotes(), "notes_manager_updated");
    }
  }

  setConfig(config) { this._config = config || {}; this._title = config?.title || '📝 Notities'; }
  getCardSize() { return 4; }
  static getStubConfig() { return { title: "📝 Notities" }; }

  async _fetchNotes() {
    try {
      this._notes = await this._hass.callApi("GET", "notes_manager/notes");
      this._renderNotes();
    } catch (e) { console.error("Notes fetch error:", e); }
  }

  async _saveNote(noteData, id = null) {
    try {
      if (id) {
        await this._hass.callApi("PUT", `notes_manager/notes/${id}`, noteData);
      } else {
        await this._hass.callApi("POST", "notes_manager/notes", noteData);
      }
      await this._fetchNotes();
    } catch (e) { console.error("Save error:", e); }
  }

  async _deleteNote(id) {
    try {
      await this._hass.callApi("DELETE", `notes_manager/notes/${id}`);
      await this._fetchNotes();
    } catch (e) { console.error("Delete error:", e); }
  }

  _colorStyle(color) {
    return {
      yellow:  { bg: "#fff9c4", border: "#f9a825" },
      blue:    { bg: "#e3f2fd", border: "#1565c0" },
      green:   { bg: "#e8f5e9", border: "#2e7d32" },
      pink:    { bg: "#fce4ec", border: "#c62828" },
      purple:  { bg: "#f3e5f5", border: "#6a1b9a" },
      orange:  { bg: "#fff3e0", border: "#e65100" },
    }[color] || { bg: "#fff9c4", border: "#f9a825" };
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; font-family: var(--paper-font-body1_-_font-family,'Roboto',sans-serif); }
        ha-card { padding: 16px; }
        .card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }
        .card-title { font-size:1.2em; font-weight:bold; color:var(--primary-text-color); }
        .header-actions { display:flex; gap:8px; align-items:center; }
        .add-btn { background:var(--primary-color); color:white; border:none; border-radius:50%; width:36px; height:36px; font-size:22px; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 4px rgba(0,0,0,.3); transition:transform .2s; }
        .add-btn:hover { transform:scale(1.1); }
        .notes-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(210px,1fr)); gap:12px; }
        .note-card { border-radius:8px; padding:12px; position:relative; box-shadow:0 2px 6px rgba(0,0,0,.15); transition:box-shadow .2s; min-height:80px; }
        .note-card:hover { box-shadow:0 4px 12px rgba(0,0,0,.25); }
        .note-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px; }
        .note-title { font-weight:bold; font-size:.95em; flex:1; word-break:break-word; }
        .note-actions { display:flex; gap:4px; margin-left:8px; opacity:0; transition:opacity .2s; }
        .note-card:hover .note-actions { opacity:1; }
        .note-actions button { background:none; border:none; cursor:pointer; padding:2px 4px; border-radius:4px; font-size:14px; }
        .note-actions button:hover { background:rgba(0,0,0,.1); }
        .note-body { font-size:.85em; color:rgba(0,0,0,.75); word-break:break-word; }
        .note-body h1,.note-body h2,.note-body h3 { margin:4px 0; }
        .note-body h1 { font-size:1.1em; }
        .note-body h2 { font-size:1em; }
        .note-body h3 { font-size:.95em; }
        .note-body code { background:rgba(0,0,0,.08); padding:1px 4px; border-radius:3px; font-family:monospace; }
        .note-body a { color:#1565c0; }
        .note-date { font-size:.7em; color:rgba(0,0,0,.4); margin-top:8px; }
        /* Checklist */
        .checklist-item { display:flex; align-items:center; gap:6px; margin:3px 0; font-size:.85em; }
        .checklist-item input[type=checkbox] { cursor:pointer; width:14px; height:14px; }
        .checklist-item.done span { text-decoration:line-through; opacity:.55; }
        /* Images */
        .note-images { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
        .note-images img { width:60px; height:60px; object-fit:cover; border-radius:4px; cursor:pointer; }
        /* Empty state */
        .empty-state { text-align:center; padding:32px 16px; color:var(--secondary-text-color); }
        .empty-state .icon { font-size:3em; margin-bottom:8px; }
        /* Modal */
        .modal-overlay { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,.5); z-index:9999; align-items:center; justify-content:center; }
        .modal-overlay.open { display:flex; }
        .modal { background:var(--card-background-color,white); border-radius:12px; padding:24px; width:92%; max-width:520px; box-shadow:0 8px 32px rgba(0,0,0,.3); max-height:90vh; overflow-y:auto; }
        .modal h3 { margin:0 0 16px; color:var(--primary-text-color); }
        .form-group { margin-bottom:14px; }
        .form-group label { display:block; font-size:.85em; margin-bottom:4px; color:var(--secondary-text-color); font-weight:500; }
        .form-group input,.form-group textarea { width:100%; padding:8px 10px; border:1px solid var(--divider-color,#e0e0e0); border-radius:6px; font-size:.95em; background:var(--input-fill-color,#f5f5f5); color:var(--primary-text-color); box-sizing:border-box; font-family:inherit; }
        .form-group textarea { resize:vertical; min-height:90px; }
        .type-toggle { display:flex; gap:8px; margin-bottom:14px; }
        .type-btn { flex:1; padding:7px; border:2px solid var(--divider-color,#ddd); border-radius:6px; background:none; cursor:pointer; font-size:.85em; transition:all .2s; color:var(--primary-text-color); }
        .type-btn.active { border-color:var(--primary-color); background:var(--primary-color); color:white; }
        .color-picker { display:flex; gap:8px; flex-wrap:wrap; }
        .color-option { width:28px; height:28px; border-radius:50%; border:3px solid transparent; cursor:pointer; transition:transform .2s; }
        .color-option:hover { transform:scale(1.2); }
        .color-option.selected { border-color:#1976d2 !important; }
        /* Checklist editor */
        .checklist-editor { display:flex; flex-direction:column; gap:6px; }
        .checklist-row { display:flex; align-items:center; gap:6px; }
        .checklist-row input[type=text] { flex:1; padding:6px 8px; border:1px solid var(--divider-color,#ddd); border-radius:5px; font-size:.9em; background:var(--input-fill-color,#f5f5f5); color:var(--primary-text-color); }
        .checklist-row button { background:none; border:none; cursor:pointer; font-size:16px; padding:2px 4px; border-radius:4px; }
        .checklist-row button:hover { background:rgba(0,0,0,.1); }
        .add-item-btn { align-self:flex-start; background:none; border:1px dashed var(--primary-color); color:var(--primary-color); border-radius:6px; padding:5px 12px; cursor:pointer; font-size:.85em; margin-top:4px; }
        .add-item-btn:hover { background:rgba(25,118,210,.07); }
        /* Image upload */
        .image-upload-area { border:2px dashed var(--divider-color,#ddd); border-radius:8px; padding:16px; text-align:center; cursor:pointer; font-size:.85em; color:var(--secondary-text-color); margin-top:4px; }
        .image-upload-area:hover { border-color:var(--primary-color); }
        .image-previews { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
        .image-preview-wrap { position:relative; }
        .image-preview-wrap img { width:64px; height:64px; object-fit:cover; border-radius:6px; }
        .image-preview-wrap .remove-img { position:absolute; top:-6px; right:-6px; background:#e53935; color:white; border:none; border-radius:50%; width:18px; height:18px; font-size:11px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
        /* Modal actions */
        .modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:18px; }
        .btn { padding:8px 20px; border:none; border-radius:6px; cursor:pointer; font-size:.9em; font-weight:500; transition:filter .2s; }
        .btn-primary { background:var(--primary-color); color:white; }
        .btn-primary:hover { filter:brightness(.9); }
        .btn-secondary { background:var(--secondary-background-color,#e0e0e0); color:var(--primary-text-color); }
        /* Confirm modal */
        .confirm-modal { background:var(--card-background-color,white); border-radius:12px; padding:24px; width:90%; max-width:340px; box-shadow:0 8px 32px rgba(0,0,0,.3); text-align:center; }
        .confirm-modal h3 { margin:0 0 10px; }
        .confirm-modal p { color:var(--secondary-text-color); font-size:.9em; }
        /* Markdown hint */
        .hint { font-size:.75em; color:var(--secondary-text-color); margin-top:3px; }
        /* Lightbox */
        .lightbox { display:none; position:fixed; top:0;left:0;right:0;bottom:0; background:rgba(0,0,0,.85); z-index:99999; align-items:center; justify-content:center; cursor:zoom-out; }
        .lightbox.open { display:flex; }
        .lightbox img { max-width:90vw; max-height:90vh; border-radius:8px; box-shadow:0 4px 32px rgba(0,0,0,.5); }
      </style>

      <ha-card>
        <div class="card-header">
          <span class="card-title">${this._title}</span>
          <div class="header-actions">
            <button class="add-btn" id="add-btn" title="Nieuwe notitie">+</button>
          </div>
        </div>
        <div class="notes-grid" id="notes-grid">
          <div class="empty-state"><div class="icon">📋</div><p>Geen notities. Klik op + om te beginnen.</p></div>
        </div>
      </ha-card>

      <!-- Add/Edit Modal -->
      <div class="modal-overlay" id="note-modal">
        <div class="modal">
          <h3 id="modal-title">Nieuwe Notitie</h3>

          <div class="type-toggle">
            <button class="type-btn active" id="type-text-btn" data-type="text">📝 Tekst</button>
            <button class="type-btn" id="type-check-btn" data-type="checklist">✅ Checklist</button>
          </div>

          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="note-title-input" placeholder="Voer een titel in..." />
          </div>

          <!-- Text area (shown for text type) -->
          <div class="form-group" id="text-section">
            <label>Inhoud <span style="font-weight:normal">(ondersteunt Markdown)</span></label>
            <textarea id="note-content-input" placeholder="Schrijf je notitie hier...&#10;&#10;**vet**, *cursief*, # Kop, \`code\`, [link](url)"></textarea>
            <div class="hint">**vet** &nbsp;|&nbsp; *cursief* &nbsp;|&nbsp; # Kop &nbsp;|&nbsp; \`code\` &nbsp;|&nbsp; [tekst](url)</div>
          </div>

          <!-- Checklist section -->
          <div class="form-group" id="checklist-section" style="display:none">
            <label>Taken</label>
            <div class="checklist-editor" id="checklist-editor"></div>
            <button class="add-item-btn" id="add-checklist-item">+ Taak toevoegen</button>
          </div>

          <!-- Image upload -->
          <div class="form-group">
            <label>Afbeeldingen</label>
            <div class="image-upload-area" id="image-upload-area">
              📷 Klik of sleep een afbeelding hier
              <input type="file" id="image-file-input" accept="image/*" multiple style="display:none" />
            </div>
            <div class="image-previews" id="image-previews"></div>
          </div>

          <div class="form-group">
            <label>Kleur</label>
            <div class="color-picker" id="color-picker">
              <div class="color-option selected" data-color="yellow" style="background:#fff9c4" title="Geel"></div>
              <div class="color-option" data-color="blue" style="background:#e3f2fd" title="Blauw"></div>
              <div class="color-option" data-color="green" style="background:#e8f5e9" title="Groen"></div>
              <div class="color-option" data-color="pink" style="background:#fce4ec" title="Roze"></div>
              <div class="color-option" data-color="purple" style="background:#f3e5f5" title="Paars"></div>
              <div class="color-option" data-color="orange" style="background:#fff3e0" title="Oranje"></div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" id="cancel-btn">Annuleren</button>
            <button class="btn btn-primary" id="save-btn">Opslaan</button>
          </div>
        </div>
      </div>

      <!-- Delete Confirm Modal -->
      <div class="modal-overlay" id="confirm-modal">
        <div class="confirm-modal">
          <h3>Notitie verwijderen?</h3>
          <p>Weet je zeker dat je deze notitie wilt verwijderen?</p>
          <div class="modal-actions" style="justify-content:center;">
            <button class="btn btn-secondary" id="confirm-cancel">Annuleren</button>
            <button class="btn btn-primary" id="confirm-delete" style="background:#e53935">Verwijderen</button>
          </div>
        </div>
      </div>

      <!-- Lightbox -->
      <div class="lightbox" id="lightbox">
        <img id="lightbox-img" src="" alt="" />
      </div>
    `;
    this._setupModal();
  }

  _setupModal() {
    const r = this.shadowRoot;
    let selectedColor = "yellow";
    let selectedType = "text";
    let pendingImages = [];
    let pendingDeleteId = null;

    const updateColorUI = (color) => {
      selectedColor = color;
      r.querySelectorAll(".color-option").forEach(el => {
        el.classList.toggle("selected", el.dataset.color === color);
      });
    };

    const updateTypeUI = (type) => {
      selectedType = type;
      r.getElementById("type-text-btn").classList.toggle("active", type === "text");
      r.getElementById("type-check-btn").classList.toggle("active", type === "checklist");
      r.getElementById("text-section").style.display = type === "text" ? "" : "none";
      r.getElementById("checklist-section").style.display = type === "checklist" ? "" : "none";
    };

    const addChecklistRow = (text = "", checked = false) => {
      const editor = r.getElementById("checklist-editor");
      const row = document.createElement("div");
      row.className = "checklist-row";
      row.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""} />
        <input type="text" placeholder="Taak omschrijving..." value="${text.replace(/"/g,'&quot;')}" />
        <button title="Verwijder">🗑️</button>
      `;
      row.querySelector("button").addEventListener("click", () => row.remove());
      editor.appendChild(row);
      row.querySelector("input[type=text]").focus();
    };

    const renderImagePreviews = () => {
      const container = r.getElementById("image-previews");
      container.innerHTML = "";
      pendingImages.forEach((src, i) => {
        const wrap = document.createElement("div");
        wrap.className = "image-preview-wrap";
        wrap.innerHTML = `<img src="${src}" /><button class="remove-img">×</button>`;
        wrap.querySelector(".remove-img").addEventListener("click", () => {
          pendingImages.splice(i, 1);
          renderImagePreviews();
        });
        container.appendChild(wrap);
      });
    };

    const openModal = (note = null) => {
      this._editingNote = note;
      r.getElementById("modal-title").textContent = note ? "Notitie bewerken" : "Nieuwe Notitie";
      r.getElementById("note-title-input").value = note?.title || "";
      r.getElementById("note-content-input").value = note?.content || "";
      r.getElementById("checklist-editor").innerHTML = "";
      pendingImages = note?.images ? [...note.images] : [];

      const type = note?.type || "text";
      updateTypeUI(type);
      updateColorUI(note?.color || "yellow");

      if (type === "checklist" && note?.checklist?.length) {
        note.checklist.forEach(item => addChecklistRow(item.text, item.checked));
      }
      renderImagePreviews();
      r.getElementById("note-modal").classList.add("open");
      setTimeout(() => r.getElementById("note-title-input").focus(), 50);
    };

    // Add button
    r.getElementById("add-btn").addEventListener("click", () => openModal());

    // Type toggle
    r.getElementById("type-text-btn").addEventListener("click", () => updateTypeUI("text"));
    r.getElementById("type-check-btn").addEventListener("click", () => updateTypeUI("checklist"));

    // Color picker
    r.getElementById("color-picker").addEventListener("click", e => {
      const opt = e.target.closest(".color-option");
      if (opt) updateColorUI(opt.dataset.color);
    });

    // Add checklist item
    r.getElementById("add-checklist-item").addEventListener("click", () => addChecklistRow());

    // Image upload
    r.getElementById("image-upload-area").addEventListener("click", () => r.getElementById("image-file-input").click());
    r.getElementById("image-upload-area").addEventListener("dragover", e => e.preventDefault());
    r.getElementById("image-upload-area").addEventListener("drop", e => {
      e.preventDefault();
      [...e.dataTransfer.files].forEach(f => this._readImageFile(f, pendingImages, renderImagePreviews));
    });
    r.getElementById("image-file-input").addEventListener("change", e => {
      [...e.target.files].forEach(f => this._readImageFile(f, pendingImages, renderImagePreviews));
      e.target.value = "";
    });

    // Cancel
    r.getElementById("cancel-btn").addEventListener("click", () => {
      r.getElementById("note-modal").classList.remove("open");
    });

    // Save
    r.getElementById("save-btn").addEventListener("click", async () => {
      const title = r.getElementById("note-title-input").value.trim();
      if (!title) {
        r.getElementById("note-title-input").style.borderColor = "red";
        return;
      }
      r.getElementById("note-title-input").style.borderColor = "";

      let checklist = [];
      if (selectedType === "checklist") {
        r.getElementById("checklist-editor").querySelectorAll(".checklist-row").forEach(row => {
          const text = row.querySelector("input[type=text]").value.trim();
          const checked = row.querySelector("input[type=checkbox]").checked;
          if (text) checklist.push({ text, checked });
        });
      }

      const noteData = {
        title,
        content: r.getElementById("note-content-input").value.trim(),
        color: selectedColor,
        type: selectedType,
        checklist,
        images: [...pendingImages],
      };

      r.getElementById("note-modal").classList.remove("open");
      await this._saveNote(noteData, this._editingNote?.id || null);
    });

    // Confirm delete
    r.getElementById("confirm-cancel").addEventListener("click", () => {
      r.getElementById("confirm-modal").classList.remove("open");
      pendingDeleteId = null;
    });
    r.getElementById("confirm-delete").addEventListener("click", async () => {
      if (pendingDeleteId) {
        await this._deleteNote(pendingDeleteId);
        pendingDeleteId = null;
      }
      r.getElementById("confirm-modal").classList.remove("open");
    });

    // Lightbox
    r.getElementById("lightbox").addEventListener("click", () => {
      r.getElementById("lightbox").classList.remove("open");
    });

    // Store refs for use in renderNotes
    this._openModal = openModal;
    this._triggerDelete = (id) => { pendingDeleteId = id; r.getElementById("confirm-modal").classList.add("open"); };
    this._openLightbox = (src) => {
      r.getElementById("lightbox-img").src = src;
      r.getElementById("lightbox").classList.add("open");
    };
    this._toggleChecklistItem = async (noteId, itemIndex, checked) => {
      const note = this._notes.find(n => n.id === noteId);
      if (!note) return;
      const checklist = [...(note.checklist || [])];
      if (checklist[itemIndex]) checklist[itemIndex] = { ...checklist[itemIndex], checked };
      await this._saveNote({ checklist }, noteId);
    };
  }

  _readImageFile(file, pendingImages, callback) {
    const reader = new FileReader();
    reader.onload = e => {
      pendingImages.push(e.target.result);
      callback();
    };
    reader.readAsDataURL(file);
  }

  _renderNotes() {
    const grid = this.shadowRoot.getElementById("notes-grid");
    if (!grid) return;

    if (!this._notes.length) {
      grid.innerHTML = `<div class="empty-state"><div class="icon">📋</div><p>Geen notities. Klik op + om te beginnen.</p></div>`;
      return;
    }

    grid.innerHTML = "";
    const sorted = [...this._notes].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    sorted.forEach(note => {
      const c = this._colorStyle(note.color || "yellow");
      const date = new Date(note.updated_at).toLocaleDateString("nl-NL", { day:"2-digit", month:"short", year:"numeric" });

      const card = document.createElement("div");
      card.className = "note-card";
      card.style.cssText = `background:${c.bg}; border-left:4px solid ${c.border};`;

      // Build body content
      let bodyHtml = "";
      if (note.type === "checklist" && note.checklist?.length) {
        bodyHtml = note.checklist.map((item, i) => `
          <div class="checklist-item ${item.checked ? 'done' : ''}" data-note="${note.id}" data-idx="${i}">
            <input type="checkbox" ${item.checked ? "checked" : ""} data-note="${note.id}" data-idx="${i}" />
            <span>${item.text.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</span>
          </div>
        `).join("");
      } else if (note.content) {
        bodyHtml = `<div class="note-body">${renderMarkdown(note.content)}</div>`;
      }

      let imagesHtml = "";
      if (note.images?.length) {
        imagesHtml = `<div class="note-images">${note.images.map((src, i) =>
          `<img src="${src}" data-src="${src}" class="note-img" />`
        ).join("")}</div>`;
      }

      card.innerHTML = `
        <div class="note-header">
          <div class="note-title">${note.title.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</div>
          <div class="note-actions">
            <button class="edit-btn" title="Bewerken">✏️</button>
            <button class="delete-btn" title="Verwijderen">🗑️</button>
          </div>
        </div>
        ${bodyHtml}
        ${imagesHtml}
        <div class="note-date">${date}</div>
      `;

      card.querySelector(".edit-btn").addEventListener("click", e => {
        e.stopPropagation();
        this._openModal(note);
      });
      card.querySelector(".delete-btn").addEventListener("click", e => {
        e.stopPropagation();
        this._triggerDelete(note.id);
      });

      // Checklist checkboxes
      card.querySelectorAll("input[type=checkbox][data-note]").forEach(cb => {
        cb.addEventListener("change", e => {
          e.stopPropagation();
          this._toggleChecklistItem(cb.dataset.note, parseInt(cb.dataset.idx), cb.checked);
        });
      });

      // Image lightbox
      card.querySelectorAll(".note-img").forEach(img => {
        img.addEventListener("click", e => {
          e.stopPropagation();
          this._openLightbox(img.dataset.src);
        });
      });

      grid.appendChild(card);
    });
  }
}

customElements.define("notes-manager-card", NotesManagerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "notes-manager-card",
  name: "Notes Manager",
  description: "Notities met Markdown, checklists en afbeeldingen.",
  preview: true,
});

console.info(
  `%c NOTES-MANAGER-CARD %c v${CARD_VERSION} `,
  "background:#1976d2;color:white;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;",
  "background:#e8f5e9;color:#2e7d32;font-weight:bold;padding:2px 6px;border-radius:0 4px 4px 0;"
);
