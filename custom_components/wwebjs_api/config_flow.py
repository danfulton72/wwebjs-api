"""Config flow for WWebJS API."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.const import CONF_URL
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import WWebJSApiClient, WWebJSApiError
from .const import CONF_API_KEY, DEFAULT_NAME, DOMAIN


def _data_schema(url: str = "http://localhost:3000", api_key: str = "") -> vol.Schema:
    """Return the connection schema with useful defaults."""
    return vol.Schema(
        {
            vol.Required(CONF_URL, default=url): str,
            vol.Required(CONF_API_KEY, default=api_key): str,
        }
    )


class WWebJSApiConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for WWebJS API."""

    VERSION = 1

    async def _async_validate(self, data: dict[str, Any]) -> dict[str, Any]:
        """Normalize input and verify the WWebJS API connection."""
        normalized = {
            CONF_URL: str(data[CONF_URL]).rstrip("/"),
            CONF_API_KEY: str(data[CONF_API_KEY]),
        }
        client = WWebJSApiClient(
            async_get_clientsession(self.hass),
            normalized[CONF_URL],
            normalized[CONF_API_KEY],
        )
        await client.async_get_sessions()
        return normalized

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Handle setup initiated from the Home Assistant UI."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                data = await self._async_validate(user_input)
            except WWebJSApiError as err:
                errors["base"] = (
                    "invalid_auth" if err.code == "invalid_auth" else "cannot_connect"
                )
            else:
                await self.async_set_unique_id(data[CONF_URL].lower())
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=DEFAULT_NAME, data=data)

        return self.async_show_form(
            step_id="user",
            data_schema=_data_schema(),
            errors=errors,
        )

    async def async_step_import(
        self, import_data: dict[str, Any]
    ) -> ConfigFlowResult:
        """Import legacy configuration.yaml settings into a config entry."""
        try:
            data = await self._async_validate(import_data)
        except WWebJSApiError as err:
            reason = "invalid_auth" if err.code == "invalid_auth" else "cannot_connect"
            return self.async_abort(reason=reason)

        await self.async_set_unique_id(data[CONF_URL].lower())
        self._abort_if_unique_id_configured()
        return self.async_create_entry(title=DEFAULT_NAME, data=data)

    async def async_step_reconfigure(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Allow URL and API-key changes from the integrations UI."""
        entry = self._get_reconfigure_entry()
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                data = await self._async_validate(user_input)
            except WWebJSApiError as err:
                errors["base"] = (
                    "invalid_auth" if err.code == "invalid_auth" else "cannot_connect"
                )
            else:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates=data,
                )

        return self.async_show_form(
            step_id="reconfigure",
            data_schema=_data_schema(
                str(entry.data[CONF_URL]), str(entry.data[CONF_API_KEY])
            ),
            errors=errors,
        )

    async def async_step_reauth(
        self, entry_data: Mapping[str, Any]
    ) -> ConfigFlowResult:
        """Start reauthentication after the API rejects the saved key."""
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        """Validate and save a replacement API key."""
        entry = self._get_reauth_entry()
        errors: dict[str, str] = {}

        if user_input is not None:
            data = {
                CONF_URL: entry.data[CONF_URL],
                CONF_API_KEY: user_input[CONF_API_KEY],
            }
            try:
                await self._async_validate(data)
            except WWebJSApiError as err:
                errors["base"] = (
                    "invalid_auth" if err.code == "invalid_auth" else "cannot_connect"
                )
            else:
                return self.async_update_reload_and_abort(
                    entry,
                    data_updates={CONF_API_KEY: user_input[CONF_API_KEY]},
                )

        return self.async_show_form(
            step_id="reauth_confirm",
            data_schema=vol.Schema({vol.Required(CONF_API_KEY): str}),
            errors=errors,
        )
