"""Home Assistant service actions for WhatsApp HA."""

from __future__ import annotations

import re
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigEntryState
from homeassistant.core import (
    HomeAssistant,
    ServiceCall,
    ServiceResponse,
    SupportsResponse,
)
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv

from .api import WWebJSApiError
from .const import ATTR_PATTERN, ATTR_SESSION_ID, DOMAIN, SERVICE_SEARCH_CONTACTS

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


def _resolve_entry_for_session(hass: HomeAssistant, session_id: str) -> ConfigEntry:
    """Resolve the loaded WhatsApp HA connection that owns a session."""
    loaded_entries = [
        entry
        for entry in hass.config_entries.async_entries(DOMAIN)
        if entry.state is ConfigEntryState.LOADED
    ]

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

    # Most installations have one WhatsApp HA connection. Use it directly so a
    # recently created session can still be queried before the next coordinator
    # refresh discovers it.
    if len(loaded_entries) == 1:
        return loaded_entries[0]

    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="session_connection_not_found",
        translation_placeholders={"session_id": session_id},
    )


async def async_register_services(hass: HomeAssistant) -> None:
    """Register WhatsApp HA service actions once during integration setup."""
    if hass.services.has_service(DOMAIN, SERVICE_SEARCH_CONTACTS):
        return

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
            api_response = await entry.runtime_data.client.async_get_contacts_response(
                session_id
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

        # Preserve the complete API response envelope and every attribute on each
        # matching contact. Only the contacts collection is filtered; Home
        # Assistant-specific search metadata is added alongside the API data.
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
