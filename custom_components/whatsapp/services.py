"""Home Assistant service actions for WhatsApp HA."""

from __future__ import annotations

import re
from typing import Any

import voluptuous as vol

from homeassistant.components.notify.const import (
    ATTR_DATA,
    ATTR_MESSAGE,
    ATTR_TARGET,
    ATTR_TITLE,
)
from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.service import async_set_service_schema

from .api import WWebJSApiError
from .const import (
    ATTR_MEDIA_URL,
    ATTR_PATTERN,
    ATTR_SESSION_ID,
    DOMAIN,
    NOTIFY_DOMAIN,
    SERVICE_NOTIFY_SEND_MESSAGE,
    SERVICE_SEARCH_CONTACTS,
    SERVICE_SESSION_END,
    SERVICE_SESSION_START,
)

_SEARCH_PATTERN_MAX_LENGTH = 256
_SESSION_ID_MAX_LENGTH = 128
_CONTACT_MATCH_FIELDS = (
    "name",
    "pushname",
    "shortName",
    "verifiedName",
    "number",
)
_CONTACT_ID_FIELDS = ("_serialized", "user", "server")

SEARCH_CONTACTS_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_SESSION_ID): vol.All(
            cv.string, vol.Length(min=1, max=_SESSION_ID_MAX_LENGTH)
        ),
        vol.Required(ATTR_PATTERN): vol.All(
            cv.string, vol.Length(min=1, max=_SEARCH_PATTERN_MAX_LENGTH)
        ),
    }
)

SESSION_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_SESSION_ID): vol.All(
            cv.string, vol.Length(min=1, max=_SESSION_ID_MAX_LENGTH)
        )
    }
)

_MEDIA_URL_SCHEMA = vol.Any(
    cv.string,
    vol.All([cv.string], vol.Length(min=1)),
)

NOTIFY_SEND_MESSAGE_SCHEMA = vol.Schema(
    {
        vol.Optional(ATTR_SESSION_ID): vol.All(
            cv.string, vol.Length(min=1, max=_SESSION_ID_MAX_LENGTH)
        ),
        vol.Required(ATTR_MESSAGE): vol.All(cv.string, vol.Length(min=1)),
        vol.Optional(ATTR_TITLE): cv.string,
        vol.Required(ATTR_TARGET): vol.Any(
            cv.string,
            vol.All([cv.string], vol.Length(min=1)),
        ),
        vol.Optional(ATTR_DATA): vol.Any(
            None,
            vol.Schema(
                {vol.Optional(ATTR_MEDIA_URL): _MEDIA_URL_SCHEMA},
                extra=vol.ALLOW_EXTRA,
            ),
        ),
    }
)


def _contact_match_values(contact: dict[str, Any]) -> list[str]:
    """Return the stable contact identity fields used for regex matching."""
    values = [
        value
        for field in _CONTACT_MATCH_FIELDS
        if isinstance((value := contact.get(field)), str) and value
    ]

    contact_id = contact.get("id")
    if isinstance(contact_id, dict):
        values.extend(
            value
            for field in _CONTACT_ID_FIELDS
            if isinstance((value := contact_id.get(field)), str) and value
        )
    elif isinstance(contact_id, str) and contact_id:
        values.append(contact_id)

    return values


def _matches_contact(pattern: re.Pattern[str], contact: dict[str, Any]) -> bool:
    """Return whether a compiled regex matches the contact identity."""
    return any(pattern.search(value) for value in _contact_match_values(contact))


def _loaded_entries(hass: HomeAssistant) -> list[ConfigEntry]:
    """Return loaded WhatsApp HA config entries."""
    return [
        entry
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.state is ConfigEntryState.LOADED
    ]


def _resolve_single_loaded_entry(hass: HomeAssistant) -> ConfigEntry:
    """Resolve the only loaded WhatsApp HA API connection."""
    loaded_entries = _loaded_entries(hass)
    if not loaded_entries:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="no_loaded_connection",
        )
    if len(loaded_entries) != 1:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="ambiguous_api_connection",
        )
    return loaded_entries[0]


