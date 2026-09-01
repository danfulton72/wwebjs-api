"""Tests for WhatsApp HA response service actions."""

from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.const import CONF_URL
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.whatsapp.api import WWebJSApiClient
from custom_components.whatsapp.const import (
    ATTR_CONFIG_ENTRY_ID,
    ATTR_PATTERN,
    ATTR_SESSION_ID,
    CONF_API_KEY,
    DOMAIN,
    SERVICE_SEARCH_CONTACTS,
)

URL = "http://wwebjs.local:3000"
API_KEY = "test-api-key"

CONTACTS = [
    {
        "id": {"_serialized": "441111111111@c.us", "user": "441111111111"},
        "name": "Alice Adams",
        "pushname": "Alice",
        "shortName": "Alice",
        "number": "441111111111",
        "isMyContact": True,
    },
    {
        "id": {"_serialized": "447700900999@c.us", "user": "447700900999"},
        "name": "Robert Example",
        "pushname": "Bobby",
        "number": "447700900999",
        "isMyContact": True,
    },
    {
        "id": {"_serialized": "442222222222@c.us", "user": "442222222222"},
        "name": "Charlie Example",
        "number": "442222222222",
        "isMyContact": True,
    },
]


async def _setup_entry(hass) -> MockConfigEntry:
    """Create and load one WhatsApp HA config entry."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="WhatsApp HA",
        data={CONF_URL: URL, CONF_API_KEY: API_KEY},
        unique_id=URL.lower(),
    )
    entry.add_to_hass(hass)

    with (
        patch.object(
            WWebJSApiClient,
            "async_get_sessions",
            new=AsyncMock(return_value=["alpha"]),
        ),
        patch.object(
            WWebJSApiClient,
            "async_get_session_status",
            new=AsyncMock(
                return_value={
                    "success": True,
                    "state": "CONNECTED",
                    "message": "session_connected",
                }
            ),
        ),
    ):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()

    return entry


async def test_search_contacts_returns_matching_json(hass) -> None:
    """Test regex matching and JSON response data from the contacts endpoint."""
    entry = await _setup_entry(hass)
    contacts_mock = AsyncMock(return_value=CONTACTS)

    with patch.object(WWebJSApiClient, "async_get_contacts", contacts_mock):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_CONFIG_ENTRY_ID: entry.entry_id,
                ATTR_SESSION_ID: "alpha",
                ATTR_PATTERN: "(?i)^alice|447700900999",
            },
            blocking=True,
            return_response=True,
        )

    contacts_mock.assert_awaited_once_with("alpha")
    assert response == {
        "session_id": "alpha",
        "pattern": "(?i)^alice|447700900999",
        "count": 2,
        "contacts": CONTACTS[:2],
    }


async def test_search_contacts_rejects_invalid_regex(hass) -> None:
    """Test invalid regex patterns are reported as service validation errors."""
    entry = await _setup_entry(hass)
    contacts_mock = AsyncMock(return_value=CONTACTS)

    with (
        patch.object(WWebJSApiClient, "async_get_contacts", contacts_mock),
        pytest.raises(ServiceValidationError),
    ):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_CONFIG_ENTRY_ID: entry.entry_id,
                ATTR_SESSION_ID: "alpha",
                ATTR_PATTERN: "[",
            },
            blocking=True,
            return_response=True,
        )

    contacts_mock.assert_not_awaited()
