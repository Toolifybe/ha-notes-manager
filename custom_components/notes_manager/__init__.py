"""Notes Manager integration for Home Assistant."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import uuid
from datetime import datetime, timedelta

import voluptuous as vol

from homeassistant.components import persistent_notification, websocket_api
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_point_in_time
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

DOMAIN = "notes_manager"
EVENT_UPDATED = f"{DOMAIN}_updated"
EVENT_REMINDER = f"{DOMAIN}_reminder"
NOTES_FILE = "notes_manager_data.json"

SERVICE_ADD_NOTE = "add_note"
SERVICE_UPDATE_NOTE = "update_note"
SERVICE_DELETE_NOTE = "delete_note"

ATTR_NOTE_ID = "note_id"
ATTR_TITLE = "title"
ATTR_CONTENT = "content"
ATTR_COLOR = "color"

NOTE_FIELDS = ("title", "content", "color", "type", "checklist", "images",
               "pinned", "reminder", "category", "priority")
# Changing only these does not count as "edited" (no new date, no jumping)
QUIET_FIELDS = ("pinned",)
# A reminder that was missed while HA was off is still sent if it is this recent
MISSED_REMINDER_WINDOW = timedelta(hours=12)

SERVICE_ADD_NOTE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_TITLE): cv.string,
        vol.Optional(ATTR_CONTENT, default=""): cv.string,
        vol.Optional(ATTR_COLOR, default="yellow"): cv.string,
    }
)

SERVICE_UPDATE_NOTE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_NOTE_ID): cv.string,
        vol.Optional(ATTR_TITLE): cv.string,
        vol.Optional(ATTR_CONTENT): cv.string,
        vol.Optional(ATTR_COLOR): cv.string,
    }
)

SERVICE_DELETE_NOTE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_NOTE_ID): cv.string,
    }
)

CONFIG_SCHEMA = vol.Schema(
    {DOMAIN: vol.Schema({})},
    extra=vol.ALLOW_EXTRA,
)


# ─── Storage ──────────────────────────────────────────────────────────
class DataFileError(Exception):
    """The notes file exists but cannot be read. Never overwrite it."""


def _read(path: str):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict) or not isinstance(data.get("notes"), list):
        raise ValueError("unexpected content")
    return data


def _load_notes_file(path: str) -> dict:
    """Load the notes.

    A missing file means no notes yet. A broken file is NOT treated as empty
    (that used to wipe all notes on the next save): it is copied aside, the
    last good backup (.bak) is used, and otherwise an error is raised so
    nothing gets overwritten.
    """
    if not os.path.exists(path):
        return {"notes": []}
    try:
        return _read(path)
    except (ValueError, OSError) as err:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        try:
            shutil.copy2(path, f"{path}.corrupt-{stamp}")
        except OSError:
            pass
        try:
            data = _read(path + ".bak")
            _LOGGER.warning("Notes Manager: %s was damaged (%s), backup used", path, err)
            return data
        except (ValueError, OSError):
            pass
        _LOGGER.error("Notes Manager: %s cannot be read (%s); nothing will be overwritten", path, err)
        raise DataFileError("notes file is damaged") from err


def _save_notes_file(path: str, data: dict) -> None:
    """Write atomically: temp file first, keep the previous version as .bak."""
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    if os.path.exists(path):
        try:
            shutil.copy2(path, path + ".bak")
        except OSError:
            pass
    os.replace(tmp, path)


def _copy_frontend(hass: HomeAssistant) -> None:
    """Copy the frontend JS file to www/community on every startup."""
    src = os.path.join(os.path.dirname(__file__), "frontend", "notes-manager-card.js")
    dst_dir = hass.config.path("www", "community", "ha-notes-manager")
    dst = os.path.join(dst_dir, "notes-manager-card.js")
    try:
        os.makedirs(dst_dir, exist_ok=True)
        shutil.copy2(src, dst)
        _LOGGER.info("Notes Manager: frontend JS copied to %s", dst)
    except OSError as e:
        _LOGGER.error("Notes Manager: failed to copy frontend JS: %s", e)


def _is_quiet_change(note: dict, body: dict) -> bool:
    """True when only the pin or ticks of a checklist change."""
    for field in NOTE_FIELDS:
        if field not in body or field in QUIET_FIELDS:
            continue
        if field == "checklist":
            old = [str(i.get("text", "")) for i in note.get("checklist") or [] if isinstance(i, dict)]
            new = [str(i.get("text", "")) for i in body.get("checklist") or [] if isinstance(i, dict)]
            if old != new:
                return False
        elif body[field] != note.get(field):
            return False
    return True


def _build_note(body: dict, existing: dict | None = None) -> dict:
    now = dt_util.now().isoformat()
    if existing:
        quiet = _is_quiet_change(existing, body)
        if "reminder" in body and body["reminder"] != existing.get("reminder"):
            existing.pop("reminded_at", None)  # new time: remind again
        for field in NOTE_FIELDS:
            if field in body:
                existing[field] = body[field]
        if not quiet:
            existing["updated_at"] = now
        return existing
    return {
        "id": str(uuid.uuid4()),
        "title": body.get("title", "Untitled"),
        "content": body.get("content", ""),
        "color": body.get("color", "yellow"),
        "type": body.get("type", "text"),
        "checklist": body.get("checklist", []),
        "images": body.get("images", []),
        "pinned": body.get("pinned", False),
        "reminder": body.get("reminder", None),
        "category": body.get("category", ""),
        "priority": body.get("priority", ""),
        "created_at": now,
        "updated_at": now,
    }


class NotesStore:
    """All reads/writes go through here: off the event loop, one at a time."""

    def __init__(self, hass: HomeAssistant):
        self.hass = hass
        self.path = hass.config.path(NOTES_FILE)
        self.lock = asyncio.Lock()
        self._reminder_unsubs: dict[str, callable] = {}

    async def load(self) -> dict:
        return await self.hass.async_add_executor_job(_load_notes_file, self.path)

    async def update(self, fn):
        async with self.lock:
            data = await self.load()
            result = fn(data)
            await self.hass.async_add_executor_job(_save_notes_file, self.path, data)
        await self.schedule_reminders(data)
        return result

    def fire(self, payload: dict):
        self.hass.bus.async_fire(EVENT_UPDATED, payload)

    # ── reminders ──
    async def schedule_reminders(self, data: dict | None = None):
        """(Re)plan a callback for every reminder that hasn't been sent."""
        if data is None:
            try:
                data = await self.load()
            except DataFileError:
                return
        for unsub in self._reminder_unsubs.values():
            unsub()
        self._reminder_unsubs = {}
        now = dt_util.now()
        for note in data.get("notes", []):
            when = dt_util.parse_datetime(note.get("reminder") or "") if note.get("reminder") else None
            if not when or note.get("reminded_at"):
                continue
            if when.tzinfo is None:
                when = when.replace(tzinfo=dt_util.DEFAULT_TIME_ZONE)
            if when <= now:
                if now - when <= MISSED_REMINDER_WINDOW:
                    self.hass.async_create_task(self._remind(note["id"]))
                continue
            self._reminder_unsubs[note["id"]] = async_track_point_in_time(
                self.hass, self._make_cb(note["id"]), when)

    def _make_cb(self, note_id: str):
        @callback
        def _due(_now):
            self.hass.async_create_task(self._remind(note_id))
        return _due

    async def _remind(self, note_id: str):
        """Send the reminder once: event (for automations) + HA notification."""
        sent = {}

        def mark(data):
            for note in data["notes"]:
                if note.get("id") == note_id and note.get("reminder") and not note.get("reminded_at"):
                    note["reminded_at"] = dt_util.now().isoformat()
                    sent.update(note)

        try:
            async with self.lock:
                data = await self.load()
                mark(data)
                if sent:
                    await self.hass.async_add_executor_job(_save_notes_file, self.path, data)
        except DataFileError:
            return
        if not sent:
            return
        text = sent.get("content") or "\n".join(
            f"- {i.get('text', '')}" for i in sent.get("checklist") or [] if isinstance(i, dict))
        self.hass.bus.async_fire(EVENT_REMINDER, {
            "note_id": note_id,
            "title": sent.get("title", ""),
            "content": text,
            "reminder": sent.get("reminder"),
            "category": sent.get("category", ""),
        })
        persistent_notification.async_create(
            self.hass, text or " ", title=f"⏰ {sent.get('title', '')}",
            notification_id=f"{DOMAIN}_{note_id}")
        self.fire({"action": "update", "note": sent})


