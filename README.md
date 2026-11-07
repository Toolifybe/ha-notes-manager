# 📝 Notes Manager for Home Assistant

A custom Home Assistant integration to create, edit, and delete notes directly from your dashboard.

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-orange.svg)](https://github.com/hacs/integration)
![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)

---

## ✨ Features

- ✅ Create notes with a title and content
- ✅ Edit existing notes
- ✅ Delete notes with confirmation dialog
- ✅ Choose from 6 note colors (yellow, blue, green, pink, purple, orange)
- ✅ **Markdown support** (bold, italic, headings, code, links)
- ✅ **Checklist / task notes**
- ✅ **Numbered lists**
- ✅ **Image upload** with lightbox viewer (photos are shrunk to max 1280 px)
- ✅ **Clickable links** (auto-detected)
- ✅ **Search** through all notes (title, content, tasks, categories)
- ✅ **Pin notes** to keep them at the top
- ✅ **Reminders** with date & time: a Home Assistant notification + event `notes_manager_reminder` at that moment
- ✅ **Categories** with filter bar
- ✅ Notes sorted by most recently edited (ticking off or pinning does not move a note)
- ✅ Notes saved safely in your HA config directory (with `.bak` backup)
- ✅ **Live on every device**, also for non-admin users
- ✅ Tap a note to edit it (works on phones and tablets)
- ✅ Card loaded automatically as a dashboard resource (with version, no cache problems)
- ✅ Configurable card title
- ✅ **Home Assistant look** — follows your theme (light and dark) and primary color, Material Design icons
- ✅ **Category cards** — `category:` shows only one category (e.g. a "Winkel" card)
- ✅ **Visual editor** — title, category and default color
- ✅ **Duplicate notes**
- ✅ **Priority levels** (high 🔴 / normal 🟡 / low 🟢) with visual badge and smart sorting
- ✅ **Fully customizable labels** (multilingual support)
- ✅ Automation support via HA services (title, content, checklist items, category, priority, pin, reminder)

---

## 📦 Installation via HACS

### Step 1: Add as custom repository

1. Open **HACS** in Home Assistant
2. Click **Integrations** → **⋮ (three dots)** → **Custom repositories**
3. Add the URL: `https://github.com/Toolifybe/ha-notes-manager`
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

The integration adds the card as a dashboard resource itself (since v3.0.0):
`/notes_manager/notes-manager-card.js?v=…`. An old manual resource
`/local/community/ha-notes-manager/notes-manager-card.js` is replaced automatically.
After an update: restart HA and refresh the page (Ctrl+F5) once.
Dashboards in YAML mode: add `/notes_manager/notes-manager-card.js` as a JavaScript module yourself.

### Card options

| Option | Default | Description |
|--------|---------|-------------|
| `title` | Notities | Title in the header |
| `category` | — | Only show notes of this category; new notes get it automatically |
| `default_color` | `yellow` | Color for new notes: yellow, blue, green, pink, purple, orange |
| `labels` | — | Translate or rename texts (see below) |

```yaml
type: custom:notes-manager-card
title: Boodschappen
category: Winkel
default_color: green
```

Optionally customize all labels (e.g. English):

```yaml
type: custom:notes-manager-card
title: "My Notes"
labels:
  type_text: "Text"
  type_checklist: "Checklist"
  type_numbered: "Numbered"
  field_title: "Title"
  field_content: "Content"
  field_category: "Category"
  field_reminder: "Reminder (optional)"
  field_images: "Images"
  field_color: "Color"
  btn_save: "Save"
  btn_cancel: "Cancel"
  btn_add_task: "Add task"
  btn_add_item: "Add item"
  pin_label: "Pin to top"
  no_category: "— No category —"
  new_category: "New category..."
  empty_state: "No notes. Click + to start."
  search_placeholder: "Search notes..."
  filter_all: "All"
  delete_title: "Delete note?"
  delete_confirm: "Are you sure you want to delete this note?"
  btn_delete: "Delete"
  modal_new: "New Note"
  modal_edit: "Edit Note"
  task_placeholder: "Task description..."
  item_placeholder: "Item description..."
  title_placeholder: "Enter a title..."
  pin_yes: "Unpin"
  pin_no: "Pin"
  reminder_expired: "expired)"
  field_priority: "Priority"
  priority_none: "— No priority —"
  priority_low: "Low"
  priority_medium: "Normal"
  priority_high: "High"
```

> 💡 All labels are optional — any label you omit will fall back to the Dutch default.



---

## 🗂️ Directory Structure

```
ha-notes-manager/
├── .github/workflows/release.yml   ← GitHub release per tag (HACS updates)
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
| `type`    | string | ❌        | `text`, `checklist` or `numbered` |
| `items`   | list   | ❌        | Checklist items (makes a checklist if no type is given) |
| `category`| string | ❌        | Category |
| `priority`| string | ❌        | `low`, `medium` or `high` |
| `pinned`  | bool   | ❌        | Pin to the top |
| `reminder`| datetime | ❌      | Reminder (HA time zone) |

```yaml
action: notes_manager.add_note
data:
  title: Boodschappen
  items: [Melk, Brood, Kaas]
  category: Winkel
```

### `notes_manager.update_note`

| Field      | Type   | Required | Description                  |
|------------|--------|----------|------------------------------|
| `note_id`  | string | ✅        | The ID of the note to update |
| `title`    | string | ❌        | New title                    |
| `content`  | string | ❌        | New content                  |
| `color`    | string | ❌        | New color                    |
| `type`, `items`, `category`, `priority`, `pinned`, `reminder` | | ❌ | Same as `add_note` |

### `notes_manager.delete_note`

| Field      | Type   | Required | Description                  |
|------------|--------|----------|------------------------------|
| `note_id`  | string | ✅        | The ID of the note to delete |

---

## ⏰ Reminders

When a reminder is due, the integration:

- shows a **Home Assistant notification** (bell icon) with the note's title and content;
- fires the event **`notes_manager_reminder`** with `note_id`, `title`, `content`, `reminder` and `category`.

A reminder is sent once. If HA was off at that moment, it is sent after the restart
(if it is less than 12 hours late). Changing the time sends it again.

Send it to your phone with an automation:

```yaml
alias: Notes reminder to phone
triggers:
  - trigger: event
    event_type: notes_manager_reminder
actions:
  - action: notify.mobile_app_your_phone
    data:
      title: "⏰ {{ trigger.event.data.title }}"
      message: "{{ trigger.event.data.content or 'Reminder' }}"
```

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

## 🔴 Priority Levels

Each note can have an optional priority. Notes are automatically sorted by priority (within the same pinned/unpinned group):

| Value | Label | Color |
|-------|-------|-------|
| `high` | Hoog | Red badge |
| `medium` | Normaal | Yellow badge |
| `low` | Laag | Green badge |
| *(empty)* | — | No badge |

Sort order: **pinned** → **high** → **medium** → **low** → **none** → most recently updated.

---

## 💾 Data Storage

Notes are stored in:
```
<HA config directory>/notes_manager_data.json
```

The file is written safely (temporary file first) and the previous version is kept as
`notes_manager_data.json.bak`. If the file is ever damaged, it is copied to
`*.corrupt-<date>`, the `.bak` is used, and nothing gets overwritten. If saving fails,
the card shows a message and keeps your edit open.

Live updates use the websocket command `notes_manager/subscribe` (works for all users).

---

## 📋 Changelog

### v3.0.0
- 🎨 New look in Home Assistant style, like the Meal Planner and Home Energy Flow Card: follows your theme (light **and dark**), header with note count, open tasks and today's reminders, Material Design icons instead of emoji, notes tinted in their color
- 🗂️ `category:` option: a card that only shows (and creates) notes of one category; `default_color:` option
- ⚙️ Visual card editor (title, category, default color)
- 🔌 The integration adds the card as a dashboard resource itself (with version in the link) and replaces the old manual `/local/community/...` resource
- 🖼️ Old large photos are shrunk when you save the note
- 🤖 Services `add_note` / `update_note` accept type, items, category, priority, pinned and reminder
- ⌨️ Enter in a checklist adds the next item; click next to a dialog closes it
- ⚠️ Default texts no longer contain emoji (icons come from the card). Custom `labels:` keep working.

### v2.7.2
- 🛡️ A damaged notes file is never treated as empty anymore (could wipe all notes); safe writes with `.bak` backup
- 🛡️ A failed save is shown in the card and the editor stays open (it used to look saved)
- ⚡ Files are read and written outside HA's event loop, one change at a time (no more "blocking call" warning)
- 📱 Edit, pin, duplicate and delete buttons are visible on phones and tablets; tap a note to edit it
- 🐛 Switching between text, checklist and numbered list keeps your items
- 🔄 Live updates also work for non-admin users, and without downloading all notes again
- ⏰ Reminders now really remind: HA notification + `notes_manager_reminder` event
- 🐛 Ticking off or pinning no longer changes the date or moves the note
- 🔍 Search highlights inside formatted text and no longer breaks on "amp" or "lt"; photos are shrunk on upload
- 🛡️ Links, categories, priorities and images are escaped (no code via a note)
- 🔖 GitHub release per tag, so HACS shows updates in Settings → Updates

### v2.7.1
- 🐛 Priority not saved or displayed

### v2.7.0
- 🔴 Priority levels per note (high / normal / low)
- 🏷️ Visual priority badge on each note card
- 📊 Smart sorting: pinned → priority → most recently updated
- 🌍 Priority labels fully customizable (multilingual support)

### v2.6.0
- 📋 Duplicate notes (copy icon on each note card)

### v2.5.0
- 🌍 Fully customizable labels via Lovelace config (multilingual support)

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

→ [Open an issue](https://github.com/Toolifybe/ha-notes-manager/issues)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
