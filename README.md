# 📝 Notes Manager for Home Assistant

A custom Home Assistant integration to create, edit, and delete notes directly from your dashboard.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
![Version](https://img.shields.io/badge/version-2.4.0-blue.svg)

---

## ✨ Features

- ✅ Create notes with a title and content
- ✅ Edit existing notes
- ✅ Delete notes with confirmation dialog
- ✅ Choose from 6 note colors (yellow, blue, green, pink, purple, orange)
- ✅ **Markdown support** (bold, italic, headings, code, links)
- ✅ **Checklist / task notes**
- ✅ **Numbered lists**
- ✅ **Image upload** with lightbox viewer
- ✅ **Clickable links** (auto-detected)
- ✅ **Search** through all notes (title, content, tasks, categories)
- ✅ **Pin notes** to keep them at the top
- ✅ **Reminders** with date & time picker (timezone-aware)
- ✅ **Categories** with filter bar
- ✅ Notes sorted by most recently updated
- ✅ Notes saved persistently in your HA config directory
- ✅ Frontend JS auto-copied on every HA restart
- ✅ Configurable card title
- ✅ Automation support via HA services

---

## 📦 Installation via HACS

### Step 1: Add as custom repository

1. Open **HACS** in Home Assistant
2. Click **Integrations** → **⋮ (three dots)** → **Custom repositories**
3. Add the URL: `https://github.com/YOUR_GITHUB_USERNAME/ha-notes-manager`
4. Category: **Integration**
5. Click **Add**

### Step 2: Install

1. Search for **"Notes Manager"** in HACS
2. Click **Download**
3. Restart Home Assistant

### Step 3: Add to configuration.yaml

```yaml
notes_manager:
```

### Step 4: Add the Lovelace card

```yaml
type: custom:notes-manager-card
```

Optionally set a custom title:

```yaml
type: custom:notes-manager-card
title: "🛒 Boodschappen"
```

### Step 5: Add the resource

Go to **Settings → Dashboards → Resources** and add:

- **URL:** `/local/community/ha-notes-manager/notes-manager-card.js`
- **Type:** JavaScript module

> 💡 The JS file is automatically copied to the correct location on every HA restart.

---

## 🗂️ Directory Structure

```
ha-notes-manager/
├── hacs.json
├── README.md
└── custom_components/
    └── notes_manager/
        ├── __init__.py
        ├── manifest.json
        ├── services.yaml
        ├── strings.json
        └── frontend/
            └── notes-manager-card.js
```

---

## ⚙️ Services

### `notes_manager.add_note`

| Field     | Type   | Required | Description             |
|-----------|--------|----------|-------------------------|
| `title`   | string | ✅        | Title of the note       |
| `content` | string | ❌        | Content of the note     |
| `color`   | string | ❌        | Color (default: yellow) |

### `notes_manager.update_note`

| Field      | Type   | Required | Description                  |
|------------|--------|----------|------------------------------|
| `note_id`  | string | ✅        | The ID of the note to update |
| `title`    | string | ❌        | New title                    |
| `content`  | string | ❌        | New content                  |
| `color`    | string | ❌        | New color                    |

### `notes_manager.delete_note`

| Field      | Type   | Required | Description                  |
|------------|--------|----------|------------------------------|
| `note_id`  | string | ✅        | The ID of the note to delete |

---

## 📡 API Endpoints

| Method   | Endpoint                             | Description    |
|----------|--------------------------------------|----------------|
| `GET`    | `/api/notes_manager/notes`           | Get all notes  |
| `POST`   | `/api/notes_manager/notes`           | Add a note     |
| `PUT`    | `/api/notes_manager/notes/{note_id}` | Update a note  |
| `DELETE` | `/api/notes_manager/notes/{note_id}` | Delete a note  |

---

## 📝 Markdown Support

| Syntax | Result |
|--------|--------|
| `**vet**` | **vet** |
| `*cursief*` | *cursief* |
| `# Kop` | Heading |
| `` `code` `` | `code` |
| `[tekst](url)` | clickable link |

---

## 🎨 Available Colors

`yellow` 🟡 &nbsp; `blue` 🔵 &nbsp; `green` 🟢 &nbsp; `pink` 🩷 &nbsp; `purple` 🟣 &nbsp; `orange` 🟠

---

## 💾 Data Storage

Notes are stored in:
```
<HA config directory>/notes_manager_data.json
```

---

## 📋 Changelog

### v2.4.0
- 🔢 Numbered list note type

### v2.3.0
- 📁 Categories with filter bar
- 🐛 Fixed reminder timezone bug (no more hour shifts)

### v2.2.0
- 🔍 Search through all notes
- 📌 Pin notes to top
- ⏰ Reminders with date & time picker

### v2.1.x
- 🐛 Fixed checklist input visibility and mobile layout
- 🔄 Auto-copy frontend JS on HA restart
- 🏷️ Configurable card title

### v2.0.0
- ✅ Checklist / task notes
- 📝 Markdown support
- 📷 Image upload with lightbox
- 🔗 Clickable links

### v1.0.0
- 🎉 Initial release

---

## 🐛 Issues & Contributions

→ [Open an issue](https://github.com/YOUR_GITHUB_USERNAME/ha-notes-manager/issues)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
