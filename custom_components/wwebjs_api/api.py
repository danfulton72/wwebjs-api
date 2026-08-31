"""Small async client for the WWebJS REST API."""

from __future__ import annotations

from typing import Any

from aiohttp import ClientError, ClientSession, ClientTimeout


class WWebJSApiError(Exception):
    """Raised when the WWebJS API cannot be reached or rejects a request."""


class WWebJSApiClient:
    """Async client used by the Home Assistant integration."""

    def __init__(self, session: ClientSession, base_url: str, api_key: str) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    async def async_get_sessions(self) -> list[str]:
        """Return configured sessions and validate API credentials."""
        try:
            async with self._session.get(
                f"{self._base_url}/session/getSessions",
                headers={"x-api-key": self._api_key},
                timeout=ClientTimeout(total=10),
            ) as response:
                if response.status in (401, 403):
                    raise WWebJSApiError("invalid_auth")
                response.raise_for_status()
                payload: dict[str, Any] = await response.json()
        except WWebJSApiError:
            raise
        except (ClientError, TimeoutError, ValueError) as err:
            raise WWebJSApiError("cannot_connect") from err

        if not payload.get("success"):
            raise WWebJSApiError(str(payload.get("error") or "api_error"))

        sessions = payload.get("result", [])
        return [str(session_id) for session_id in sessions]
