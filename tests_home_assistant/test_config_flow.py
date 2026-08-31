"""Tests for the WWebJS API Home Assistant config flow."""

from unittest.mock import AsyncMock, patch

from homeassistant.config_entries import SOURCE_IMPORT, SOURCE_USER
from homeassistant.const import CONF_URL
from homeassistant.data_entry_flow import FlowResultType

from custom_components.wwebjs_api import async_setup
from custom_components.wwebjs_api.api import WWebJSApiError
from custom_components.wwebjs_api.const import CONF_API_KEY, DOMAIN

URL = "http://wwebjs.local:3000"
API_KEY = "test-api-key"


async def test_user_config_flow_creates_entry(hass) -> None:
    """Test UI setup validates the API and creates a config entry."""
    with patch(
        "custom_components.wwebjs_api.config_flow.WWebJSApiClient.async_get_sessions",
        new=AsyncMock(return_value=[]),
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_USER}
        )
        assert result["type"] is FlowResultType.FORM

        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_URL: f"{URL}/", CONF_API_KEY: API_KEY},
        )
        assert result["type"] is FlowResultType.CREATE_ENTRY
        assert result["data"] == {CONF_URL: URL, CONF_API_KEY: API_KEY}
        await hass.async_block_till_done()


async def test_user_config_flow_rejects_invalid_key(hass) -> None:
    """Test an invalid API key is reported in the UI."""
    with patch(
        "custom_components.wwebjs_api.config_flow.WWebJSApiClient.async_get_sessions",
        new=AsyncMock(side_effect=WWebJSApiError("invalid_auth")),
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_USER}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {CONF_URL: URL, CONF_API_KEY: "wrong"},
        )

    assert result["type"] is FlowResultType.FORM
    assert result["errors"] == {"base": "invalid_auth"}


async def test_configuration_yaml_is_imported(hass) -> None:
    """Test legacy configuration.yaml is converted into a config entry."""
    with patch(
        "custom_components.wwebjs_api.config_flow.WWebJSApiClient.async_get_sessions",
        new=AsyncMock(return_value=[]),
    ):
        assert await async_setup(
            hass,
            {DOMAIN: {CONF_URL: URL, CONF_API_KEY: API_KEY}},
        )
        await hass.async_block_till_done()

    entries = hass.config_entries.async_entries(DOMAIN)
    assert len(entries) == 1
    assert entries[0].data == {CONF_URL: URL, CONF_API_KEY: API_KEY}
    assert entries[0].unique_id == URL.lower()


async def test_duplicate_yaml_import_is_aborted(hass) -> None:
    """Test repeated YAML imports do not create duplicate entries."""
    data = {CONF_URL: URL, CONF_API_KEY: API_KEY}
    with patch(
        "custom_components.wwebjs_api.config_flow.WWebJSApiClient.async_get_sessions",
        new=AsyncMock(return_value=[]),
    ):
        first = await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data=data,
        )
        assert first["type"] is FlowResultType.CREATE_ENTRY

        second = await hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data=data,
        )

    assert second["type"] is FlowResultType.ABORT
    assert second["reason"] == "already_configured"
