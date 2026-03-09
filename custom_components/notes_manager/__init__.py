"""Notes Manager integration for Home Assistant."""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.util import dt as dt_util

_LOGGER = logging.getLogger(__name__)

DOMAIN = "notes_manager"
NOTES_FILE = "notes_manager_data.json"

SERVICE_ADD_NOTE = "add_note"
SERVICE_UPDATE_NOTE = "update_note"
SERVICE_DELETE_NOTE = "delete_note"

ATTR_NOTE_ID = "note_id"
ATTR_TITLE = "title"
ATTR_CONTENT = "content"
ATTR_COLOR = "color"

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
    {
        DOMAIN: vol.Schema({})
    },
    extra=vol.ALLOW_EXTRA,
)


def _get_notes_path(hass: HomeAssistant) -> str:
    return hass.config.path(NOTES_FILE)


def _load_notes(hass: HomeAssistant) -> dict:
    path = _get_notes_path(hass)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            _LOGGER.error("Error loading notes: %s", e)
    return {"notes": []}


def _save_notes(hass: HomeAssistant, data: dict) -> None:
    path = _get_notes_path(hass)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except OSError as e:
        _LOGGER.error("Error saving notes: %s", e)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the Notes Manager integration."""
    hass.data.setdefault(DOMAIN, {})

    async def handle_add_note(call: ServiceCall) -> None:
        """Handle the add_note service call."""
        data = _load_notes(hass)
        note = {
            "id": str(uuid.uuid4()),
            "title": call.data[ATTR_TITLE],
            "content": call.data.get(ATTR_CONTENT, ""),
            "color": call.data.get(ATTR_COLOR, "yellow"),
            "created_at": dt_util.now().isoformat(),
            "updated_at": dt_util.now().isoformat(),
        }
        data["notes"].append(note)
        _save_notes(hass, data)
        hass.bus.async_fire(f"{DOMAIN}_updated", {"action": "add", "note": note})
        _LOGGER.info("Note added: %s", note["title"])

    async def handle_update_note(call: ServiceCall) -> None:
        """Handle the update_note service call."""
        data = _load_notes(hass)
        note_id = call.data[ATTR_NOTE_ID]
        updated = False
        for note in data["notes"]:
            if note["id"] == note_id:
                if ATTR_TITLE in call.data:
                    note["title"] = call.data[ATTR_TITLE]
                if ATTR_CONTENT in call.data:
                    note["content"] = call.data[ATTR_CONTENT]
                if ATTR_COLOR in call.data:
                    note["color"] = call.data[ATTR_COLOR]
                note["updated_at"] = dt_util.now().isoformat()
                updated = True
                hass.bus.async_fire(f"{DOMAIN}_updated", {"action": "update", "note": note})
                break
        if updated:
            _save_notes(hass, data)
            _LOGGER.info("Note updated: %s", note_id)
        else:
            _LOGGER.warning("Note not found: %s", note_id)

    async def handle_delete_note(call: ServiceCall) -> None:
        """Handle the delete_note service call."""
        data = _load_notes(hass)
        note_id = call.data[ATTR_NOTE_ID]
        original_count = len(data["notes"])
        data["notes"] = [n for n in data["notes"] if n["id"] != note_id]
        if len(data["notes"]) < original_count:
            _save_notes(hass, data)
            hass.bus.async_fire(f"{DOMAIN}_updated", {"action": "delete", "note_id": note_id})
            _LOGGER.info("Note deleted: %s", note_id)
        else:
            _LOGGER.warning("Note not found for deletion: %s", note_id)

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_NOTE, handle_add_note, schema=SERVICE_ADD_NOTE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_NOTE, handle_update_note, schema=SERVICE_UPDATE_NOTE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_NOTE, handle_delete_note, schema=SERVICE_DELETE_NOTE_SCHEMA
    )

    # Register the API endpoint
    hass.http.register_view(NotesView(hass))
    hass.http.register_view(NoteDetailView(hass))

    # Register the panel (Lovelace dashboard card)
    await _async_register_panel(hass)

    _LOGGER.info("Notes Manager integration loaded successfully")
    return True


async def _async_register_panel(hass: HomeAssistant) -> None:
    """Register the frontend panel."""
    hass.components.frontend.async_register_built_in_panel(
        component_name="iframe",
        sidebar_title="Notities",
        sidebar_icon="mdi:note-text",
        frontend_url_path="notes-manager",
        config={"url": "/api/notes_manager/panel"},
        require_admin=False,
    )


from homeassistant.components.http import HomeAssistantView


class NotesView(HomeAssistantView):
    """Handle notes API requests."""

    url = "/api/notes_manager/notes"
    name = "api:notes_manager:notes"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def get(self, request):
        """Get all notes."""
        from aiohttp.web import Response
        data = _load_notes(self.hass)
        return self.json(data["notes"])

    async def post(self, request):
        """Add a new note."""
        body = await request.json()
        note = {
            "id": str(uuid.uuid4()),
            "title": body.get("title", "Untitled"),
            "content": body.get("content", ""),
            "color": body.get("color", "yellow"),
            "created_at": dt_util.now().isoformat(),
            "updated_at": dt_util.now().isoformat(),
        }
        data = _load_notes(self.hass)
        data["notes"].append(note)
        _save_notes(self.hass, data)
        self.hass.bus.async_fire(f"{DOMAIN}_updated", {"action": "add", "note": note})
        return self.json(note)


class NoteDetailView(HomeAssistantView):
    """Handle individual note API requests."""

    url = "/api/notes_manager/notes/{note_id}"
    name = "api:notes_manager:note_detail"
    requires_auth = True

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass

    async def put(self, request, note_id):
        """Update a note."""
        body = await request.json()
        data = _load_notes(self.hass)
        for note in data["notes"]:
            if note["id"] == note_id:
                note.update({
                    k: v for k, v in body.items()
                    if k in ("title", "content", "color")
                })
                note["updated_at"] = dt_util.now().isoformat()
                _save_notes(self.hass, data)
                self.hass.bus.async_fire(f"{DOMAIN}_updated", {"action": "update", "note": note})
                return self.json(note)
        return self.json_message("Note not found", status_code=404)

    async def delete(self, request, note_id):
        """Delete a note."""
        data = _load_notes(self.hass)
        original = len(data["notes"])
        data["notes"] = [n for n in data["notes"] if n["id"] != note_id]
        if len(data["notes"]) < original:
            _save_notes(self.hass, data)
            self.hass.bus.async_fire(f"{DOMAIN}_updated", {"action": "delete", "note_id": note_id})
            return self.json_message("Note deleted")
        return self.json_message("Note not found", status_code=404)
