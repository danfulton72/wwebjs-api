"""Data coordinator for the WWebJS API integration."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import WWebJSApiClient, WWebJSApiError
from .const import DEFAULT_SCAN_INTERVAL, DOMAIN

_LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class WWebJSSessionData:
    """Normalized state for one WWebJS session."""

    session_id: str
    success: bool
    state: str | None
    message: str


class WWebJSDataUpdateCoordinator(
    DataUpdateCoordinator[dict[str, WWebJSSessionData]]
):
    """Coordinate one shared API poll for all WWebJS Home Assistant entities."""

    def __init__(self, hass: HomeAssistant, client: WWebJSApiClient) -> None:
        """Initialize the coordinator."""
        super().__init__(
            hass,
            logger=_LOGGER,
            name=DOMAIN,
            update_interval=DEFAULT_SCAN_INTERVAL,
            always_update=False,
        )
        self.client = client

    async def _async_update_data(self) -> dict[str, WWebJSSessionData]:
        """Fetch all known sessions and their current states."""
        try:
            session_ids = await self.client.async_get_sessions()
            payloads = await asyncio.gather(
                *(self.client.async_get_session_status(session_id) for session_id in session_ids)
            )
        except WWebJSApiError as err:
            if err.code == "invalid_auth":
                raise ConfigEntryAuthFailed("Invalid WWebJS API key") from err
            raise UpdateFailed(f"WWebJS API update failed: {err.code}") from err

        return {
            session_id: self._normalize_session(session_id, payload)
            for session_id, payload in zip(session_ids, payloads, strict=True)
        }

    @staticmethod
    def _normalize_session(
        session_id: str, payload: dict[str, Any]
    ) -> WWebJSSessionData:
        """Normalize a legacy session-status response."""
        state = payload.get("state")
        message = payload.get("message")
        return WWebJSSessionData(
            session_id=session_id,
            success=bool(payload.get("success")),
            state=str(state) if state is not None else None,
            message=str(message or ""),
        )
