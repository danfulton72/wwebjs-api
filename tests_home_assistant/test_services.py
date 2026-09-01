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

CONTACTS_API_RESPONSE = {
    "success": True,
    "contacts": [
        {
            "id": {
                "server": "c.us",
                "user": "447350471200",
                "_serialized": "447350471200@c.us",
            },
            "number": "447350471200",
            "isBusiness": False,
            "isEnterprise": False,
            "labels": [],
            "name": "+44 7350 471200",
            "shortName": "",
            "statusMute": False,
            "type": "in",
            "isMe": True,
            "isUser": True,
            "isGroup": False,
            "isWAContact": True,
            "isMyContact": True,
            "isBlocked": False,
        },
        {
            "id": {
                "server": "c.us",
                "user": "447745160674",
                "_serialized": "447745160674@c.us",
            },
            "number": "102817356329071",
            "isBusiness": False,
            "labels": [],
            "name": "James Norval",
            "shortName": "James",
            "type": "in",
            "isMe": False,
            "isUser": True,
            "isGroup": False,
            "isWAContact": True,
            "isMyContact": True,
            "isBlocked": False,
        },
    ],
}


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


async def test_search_contacts_preserves_all_matching_attributes(hass) -> None:
    """Test matching contacts preserve the complete API response attributes."""
    entry = await _setup_entry(hass)
    response_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with patch.object(
        WWebJSApiClient,
        "async_get_contacts_response",
        response_mock,
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_CONFIG_ENTRY_ID: entry.entry_id,
                ATTR_SESSION_ID: "alpha",
                ATTR_PATTERN: "James|447350471200",
            },
            blocking=True,
            return_response=True,
        )

    response_mock.assert_awaited_once_with("alpha")
    assert response == {
        "success": True,
        "session_id": "alpha",
        "pattern": "James|447350471200",
        "count": 2,
        "contacts": CONTACTS_API_RESPONSE["contacts"],
    }
    assert response["contacts"][0] == CONTACTS_API_RESPONSE["contacts"][0]
    assert response["contacts"][1] == CONTACTS_API_RESPONSE["contacts"][1]


async def test_search_contacts_filters_without_dropping_attributes(hass) -> None:
    """Test filtering returns one complete raw contact object unchanged."""
    entry = await _setup_entry(hass)
    response_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with patch.object(
        WWebJSApiClient,
        "async_get_contacts_response",
        response_mock,
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_CONFIG_ENTRY_ID: entry.entry_id,
                ATTR_SESSION_ID: "alpha",
                ATTR_PATTERN: "^James$",
            },
            blocking=True,
            return_response=True,
        )

    assert response["success"] is True
    assert response["count"] == 1
    assert response["contacts"] == [CONTACTS_API_RESPONSE["contacts"][1]]


async def test_search_contacts_rejects_invalid_regex(hass) -> None:
    """Test invalid regex patterns are reported as service validation errors."""
    entry = await _setup_entry(hass)
    response_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with (
        patch.object(
            WWebJSApiClient,
            "async_get_contacts_response",
            response_mock,
        ),
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

    response_mock.assert_not_awaited()
