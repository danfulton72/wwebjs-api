"""Constants for the WhatsApp HA integration."""

from datetime import timedelta

DOMAIN = "whatsapp"
CONF_API_KEY = "api_key"
DEFAULT_NAME = "WhatsApp HA"
DEFAULT_SCAN_INTERVAL = timedelta(seconds=30)
MANUFACTURER = "WhatsApp HA"
MODEL_API = "WWebJS REST API"
MODEL_SESSION = "WhatsApp Web session"

NOTIFY_DOMAIN = "notify"
SERVICE_NOTIFY_SEND_MESSAGE = "whatsapp_send_message"
SERVICE_SEARCH_CONTACTS = "search_contacts"
SERVICE_SESSION_START = "session_start"
SERVICE_SESSION_END = "session_end"

ATTR_SESSION_ID = "session_id"
ATTR_PATTERN = "pattern"
ATTR_MEDIA_URL = "media_url"
