"""Tests for WhatsApp HA response service actions."""

from unittest.mock import AsyncMock, patch

import pytest

from homeassistant.const import CONF_URL
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.whatsapp.api import WWebJSApiClient
from custom_components.whatsapp.const import (
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


async def _setup_entry(
    hass,
    *,
    url: str = URL,
    sessions: list[str] | None = None,
) -> MockConfigEntry:
    """Create and load one WhatsApp HA config entry."""
    session_ids = sessions or ["alpha"]
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="WhatsApp HA",
        data={CONF_URL: url, CONF_API_KEY: API_KEY},
        unique_id=url.lower(),
    )
    entry.add_to_hass(hass)

    with (
        patch.object(
            WWebJSApiClient,
            "async_get_sessions",
            new=AsyncMock(return_value=session_ids),
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


async def test_search_contacts_uses_configured_connection_automatically(hass) -> None:
    """Test the service uses the integration connection without a user field."""
    entry = await _setup_entry(hass)
    response_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with patch.object(
        entry.runtime_data.client,
        "async_get_contacts_response",
        response_mock,
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
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


async def test_search_contacts_routes_to_connection_owning_session(hass) -> None:
    """Test multiple configured APIs are resolved from the requested session."""
    first = await _setup_entry(
        hass,
        url="http://first-wwebjs.local:3000",
        sessions=["alpha"],
    )
    second = await _setup_entry(
        hass,
        url="http://second-wwebjs.local:3000",
        sessions=["beta"],
    )

    first_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)
    second_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with (
        patch.object(
            first.runtime_data.client,
            "async_get_contacts_response",
            first_mock,
        ),
        patch.object(
            second.runtime_data.client,
            "async_get_contacts_response",
            second_mock,
        ),
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_SESSION_ID: "beta",
                ATTR_PATTERN: "James",
            },
            blocking=True,
            return_response=True,
        )

    first_mock.assert_not_awaited()
    second_mock.assert_awaited_once_with("beta")
    assert response["count"] == 1
    assert response["contacts"] == [CONTACTS_API_RESPONSE["contacts"][1]]


async def test_search_contacts_rejects_ambiguous_session_connection(hass) -> None:
    """Test the service does not guess when two APIs own the same session ID."""
    first = await _setup_entry(
        hass,
        url="http://first-wwebjs.local:3000",
        sessions=["shared"],
    )
    second = await _setup_entry(
        hass,
        url="http://second-wwebjs.local:3000",
        sessions=["shared"],
    )

    first_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)
    second_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with (
        patch.object(
            first.runtime_data.client,
            "async_get_contacts_response",
            first_mock,
        ),
        patch.object(
            second.runtime_data.client,
            "async_get_contacts_response",
            second_mock,
        ),
        pytest.raises(ServiceValidationError),
    ):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_SESSION_ID: "shared",
                ATTR_PATTERN: "James",
            },
            blocking=True,
            return_response=True,
        )

    first_mock.assert_not_awaited()
    second_mock.assert_not_awaited()


async def test_search_contacts_filters_without_dropping_attributes(hass) -> None:
    """Test filtering returns one complete raw contact object unchanged."""
    entry = await _setup_entry(hass)
    response_mock = AsyncMock(return_value=CONTACTS_API_RESPONSE)

    with patch.object(
        entry.runtime_data.client,
        "async_get_contacts_response",
        response_mock,
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
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
            entry.runtime_data.client,
            "async_get_contacts_response",
            response_mock,
        ),
        pytest.raises(ServiceValidationError),
    ):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_SEARCH_CONTACTS,
            {
                ATTR_SESSION_ID: "alpha",
                ATTR_PATTERN: "[",
            },
            blocking=True,
            return_response=True,
        )

    response_mock.assert_not_awaited()
