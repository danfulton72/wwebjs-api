"""Tests for WWebJS API Home Assistant session entities."""

from unittest.mock import AsyncMock, patch

from homeassistant.const import CONF_URL
from homeassistant.helpers import entity_registry as er
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.wwebjs_api.api import WWebJSApiClient
from custom_components.wwebjs_api.camera import WWebJSSessionQrCamera
from custom_components.wwebjs_api.const import CONF_API_KEY, DOMAIN

URL = "http://wwebjs.local:3000"
API_KEY = "test-api-key"


async def test_session_entities_and_dynamic_discovery(hass) -> None:
    """Test session sensors, QR cameras, and sessions discovered after setup."""
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="WWebJS API",
        data={CONF_URL: URL, CONF_API_KEY: API_KEY},
        unique_id=URL.lower(),
    )
    entry.add_to_hass(hass)

    sessions_mock = AsyncMock(return_value=["alpha"])

    async def status_for(session_id: str) -> dict:
        if session_id == "alpha":
            return {
                "success": True,
                "state": "CONNECTED",
                "message": "session_connected",
            }
        return {
            "success": False,
            "state": None,
            "message": "session_not_connected",
        }

    qr_bytes = b"\x89PNG\r\n\x1a\nmock-qr"
    qr_mock = AsyncMock(return_value=qr_bytes)

    with (
        patch.object(WWebJSApiClient, "async_get_sessions", sessions_mock),
        patch.object(
            WWebJSApiClient,
            "async_get_session_status",
            new=AsyncMock(side_effect=status_for),
        ),
        patch.object(WWebJSApiClient, "async_get_qr_image", qr_mock),
    ):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()

        registry = er.async_get(hass)

        def registry_entry(unique_id: str):
            return next(
                entity
                for entity in registry.entities.values()
                if entity.config_entry_id == entry.entry_id
                and entity.unique_id == unique_id
            )

        count = registry_entry(f"{entry.entry_id}_sessions")
        alpha_status = registry_entry(f"{entry.entry_id}_alpha_status")
        registry_entry(f"{entry.entry_id}_alpha_pairing_qr")

        assert hass.states[count.entity_id].state == "1"
        assert hass.states[alpha_status.entity_id].state == "CONNECTED"
        assert hass.states[alpha_status.entity_id].attributes["connected"] is True

        camera = WWebJSSessionQrCamera(entry.runtime_data, entry, "alpha")
        assert await camera.async_camera_image() == qr_bytes
        qr_mock.assert_awaited_with("alpha")

        sessions_mock.return_value = ["alpha", "beta"]
        await entry.runtime_data.async_request_refresh()
        await hass.async_block_till_done()

        beta_status = registry_entry(f"{entry.entry_id}_beta_status")
        registry_entry(f"{entry.entry_id}_beta_pairing_qr")

        assert hass.states[count.entity_id].state == "2"
        assert hass.states[beta_status.entity_id].state == "session_not_connected"
        assert hass.states[beta_status.entity_id].attributes["connected"] is False