def _resolve_entry_for_session(hass: HomeAssistant, session_id: str) -> ConfigEntry:
    """Resolve the loaded WhatsApp HA connection that owns a session."""
    loaded_entries = _loaded_entries(hass)

    if not loaded_entries:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="no_loaded_connection",
        )

    session_entries = [
        entry
        for entry in loaded_entries
        if session_id in entry.runtime_data.data
    ]

    if len(session_entries) == 1:
        return session_entries[0]

    if len(session_entries) > 1:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="ambiguous_session_connection",
            translation_placeholders={"session_id": session_id},
        )

    if len(loaded_entries) == 1:
        return loaded_entries[0]

    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="session_connection_not_found",
        translation_placeholders={"session_id": session_id},
    )


def _resolve_notify_session(
    hass: HomeAssistant, requested_session_id: str | None = None
) -> tuple[ConfigEntry, str]:
    """Resolve the session used by the legacy-style notifier."""
    if requested_session_id:
        return (
            _resolve_entry_for_session(hass, requested_session_id),
            requested_session_id,
        )

    candidates = [
        (entry, str(session_id))
        for entry in _loaded_entries(hass)
        for session_id in entry.runtime_data.data
    ]

    if not candidates:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="no_session_available",
        )
    if len(candidates) != 1:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="ambiguous_notify_session",
        )
    return candidates[0]


def _normalize_targets(target: str | list[str]) -> list[str]:
    """Return notification targets as a clean list."""
    targets = [target] if isinstance(target, str) else target
    return [item.strip() for item in targets if item.strip()]


def _normalize_media_urls(value: str | list[str] | None) -> list[str]:
    """Return one or more media URLs from the legacy WAPI data shape."""
    if value is None:
        return []
    values = value.splitlines() if isinstance(value, str) else value
    return [url.strip() for url in values if url.strip()]


