/**
 * Notes Manager Card for Home Assistant
 * A Lovelace custom card to manage notes
 */

const CARD_VERSION = "1.0.0";

class NotesManagerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._notes = [];
    this._editingNote = null;
    this._isAdding = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._initialized = true;
      this._fetchNotes();
      this._render();

      // Listen for updates
      hass.connection.subscribeEvents((event) => {
        this._fetchNotes();
      }, "notes_manager_updated");
    }
  }

  setConfig(config) {
    this._config = config;
  }

  async _fetchNotes() {
    try {
      const response = await this._hass.callApi("GET", "notes_manager/notes");
      this._notes = response;
      this._renderNotes();
    } catch (e) {
      console.error("Error fetching notes:", e);
    }
  }

  async _addNote(title, content, color) {
    try {
      await this._hass.callApi("POST", "notes_manager/notes", {
        title,
        content,
        color,
      });
      await this._fetchNotes();
    } catch (e) {
      console.error("Error adding note:", e);
    }
  }

  async _updateNote(id, title, content, color) {
    try {
      await this._hass.callApi("PUT", `notes_manager/notes/${id}`, {
        title,
        content,
        color,
      });
      await this._fetchNotes();
    } catch (e) {
      console.error("Error updating note:", e);
    }
  }

  async _deleteNote(id) {
    try {
      await this._hass.callApi("DELETE", `notes_manager/notes/${id}`);
      await this._fetchNotes();
    } catch (e) {
      console.error("Error deleting note:", e);
    }
  }

  _getColorStyle(color) {
    const colors = {
      yellow: { bg: "#fff9c4", border: "#f9a825", header: "#f57f17" },
      blue: { bg: "#e3f2fd", border: "#1565c0", header: "#0d47a1" },
      green: { bg: "#e8f5e9", border: "#2e7d32", header: "#1b5e20" },
      pink: { bg: "#fce4ec", border: "#c62828", header: "#b71c1c" },
      purple: { bg: "#f3e5f5", border: "#6a1b9a", header: "#4a148c" },
      orange: { bg: "#fff3e0", border: "#e65100", header: "#bf360c" },
    };
    return colors[color] || colors.yellow;
  }

  _render() {
    const style = `
      <style>
        :host {
          display: block;
          font-family: var(--paper-font-body1_-_font-family, 'Roboto', sans-serif);
        }
        ha-card {
          padding: 16px;
          overflow: hidden;
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .card-title {
          font-size: 1.2em;
          font-weight: bold;
          color: var(--primary-text-color);
        }
        .add-btn {
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          font-size: 22px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          transition: transform 0.2s;
        }
        .add-btn:hover { transform: scale(1.1); }
        .notes-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }
        .note-card {
          border-radius: 8px;
          padding: 12px;
          position: relative;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          transition: box-shadow 0.2s;
          min-height: 100px;
        }
        .note-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
        .note-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }
        .note-title {
          font-weight: bold;
          font-size: 0.95em;
          flex: 1;
          word-break: break-word;
        }
        .note-actions {
          display: flex;
          gap: 4px;
          margin-left: 8px;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .note-card:hover .note-actions { opacity: 1; }
        .note-actions button {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px 4px;
          border-radius: 4px;
          font-size: 14px;
          transition: background 0.2s;
        }
        .note-actions button:hover { background: rgba(0,0,0,0.1); }
        .note-content {
          font-size: 0.85em;
          word-break: break-word;
          white-space: pre-wrap;
          color: rgba(0,0,0,0.7);
        }
        .note-date {
          font-size: 0.7em;
          color: rgba(0,0,0,0.4);
          margin-top: 8px;
        }
        .modal-overlay {
          display: none;
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          z-index: 9999;
          align-items: center;
          justify-content: center;
        }
        .modal-overlay.open { display: flex; }
        .modal {
          background: var(--card-background-color, white);
          border-radius: 12px;
          padding: 24px;
          width: 90%;
          max-width: 480px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        .modal h3 {
          margin: 0 0 16px;
          color: var(--primary-text-color);
        }
        .form-group {
          margin-bottom: 14px;
        }
        .form-group label {
          display: block;
          font-size: 0.85em;
          margin-bottom: 4px;
          color: var(--secondary-text-color);
          font-weight: 500;
        }
        .form-group input, .form-group textarea {
          width: 100%;
          padding: 8px 10px;
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 6px;
          font-size: 0.95em;
          background: var(--input-fill-color, #f5f5f5);
          color: var(--primary-text-color);
          box-sizing: border-box;
          font-family: inherit;
        }
        .form-group textarea {
          resize: vertical;
          min-height: 100px;
        }
        .color-picker {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .color-option {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 3px solid transparent;
          cursor: pointer;
          transition: transform 0.2s;
        }
        .color-option:hover { transform: scale(1.2); }
        .color-option.selected { border-color: var(--primary-color); }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
        }
        .btn {
          padding: 8px 20px;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9em;
          font-weight: 500;
          transition: background 0.2s;
        }
        .btn-primary {
          background: var(--primary-color);
          color: white;
        }
        .btn-primary:hover { filter: brightness(0.9); }
        .btn-secondary {
          background: var(--secondary-background-color, #e0e0e0);
          color: var(--primary-text-color);
        }
        .btn-secondary:hover { filter: brightness(0.95); }
        .empty-state {
          text-align: center;
          padding: 32px 16px;
          color: var(--secondary-text-color);
        }
        .empty-state .icon { font-size: 3em; margin-bottom: 8px; }
        .empty-state p { margin: 0; font-size: 0.9em; }
        .confirm-modal {
          background: var(--card-background-color, white);
          border-radius: 12px;
          padding: 24px;
          width: 90%;
          max-width: 360px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.3);
          text-align: center;
        }
        .confirm-modal h3 { margin: 0 0 10px; }
        .confirm-modal p { color: var(--secondary-text-color); font-size: 0.9em; }
      </style>
    `;

    this.shadowRoot.innerHTML = `
      ${style}
      <ha-card>
        <div class="card-header">
          <span class="card-title">📝 Notities</span>
          <button class="add-btn" id="add-btn" title="Nieuwe notitie">+</button>
        </div>
        <div class="notes-grid" id="notes-grid">
          <div class="empty-state">
            <div class="icon">📋</div>
            <p>Geen notities gevonden.<br>Klik op + om een notitie toe te voegen.</p>
          </div>
        </div>
      </ha-card>

      <!-- Add/Edit Modal -->
      <div class="modal-overlay" id="note-modal">
        <div class="modal">
          <h3 id="modal-title">Nieuwe Notitie</h3>
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="note-title-input" placeholder="Voer een titel in..." />
          </div>
          <div class="form-group">
            <label>Inhoud</label>
            <textarea id="note-content-input" placeholder="Schrijf je notitie hier..."></textarea>
          </div>
          <div class="form-group">
            <label>Kleur</label>
            <div class="color-picker" id="color-picker">
              <div class="color-option selected" data-color="yellow" style="background:#fff9c4; border-color: #f9a825;" title="Geel"></div>
              <div class="color-option" data-color="blue" style="background:#e3f2fd;" title="Blauw"></div>
              <div class="color-option" data-color="green" style="background:#e8f5e9;" title="Groen"></div>
              <div class="color-option" data-color="pink" style="background:#fce4ec;" title="Roze"></div>
              <div class="color-option" data-color="purple" style="background:#f3e5f5;" title="Paars"></div>
              <div class="color-option" data-color="orange" style="background:#fff3e0;" title="Oranje"></div>
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
          <p>Weet je zeker dat je deze notitie wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</p>
          <div class="modal-actions" style="justify-content:center;">
            <button class="btn btn-secondary" id="confirm-cancel">Annuleren</button>
            <button class="btn btn-primary" id="confirm-delete" style="background:#e53935;">Verwijderen</button>
          </div>
        </div>
      </div>
    `;

    this._setupEventListeners();
  }

  _setupEventListeners() {
    const root = this.shadowRoot;
    let selectedColor = "yellow";
    let pendingDeleteId = null;

    // Add button
    root.getElementById("add-btn").addEventListener("click", () => {
      this._editingNote = null;
      root.getElementById("modal-title").textContent = "Nieuwe Notitie";
      root.getElementById("note-title-input").value = "";
      root.getElementById("note-content-input").value = "";
      selectedColor = "yellow";
      this._updateColorSelection(root, selectedColor);
      root.getElementById("note-modal").classList.add("open");
      root.getElementById("note-title-input").focus();
    });

    // Cancel
    root.getElementById("cancel-btn").addEventListener("click", () => {
      root.getElementById("note-modal").classList.remove("open");
    });

    // Save
    root.getElementById("save-btn").addEventListener("click", async () => {
      const title = root.getElementById("note-title-input").value.trim();
      const content = root.getElementById("note-content-input").value.trim();
      if (!title) {
        root.getElementById("note-title-input").style.borderColor = "red";
        return;
      }
      root.getElementById("note-title-input").style.borderColor = "";
      root.getElementById("note-modal").classList.remove("open");

      if (this._editingNote) {
        await this._updateNote(this._editingNote.id, title, content, selectedColor);
      } else {
        await this._addNote(title, content, selectedColor);
      }
      this._editingNote = null;
    });

    // Color picker
    root.getElementById("color-picker").addEventListener("click", (e) => {
      const option = e.target.closest(".color-option");
      if (!option) return;
      selectedColor = option.dataset.color;
      this._updateColorSelection(root, selectedColor);
    });

    // Confirm delete cancel
    root.getElementById("confirm-cancel").addEventListener("click", () => {
      root.getElementById("confirm-modal").classList.remove("open");
      pendingDeleteId = null;
    });

    // Confirm delete
    root.getElementById("confirm-delete").addEventListener("click", async () => {
      if (pendingDeleteId) {
        await this._deleteNote(pendingDeleteId);
        pendingDeleteId = null;
      }
      root.getElementById("confirm-modal").classList.remove("open");
    });

    // Store reference for use in renderNotes
    this._pendingDeleteRef = { value: null };
    this._pendingDeleteRef.setter = (id) => { pendingDeleteId = id; };
    this._selectedColorRef = { getter: () => selectedColor, setter: (c) => { selectedColor = c; } };
  }

  _updateColorSelection(root, color) {
    root.querySelectorAll(".color-option").forEach((el) => {
      const isSelected = el.dataset.color === color;
      el.classList.toggle("selected", isSelected);
      if (isSelected) {
        el.style.borderColor = "#1976d2";
      } else {
        el.style.borderColor = "transparent";
      }
    });
  }

  _renderNotes() {
    const grid = this.shadowRoot.getElementById("notes-grid");
    if (!grid) return;

    if (this._notes.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="icon">📋</div>
          <p>Geen notities gevonden.<br>Klik op + om een notitie toe te voegen.</p>
        </div>
      `;
      return;
    }

    const sorted = [...this._notes].sort(
      (a, b) => new Date(b.updated_at) - new Date(a.updated_at)
    );

    grid.innerHTML = sorted
      .map((note) => {
        const c = this._getColorStyle(note.color || "yellow");
        const date = new Date(note.updated_at).toLocaleDateString("nl-NL", {
          day: "2-digit", month: "short", year: "numeric",
        });
        return `
          <div class="note-card" style="background:${c.bg}; border-left: 4px solid ${c.border};" data-id="${note.id}">
            <div class="note-header">
              <div class="note-title">${this._escape(note.title)}</div>
              <div class="note-actions">
                <button class="edit-btn" data-id="${note.id}" title="Bewerken">✏️</button>
                <button class="delete-btn" data-id="${note.id}" title="Verwijderen">🗑️</button>
              </div>
            </div>
            ${note.content ? `<div class="note-content">${this._escape(note.content)}</div>` : ""}
            <div class="note-date">${date}</div>
          </div>
        `;
      })
      .join("");

    // Attach edit/delete handlers
    grid.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const note = this._notes.find((n) => n.id === id);
        if (!note) return;
        this._editingNote = note;
        this.shadowRoot.getElementById("modal-title").textContent = "Notitie bewerken";
        this.shadowRoot.getElementById("note-title-input").value = note.title;
        this.shadowRoot.getElementById("note-content-input").value = note.content || "";
        const color = note.color || "yellow";
        this._selectedColorRef.setter(color);
        this._updateColorSelection(this.shadowRoot, color);
        this.shadowRoot.getElementById("note-modal").classList.add("open");
        this.shadowRoot.getElementById("note-title-input").focus();
      });
    });

    grid.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._pendingDeleteRef.setter(btn.dataset.id);
        this.shadowRoot.getElementById("confirm-modal").classList.add("open");
      });
    });
  }

  _escape(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  getCardSize() {
    return 3;
  }

  static getConfigElement() {
    return document.createElement("notes-manager-card-editor");
  }

  static getStubConfig() {
    return { title: "Mijn Notities" };
  }
}

customElements.define("notes-manager-card", NotesManagerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "notes-manager-card",
  name: "Notes Manager",
  description: "Beheer je notities direct vanuit je dashboard.",
  preview: true,
});

console.info(
  `%c NOTES-MANAGER-CARD %c v${CARD_VERSION} `,
  "background:#1976d2;color:white;font-weight:bold;padding:2px 6px;border-radius:4px 0 0 4px;",
  "background:#e8f5e9;color:#2e7d32;font-weight:bold;padding:2px 6px;border-radius:0 4px 4px 0;"
);
