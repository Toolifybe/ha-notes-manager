# 📝 Notes Manager for Home Assistant

A custom Home Assistant integration to create, edit, and delete notes directly from your dashboard.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)

---

## ✨ Features

- ✅ Create notes with a title and content
- ✅ Edit existing notes
- ✅ Delete notes with confirmation dialog
- ✅ Choose from 6 note colors (yellow, blue, green, pink, purple, orange)
- ✅ Notes are saved persistently in your HA config directory
- ✅ Custom Lovelace card for your dashboard
- ✅ Automation support via HA services
- ✅ Sorted by most recently updated

---

## 📦 Installation via HACS

### Step 1: Add as custom repository

1. Open **HACS** in Home Assistant
2. Click **Integrations** → **⋮ (three dots)** → **Custom repositories**
3. Add the URL: `https://github.com/StijnHemelings/ha-notes-manager`
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

In your Lovelace dashboard:

1. Go to **Settings → Dashboards**
2. Edit your dashboard
3. Add a **Manual card** with this config:

```yaml
type: custom:notes-manager-card
```

Or add the resource manually (Settings → Dashboards → Resources):

```
/local/community/ha-notes-manager/notes-manager-card.js
```

---

## 🗂️ Directory Structure

```
ha-notes-manager/
├── hacs.json
├── README.md
└── custom_components/
    └── notes_manager/
        ├── __init__.py          # Main integration logic + API endpoints
        ├── manifest.json        # Integration metadata
        ├── services.yaml        # Service definitions
        ├── strings.json         # UI strings
        └── frontend/
            └── notes-manager-card.js   # Lovelace custom card
```

---

## ⚙️ Services

You can use these services in automations:

### `notes_manager.add_note`

| Field     | Type   | Required | Description            |
|-----------|--------|----------|------------------------|
| `title`   | string | ✅        | Title of the note      |
| `content` | string | ❌        | Content of the note    |
| `color`   | string | ❌        | Color (default: yellow)|

**Example:**
```yaml
service: notes_manager.add_note
data:
  title: "Herinnering"
  content: "Vergeet niet de planten water te geven!"
  color: green
```

---

### `notes_manager.update_note`

| Field      | Type   | Required | Description                  |
|------------|--------|----------|------------------------------|
| `note_id`  | string | ✅        | The ID of the note to update |
| `title`    | string | ❌        | New title                    |
| `content`  | string | ❌        | New content                  |
| `color`    | string | ❌        | New color                    |

---

### `notes_manager.delete_note`

| Field      | Type   | Required | Description                  |
|------------|--------|----------|------------------------------|
| `note_id`  | string | ✅        | The ID of the note to delete |

---

## 📡 API Endpoints

The integration exposes REST API endpoints (requires authentication):

| Method   | Endpoint                                 | Description          |
|----------|------------------------------------------|----------------------|
| `GET`    | `/api/notes_manager/notes`               | Get all notes        |
| `POST`   | `/api/notes_manager/notes`               | Add a new note       |
| `PUT`    | `/api/notes_manager/notes/{note_id}`     | Update a note        |
| `DELETE` | `/api/notes_manager/notes/{note_id}`     | Delete a note        |

---

## 🎨 Available Colors

| Color    | Preview |
|----------|---------|
| yellow   | 🟡      |
| blue     | 🔵      |
| green    | 🟢      |
| pink     | 🩷      |
| purple   | 🟣      |
| orange   | 🟠      |

---

## 💾 Data Storage

Notes are stored in a JSON file at:
```
<HA config directory>/notes_manager_data.json
```

---

## 🐛 Issues & Contributions

Found a bug or want to contribute?  
→ [Open an issue](https://github.com/YOUR_GITHUB_USERNAME/ha-notes-manager/issues)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
