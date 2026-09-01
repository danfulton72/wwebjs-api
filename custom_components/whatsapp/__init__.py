"""Home Assistant integration for WhatsApp HA."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL, Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.typing import ConfigType

from .api import WWebJSApiClient
from .const import CONF_API_KEY, DOMAIN
from .coordinator import WWebJSDataUpdateCoordinator
from .services import async_register_services

_LOGGER = logging.getLogger(__name__)

PLATFORMS = (Platform.SENSOR, Platform.CAMERA)

type WWebJSApiConfigEntry = ConfigEntry[WWebJSDataUpdateCoordinator]

CONFIG_SCHEMA = vol.Schema(
    {
        vol.Optional(DOMAIN): vol.Schema(
            {
                vol.Required(CONF_URL): cv.string,
                vol.Required(CONF_API_KEY): cv.string,
            }
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up WhatsApp HA and import legacy configuration.yaml settings."""
    await async_register_services(hass)

    if yaml_config := config.get(DOMAIN):
        _LOGGER.warning(
            "WhatsApp HA configuration.yaml setup is deprecated and will be imported "
            "into the UI; remove the whatsapp YAML block after the config entry appears"
        )
        hass.async_create_task(
            hass.config_entries.flow.async_init(
                DOMAIN,
                context={"source": config_entries.SOURCE_IMPORT},
                data=dict(yaml_config),
            )
        )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: WWebJSApiConfigEntry) -> bool:
    """Set up WhatsApp HA from a config entry."""
    client = WWebJSApiClient(
        async_get_clientsession(hass),
        entry.data[CONF_URL],
        entry.data[CONF_API_KEY],
    )
    coordinator = WWebJSDataUpdateCoordinator(hass, client)
    await coordinator.async_config_entry_first_refresh()

    entry.runtime_data = coordinator
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: WWebJSApiConfigEntry) -> bool:
    """Unload a WhatsApp HA config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
