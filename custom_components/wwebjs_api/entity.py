"""Entity helpers for the WWebJS API integration."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_URL
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DEFAULT_NAME, DOMAIN, MANUFACTURER, MODEL_API, MODEL_SESSION
from .coordinator import WWebJSDataUpdateCoordinator


def api_device_info(entry: ConfigEntry) -> DeviceInfo:
    """Return device information for the WWebJS API service."""
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name=DEFAULT_NAME,
        manufacturer=MANUFACTURER,
        model=MODEL_API,
        configuration_url=entry.data[CONF_URL],
    )


def session_device_info(entry: ConfigEntry, session_id: str) -> DeviceInfo:
    """Return device information for one WhatsApp Web session."""
    return DeviceInfo(
        identifiers={(DOMAIN, f"{entry.entry_id}:{session_id}")},
        name=f"WhatsApp {session_id}",
        manufacturer=MANUFACTURER,
        model=MODEL_SESSION,
        configuration_url=entry.data[CONF_URL],
        via_device=(DOMAIN, entry.entry_id),
    )


class WWebJSSessionEntity(CoordinatorEntity[WWebJSDataUpdateCoordinator]):
    """Base class for entities attached to one WWebJS session."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: WWebJSDataUpdateCoordinator,
        entry: ConfigEntry,
        session_id: str,
    ) -> None:
        """Initialize a session entity."""
        super().__init__(coordinator, context=session_id)
        self._entry = entry
        self.session_id = session_id
        self._attr_device_info = session_device_info(entry, session_id)

    @property
    def available(self) -> bool:
        """Return whether this session is present in the latest API update."""
        return super().available and self.session_id in self.coordinator.data
