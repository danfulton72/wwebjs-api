"""Sensors for the WWebJS API integration."""

from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from . import WWebJSApiConfigEntry
from .coordinator import WWebJSDataUpdateCoordinator
from .entity import WWebJSSessionEntity, api_device_info

PARALLEL_UPDATES = 0


async def async_setup_entry(
    hass: HomeAssistant,
    entry: WWebJSApiConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up WWebJS API sensors from a config entry."""
    coordinator = entry.runtime_data
    known_sessions: set[str] = set()

    async_add_entities([WWebJSSessionCountSensor(coordinator, entry)])

    @callback
    def async_add_new_sessions() -> None:
        """Add status sensors for sessions discovered after setup."""
        new_sessions = set(coordinator.data) - known_sessions
        if not new_sessions:
            return
        known_sessions.update(new_sessions)
        async_add_entities(
            [
                WWebJSSessionStatusSensor(coordinator, entry, session_id)
                for session_id in sorted(new_sessions)
            ]
        )

    async_add_new_sessions()
    entry.async_on_unload(coordinator.async_add_listener(async_add_new_sessions))


class WWebJSSessionCountSensor(
    CoordinatorEntity[WWebJSDataUpdateCoordinator], SensorEntity
):
    """Sensor reporting the number of sessions exposed by the API."""

    _attr_has_entity_name = True
    _attr_translation_key = "sessions"
    _attr_icon = "mdi:whatsapp"

    def __init__(
        self, coordinator: WWebJSDataUpdateCoordinator, entry: ConfigEntry
    ) -> None:
        """Initialize the session-count sensor."""
        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.entry_id}_sessions"
        self._attr_device_info = api_device_info(entry)

    @property
    def native_value(self) -> int:
        """Return the current number of known sessions."""
        return len(self.coordinator.data)


class WWebJSSessionStatusSensor(WWebJSSessionEntity, SensorEntity):
    """Sensor reporting the connection state of one WhatsApp session."""

    _attr_translation_key = "status"
    _attr_icon = "mdi:whatsapp"

    def __init__(
        self,
        coordinator: WWebJSDataUpdateCoordinator,
        entry: ConfigEntry,
        session_id: str,
    ) -> None:
        """Initialize a session status sensor."""
        super().__init__(coordinator, entry, session_id)
        self._attr_unique_id = f"{entry.entry_id}_{session_id}_status"

    @property
    def native_value(self) -> str:
        """Return the latest state reported by whatsapp-web.js."""
        data = self.coordinator.data.get(self.session_id)
        if data is None:
            return "unknown"
        if data.state:
            return data.state
        if data.message:
            return data.message
        return "unknown"

    @property
    def extra_state_attributes(self) -> dict[str, str | bool]:
        """Return useful session diagnostics."""
        data = self.coordinator.data.get(self.session_id)
        if data is None:
            return {"session_id": self.session_id}
        return {
            "session_id": self.session_id,
            "connected": data.success,
            "message": data.message,
        }
