"""Ollama proxy handler for Pretzel AI."""

# Copyright (c) Pretzel AI GmbH.
# This file is part of the Pretzel project and is licensed under the
# GNU Affero General Public License version 3.
# See the LICENSE_AGPLv3 file at the root of the project for the full license text.

from urllib.parse import urlparse

import httpx
from jupyter_server.base.handlers import APIHandler
from tornado import web
from tornado.iostream import StreamClosedError

# Ollama endpoints the frontend may reach through the proxy, with their upstream HTTP method
OLLAMA_ENDPOINTS = {"tags": "GET", "chat": "POST", "me": "POST"}

# Generous read timeout: large cloud models can take a while before the first token
OLLAMA_TIMEOUT = httpx.Timeout(10.0, read=300.0)


class OllamaProxyHandler(APIHandler):
    """Forward requests to a remote Ollama server such as Ollama Cloud (https://ollama.com).

    Ollama Cloud doesn't send CORS headers, so the browser can't call it directly. The
    frontend posts ``{"base_url", "api_key", "payload"}`` here; the request is forwarded
    with the API key as a Bearer token and the response (including the newline-delimited
    JSON stream from ``/api/chat``) is relayed back as it arrives.
    """

    @web.authenticated
    async def post(self, endpoint: str) -> None:
        body = self.get_json_body() or {}
        base_url = (body.get("base_url") or "").rstrip("/")
        if urlparse(base_url).scheme not in ("http", "https"):
            raise web.HTTPError(400, "Ollama base URL must start with http:// or https://")

        headers = {"Content-Type": "application/json"}
        api_key = body.get("api_key")
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        method = OLLAMA_ENDPOINTS[endpoint]
        payload = body.get("payload") if method == "POST" else None

        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client, client.stream(
                method, f"{base_url}/api/{endpoint}", headers=headers, json=payload
            ) as response:
                self.set_status(response.status_code)
                self.set_header(
                    "Content-Type", response.headers.get("Content-Type", "application/json")
                )
                async for chunk in response.aiter_bytes():
                    self.write(chunk)
                    await self.flush()
        except StreamClosedError:
            # The browser went away (e.g. the user stopped generation); drop the upstream request
            return
        except httpx.HTTPError as e:
            self.log.warning(f"Ollama proxy request to {base_url} failed: {e}")
            if self._headers_written:
                return
            self.clear()
            self.set_status(502)
            self.finish({"error": f"Could not reach Ollama at {base_url}: {e}"})
            return

        self.finish()


# The Ollama API endpoints are named in the path, e.g. /lab/api/ollama/chat
ollama_proxy_handler_path = rf"/lab/api/ollama/({'|'.join(OLLAMA_ENDPOINTS)})"