# ─── Setup ────────────────────────────────────────────────────────────
@websocket_api.websocket_command({vol.Required("type"): "notes_manager/subscribe"})
@callback
def _ws_subscribe(hass, connection, msg):
    """Live updates for every logged-in user (plain subscribe_events on a
    custom event is admin-only, so family dashboards never updated)."""
    @callback
    def forward(event):
        connection.send_message(websocket_api.event_message(msg["id"], event.data))

    connection.subscriptions[msg["id"]] = hass.bus.async_listen(EVENT_UPDATED, forward)
    connection.send_result(msg["id"])


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    await hass.async_add_executor_job(_copy_frontend, hass)
    store = NotesStore(hass)
    hass.data[DOMAIN] = store

    async def handle_add_note(call: ServiceCall) -> None:
        note = _build_note(dict(call.data))
        try:
            await store.update(lambda data: data["notes"].append(note))
        except DataFileError as err:
            raise HomeAssistantError(str(err)) from err
        store.fire({"action": "add", "note": note})

    async def handle_update_note(call: ServiceCall) -> None:
        note_id = call.data[ATTR_NOTE_ID]

        def change(data):
            for note in data["notes"]:
                if note.get("id") == note_id:
                    return _build_note(dict(call.data), existing=note)
            return None

        try:
            note = await store.update(change)
        except DataFileError as err:
            raise HomeAssistantError(str(err)) from err
        if note is None:
            raise HomeAssistantError(f"Note not found: {note_id}")
        store.fire({"action": "update", "note": note})

    async def handle_delete_note(call: ServiceCall) -> None:
        note_id = call.data[ATTR_NOTE_ID]

        def change(data):
            before = len(data["notes"])
            data["notes"] = [n for n in data["notes"] if n.get("id") != note_id]
            return len(data["notes"]) < before

        try:
            deleted = await store.update(change)
        except DataFileError as err:
            raise HomeAssistantError(str(err)) from err
        if deleted:
            store.fire({"action": "delete", "note_id": note_id})

    hass.services.async_register(DOMAIN, SERVICE_ADD_NOTE, handle_add_note, schema=SERVICE_ADD_NOTE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_NOTE, handle_update_note, schema=SERVICE_UPDATE_NOTE_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_DELETE_NOTE, handle_delete_note, schema=SERVICE_DELETE_NOTE_SCHEMA)

    hass.http.register_view(NotesView())
    hass.http.register_view(NoteDetailView())
    websocket_api.async_register_command(hass, _ws_subscribe)

    await store.schedule_reminders()
    _LOGGER.info("Notes Manager integration loaded successfully")
    return True


