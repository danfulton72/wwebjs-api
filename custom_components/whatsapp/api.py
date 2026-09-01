"""Async client for the WWebJS REST API."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from aiohttp import ClientError, ClientSession, ClientTimeout

_REQUEST_TIMEOUT = ClientTimeout(total=10)


class WWebJSApiError(Exception):
    """Raised when the WWebJS API cannot be reached or rejects a request."""

    def __init__(self, code: str) -> None:
        """Initialize the API error with a stable error code."""
        self.code = code
        super().__init__(code)


class WWebJSApiClient:
    """Async client used by the Home Assistant integration."""

    def __init__(self, session: ClientSession, base_url: str, api_key: str) -> None:
        """Initialize the API client."""
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key

    @property
    def base_url(self) -> str:
        """Return the configured API base URL."""
        return self._base_url

    @property
    def _headers(self) -> dict[str, str]:
        """Return authentication headers."""
        return {"x-api-key": self._api_key}

    async def _async_get_json(self, path: str) -> dict[str, Any]:
        """GET a JSON endpoint and normalize transport/authentication errors."""
        try:
            async with self._session.get(
                f"{self._base_url}{path}",
                headers=self._headers,
                timeout=_REQUEST_TIMEOUT,
            ) as response:
                if response.status in (401, 403):
                    raise WWebJSApiError("invalid_auth")
                response.raise_for_status()
                payload = await response.json()
        except WWebJSApiError:
            raise
        except (ClientError, TimeoutError, ValueError) as err:
            raise WWebJSApiError("cannot_connect") from err

        if not isinstance(payload, dict):
            raise WWebJSApiError("invalid_response")
        return payload

    async def async_get_sessions(self) -> list[str]:
        """Return configured sessions and validate API credentials."""
        payload = await self._async_get_json("/session/getSessions")
        if not payload.get("success"):
            raise WWebJSApiError(str(payload.get("error") or "api_error"))

        sessions = payload.get("result", [])
        if not isinstance(sessions, list):
            raise WWebJSApiError("invalid_response")
        return [str(session_id) for session_id in sessions]

    async def async_get_contacts_response(self, session_id: str) -> dict[str, Any]:
        """Return the complete JSON response from the contacts endpoint."""
        safe_session_id = quote(session_id, safe="")
        payload = await self._async_get_json(
            f"/client/getContacts/{safe_session_id}"
        )
        if not payload.get("success"):
            raise WWebJSApiError(str(payload.get("error") or "api_error"))

        contacts = payload.get("contacts", [])
        if not isinstance(contacts, list) or not all(
            isinstance(contact, dict) for contact in contacts
        ):
            raise WWebJSApiError("invalid_response")
        return payload

    async def async_get_contacts(self, session_id: str) -> list[dict[str, Any]]:
        """Return JSON contacts for one WWebJS session."""
        payload = await self.async_get_contacts_response(session_id)
        return payload["contacts"]

    async def async_get_session_status(self, session_id: str) -> dict[str, Any]:
        """Return the status payload for one WWebJS session."""
        safe_session_id = quote(session_id, safe="")
        return await self._async_get_json(f"/session/status/{safe_session_id}")

    async def async_get_qr_image(self, session_id: str) -> bytes | None:
        """Return the current pairing QR image, or None when no QR is available."""
        safe_session_id = quote(session_id, safe="")
        try:
            async with self._session.get(
                f"{self._base_url}/session/qr/{safe_session_id}/image",
                headers=self._headers,
                timeout=_REQUEST_TIMEOUT,
            ) as response:
                if response.status in (401, 403):
                    raise WWebJSApiError("invalid_auth")
                response.raise_for_status()

                content_type = response.headers.get("Content-Type", "").split(";", 1)[0]
                if content_type == "image/png":
                    return await response.read()

                payload = await response.json()
                if isinstance(payload, dict) and not payload.get("success"):
                    return None
                raise WWebJSApiError("invalid_response")
        except WWebJSApiError:
            raise
        except (ClientError, TimeoutError, ValueError) as err:
            raise WWebJSApiError("cannot_connect") from err