async def async_register_services(hass: HomeAssistant) -> None:
    """Register WhatsApp HA service actions once during integration setup."""

    if not hass.services.has_service(DOMAIN, SERVICE_SEARCH_CONTACTS):

        async def async_search_contacts(call: ServiceCall) -> ServiceResponse:
            """Return complete contact objects matching a regular expression."""
            session_id = call.data[ATTR_SESSION_ID]
            pattern_text = call.data[ATTR_PATTERN]
            entry = _resolve_entry_for_session(hass, session_id)

            try:
                pattern = re.compile(pattern_text)
            except re.error as err:
                raise ServiceValidationError(
                    translation_domain=DOMAIN,
                    translation_key="invalid_regex",
                    translation_placeholders={"error": str(err)},
                ) from err

            try:
                api_response = (
                    await entry.runtime_data.client.async_get_contacts_response(
                        session_id
                    )
                )
            except WWebJSApiError as err:
                if err.code == "invalid_auth":
                    entry.async_start_reauth(hass)
                raise HomeAssistantError(
                    translation_domain=DOMAIN,
                    translation_key="contact_search_failed",
                    translation_placeholders={"error": err.code},
                ) from err

            contacts = api_response["contacts"]
            matches = [
                contact for contact in contacts if _matches_contact(pattern, contact)
            ]

            return {
                **api_response,
                "contacts": matches,
                "session_id": session_id,
                "pattern": pattern_text,
                "count": len(matches),
            }

        hass.services.async_register(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            async_search_contacts,
            schema=SEARCH_CONTACTS_SCHEMA,
            supports_response=SupportsResponse.ONLY,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SESSION_START):

        async def async_session_start(call: ServiceCall) -> ServiceResponse:
            """Start a new WhatsApp session on the configured API connection."""
            session_id = call.data[ATTR_SESSION_ID]
            entry = _resolve_single_loaded_entry(hass)
            try:
                response = await entry.runtime_data.client.async_start_session(session_id)
            except WWebJSApiError as err:
                if err.code == "invalid_auth":
                    entry.async_start_reauth(hass)
                raise HomeAssistantError(
                    translation_domain=DOMAIN,
                    translation_key="session_start_failed",
                    translation_placeholders={"error": err.code},
                ) from err

            await entry.runtime_data.async_request_refresh()
            return {**response, "session_id": session_id}

        hass.services.async_register(
            DOMAIN,
            SERVICE_SESSION_START,
            async_session_start,
            schema=SESSION_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SESSION_END):

        async def async_session_end(call: ServiceCall) -> ServiceResponse:
            """Terminate and log out a WhatsApp session."""
            session_id = call.data[ATTR_SESSION_ID]
            entry = _resolve_entry_for_session(hass, session_id)
            try:
                response = await entry.runtime_data.client.async_end_session(session_id)
            except WWebJSApiError as err:
                if err.code == "invalid_auth":
                    entry.async_start_reauth(hass)
                raise HomeAssistantError(
                    translation_domain=DOMAIN,
                    translation_key="session_end_failed",
                    translation_placeholders={"error": err.code},
                ) from err

            await entry.runtime_data.async_request_refresh()
            return {**response, "session_id": session_id}

        hass.services.async_register(
            DOMAIN,
            SERVICE_SESSION_END,
            async_session_end,
            schema=SESSION_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )

    if not hass.services.has_service(NOTIFY_DOMAIN, SERVICE_NOTIFY_SEND_MESSAGE):

        async def async_notify_send_message(call: ServiceCall) -> None:
            """Send text and optional media using a configured WhatsApp session."""
            requested_session_id = call.data.get(ATTR_SESSION_ID)
            entry, session_id = _resolve_notify_session(hass, requested_session_id)
            message = call.data[ATTR_MESSAGE]
            title = call.data.get(ATTR_TITLE)
            targets = _normalize_targets(call.data[ATTR_TARGET])
            data = call.data.get(ATTR_DATA) or {}
            media_urls = _normalize_media_urls(data.get(ATTR_MEDIA_URL))
            content = f"*{title}* \n{message}" if title else message

            try:
                for target in targets:
                    await entry.runtime_data.client.async_send_message(
                        session_id,
                        {
                            "content": content,
                            "chatId": target,
                            "contentType": "string",
                        },
                    )
                    for media_url in media_urls:
                        await entry.runtime_data.client.async_send_message(
                            session_id,
                            {
                                "content": media_url,
                                "chatId": target,
                                "contentType": "MessageMediaFromURL",
                            },
                        )
            except WWebJSApiError as err:
                if err.code == "invalid_auth":
                    entry.async_start_reauth(hass)
                raise HomeAssistantError(
                    translation_domain=DOMAIN,
                    translation_key="notify_send_failed",
                    translation_placeholders={"error": err.code},
                ) from err

        hass.services.async_register(
            NOTIFY_DOMAIN,
            SERVICE_NOTIFY_SEND_MESSAGE,
            async_notify_send_message,
            schema=NOTIFY_SEND_MESSAGE_SCHEMA,
        )
        async_set_service_schema(
            hass,
            NOTIFY_DOMAIN,
            SERVICE_NOTIFY_SEND_MESSAGE,
            {
                "name": "Send WhatsApp message",
                "description": (
                    "Send a WhatsApp message using WhatsApp HA. With one session the "
                    "sending session is selected automatically; with multiple sessions "
                    "supply Session ID. Compatible with the legacy WAPI notifier "
                    "message/title/target/data pattern."
                ),
                "fields": {
                    ATTR_SESSION_ID: {
                        "description": (
                            "Optional WhatsApp session ID. Leave blank when only one "
                            "session is available; choose the sending session when "
                            "multiple sessions are connected."
                        ),
                        "example": "ABCD",
                        "selector": {"text": {}},
                    },
                    ATTR_MESSAGE: {
                        "required": True,
                        "description": "Message text to send.",
                        "selector": {"text": {"multiline": True}},
                    },
                    ATTR_TITLE: {
                        "description": (
                            "Optional title. When supplied it is sent in bold before the message."
                        ),
                        "selector": {"text": {}},
                    },
                    ATTR_TARGET: {
                        "required": True,
                        "description": (
                            "WhatsApp chat ID, for example 447700900123@c.us or a group ID ending @g.us."
                        ),
                        "selector": {"text": {}},
                    },
                    ATTR_DATA: {
                        "description": (
                            "Optional legacy WAPI data. Use media_url for one URL or newline-separated URLs."
                        ),
                        "example": {
                            "media_url": "https://example.com/image.jpg"
                        },
                        "selector": {"object": {}},
                    },
                },
            },
        )
