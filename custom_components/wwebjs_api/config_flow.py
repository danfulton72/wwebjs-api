"""Config flow for WWebJS API."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.const import CONF_URL
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .api import WWebJSApiClient, WWebJSApiError
from .const import CONF_API_KEY, DEFAULT_NAME, DOMAIN


STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_URL, default="http://localhost:3000"): str,
        vol.Required(CONF_API_KEY): str,
    }
)


class WWebJSApiConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for WWebJS API."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            url = user_input[CONF_URL].rstrip("/")
            client = WWebJSApiClient(
                async_get_clientsession(self.hass),
                url,
                user_input[CONF_API_KEY],
            )
            try:
                await client.async_get_sessions()
            except WWebJSApiError as err:
                errors["base"] = (
                    "invalid_auth" if str(err) == "invalid_auth" else "cannot_connect"
                )
            else:
                await self.async_set_unique_id(url.lower())
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title=DEFAULT_NAME,
                    data={CONF_URL: url, CONF_API_KEY: user_input[CONF_API_KEY]},
                )

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )
