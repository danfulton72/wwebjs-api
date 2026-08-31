"""Home Assistant integration for WWebJS API."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import WWebJSApiClient
from .const import CONF_API_KEY, DOMAIN


type WWebJSApiConfigEntry = ConfigEntry[WWebJSApiClient]


async def async_setup_entry(hass: HomeAssistant, entry: WWebJSApiConfigEntry) -> bool:
    """Set up WWebJS API from a config entry."""
    client = WWebJSApiClient(
        async_get_clientsession(hass),
        entry.data["url"],
        entry.data[CONF_API_KEY],
    )
    await client.async_get_sessions()
    entry.runtime_data = client
    return True


async def async_unload_entry(hass: HomeAssistant, entry: WWebJSApiConfigEntry) -> bool:
    """Unload a WWebJS API config entry."""
    return True
