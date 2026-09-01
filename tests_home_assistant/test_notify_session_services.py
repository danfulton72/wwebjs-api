"""Tests for WhatsApp HA notification and session lifecycle services."""

from unittest.mock import AsyncMock, call, patch

import pytest

from homeassistant.components.notify.const import (
    ATTR_DATA,
    ATTR_MESSAGE,
    ATTR_TARGET,
    ATTR_TITLE,
)
from homeassistant.const import CONF_URL
from homeassistant.exceptions import ServiceValidationError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.whatsapp.api import WWebJSApiClient
from custom_components.whatsapp.const import (
    ATTR_MEDIA_URL,
    ATTR_SESSION_ID,
    CONF_API_KEY,
    DOMAIN,
    NOTIFY_DOMAIN,
    SERVICE_NOTIFY_SEND_MESSAGE,
    SERVICE_SESSION_END,
    SERVICE_SESSION_START,
)

URL = "http://wwebjs.local:3000"
API_KEY = "test-api-key"


async def _setup_entry(
    hass,
    *,
    url: str = URL,
    sessions: list[str] | None = None,
) -> MockConfigEntry:
    """Create and load one WhatsApp HA config entry."""
    session_ids = ["ABCD"] if sessions is None else sessions
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


async def test_notify_send_message_preserves_wapi_call_pattern(hass) -> None:
    """Test the legacy WAPI message/title/target/media pattern is preserved."""
    entry = await _setup_entry(hass)
    send_mock = AsyncMock(return_value={"success": True})

    with patch.object(
        entry.runtime_data.client,
        "async_send_message",
        send_mock,
    ):
        await hass.services.async_call(
            NOTIFY_DOMAIN,
            SERVICE_NOTIFY_SEND_MESSAGE,
            {
                ATTR_MESSAGE: "The garage door has been open for 10 minutes.",
                ATTR_TITLE: "Your Garage Door Friend",
                ATTR_TARGET: "447745160674@c.us",
                ATTR_DATA: {
                    ATTR_MEDIA_URL: (
                        "https://example.com/one.jpg\n"
                        "https://example.com/two.jpg"
                    )
                },
            },
            blocking=True,
        )

    assert send_mock.await_args_list == [
        call(
            "ABCD",
            {
                "content": (
                    "*Your Garage Door Friend* \n"
                    "The garage door has been open for 10 minutes."
                ),
                "chatId": "447745160674@c.us",
                "contentType": "string",
            },
        ),
        call(
            "ABCD",
            {
                "content": "https://example.com/one.jpg",
                "chatId": "447745160674@c.us",
                "contentType": "MessageMediaFromURL",
            },
        ),
        call(
            "ABCD",
            {
                "content": "https://example.com/two.jpg",
                "chatId": "447745160674@c.us",
                "contentType": "MessageMediaFromURL",
            },
        ),
    ]


async def test_notify_send_message_without_title_sends_plain_message(hass) -> None:
    """Test title remains optional while the legacy target field is retained."""
    entry = await _setup_entry(hass)
    send_mock = AsyncMock(return_value={"success": True})

    with patch.object(entry.runtime_data.client, "async_send_message", send_mock):
        await hass.services.async_call(
            NOTIFY_DOMAIN,
            SERVICE_NOTIFY_SEND_MESSAGE,
            {
                ATTR_MESSAGE: "Hello from Home Assistant",
                ATTR_TARGET: "447745160674@c.us",
            },
            blocking=True,
        )

    send_mock.assert_awaited_once_with(
        "ABCD",
        {
            "content": "Hello from Home Assistant",
            "chatId": "447745160674@c.us",
            "contentType": "string",
        },
    )


async def test_notify_send_message_rejects_ambiguous_sessions(hass) -> None:
    """Test the notifier never guesses which WhatsApp account should send."""
    entry = await _setup_entry(hass, sessions=["ABCD", "EFGH"])
    send_mock = AsyncMock(return_value={"success": True})

    with (
        patch.object(entry.runtime_data.client, "async_send_message", send_mock),
        pytest.raises(ServiceValidationError),
    ):
        await hass.services.async_call(
            NOTIFY_DOMAIN,
            SERVICE_NOTIFY_SEND_MESSAGE,
            {
                ATTR_MESSAGE: "Hello",
                ATTR_TARGET: "447745160674@c.us",
            },
            blocking=True,
        )

    send_mock.assert_not_awaited()


async def test_session_start_uses_configured_connection_and_refreshes(hass) -> None:
    """Test starting a session uses integration credentials and refreshes entities."""
    entry = await _setup_entry(hass, sessions=[])
    start_mock = AsyncMock(
        return_value={"success": True, "message": "session_started"}
    )
    refresh_mock = AsyncMock()

    with (
        patch.object(entry.runtime_data.client, "async_start_session", start_mock),
        patch.object(entry.runtime_data, "async_request_refresh", refresh_mock),
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SESSION_START,
            {ATTR_SESSION_ID: "NEWSESSION"},
            blocking=True,
            return_response=True,
        )

    start_mock.assert_awaited_once_with("NEWSESSION")
    refresh_mock.assert_awaited_once_with()
    assert response == {
        "success": True,
        "message": "session_started",
        "session_id": "NEWSESSION",
    }


async def test_session_end_routes_by_session_and_refreshes(hass) -> None:
    """Test ending a session terminates the session on its owning connection."""
    first = await _setup_entry(
        hass,
        url="http://first-wwebjs.local:3000",
        sessions=["FIRST"],
    )
    second = await _setup_entry(
        hass,
        url="http://second-wwebjs.local:3000",
        sessions=["SECOND"],
    )
    first_end = AsyncMock(return_value={"success": True})
    second_end = AsyncMock(
        return_value={"success": True, "message": "Logged out successfully"}
    )
    second_refresh = AsyncMock()

    with (
        patch.object(first.runtime_data.client, "async_end_session", first_end),
        patch.object(second.runtime_data.client, "async_end_session", second_end),
        patch.object(second.runtime_data, "async_request_refresh", second_refresh),
    ):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_SESSION_END,
            {ATTR_SESSION_ID: "SECOND"},
            blocking=True,
            return_response=True,
        )

    first_end.assert_not_awaited()
    second_end.assert_awaited_once_with("SECOND")
    second_refresh.assert_awaited_once_with()
    assert response == {
        "success": True,
        "message": "Logged out successfully",
        "session_id": "SECOND",
    }