def _error(view, err):
    return view.json({"error": str(err)}, status_code=500)


class NotesView(HomeAssistantView):
    url = "/api/notes_manager/notes"
    name = "api:notes_manager:notes"
    requires_auth = True

    async def get(self, request):
        store: NotesStore = request.app["hass"].data[DOMAIN]
        try:
            data = await store.load()
        except DataFileError as err:
            return _error(self, err)
        return self.json(data["notes"])

    async def post(self, request):
        store: NotesStore = request.app["hass"].data[DOMAIN]
        note = _build_note(await request.json())
        try:
            await store.update(lambda data: data["notes"].append(note))
        except (DataFileError, OSError) as err:
            return _error(self, err)
        store.fire({"action": "add", "note": note})
        return self.json(note)


class NoteDetailView(HomeAssistantView):
    url = "/api/notes_manager/notes/{note_id}"
    name = "api:notes_manager:note_detail"
    requires_auth = True

    async def put(self, request, note_id):
        store: NotesStore = request.app["hass"].data[DOMAIN]
        body = await request.json()

        def change(data):
            for note in data["notes"]:
                if note.get("id") == note_id:
                    return _build_note(body, existing=note)
            return None

        try:
            note = await store.update(change)
        except (DataFileError, OSError) as err:
            return _error(self, err)
        if note is None:
            return self.json_message("Note not found", status_code=404)
        store.fire({"action": "update", "note": note})
        return self.json(note)

    async def delete(self, request, note_id):
        store: NotesStore = request.app["hass"].data[DOMAIN]

        def change(data):
            before = len(data["notes"])
            data["notes"] = [n for n in data["notes"] if n.get("id") != note_id]
            return len(data["notes"]) < before

        try:
            deleted = await store.update(change)
        except (DataFileError, OSError) as err:
            return _error(self, err)
        if not deleted:
            return self.json_message("Note not found", status_code=404)
        store.fire({"action": "delete", "note_id": note_id})
        return self.json_message("Note deleted")
