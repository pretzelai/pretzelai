# Copyright (c) Pretzel AI GmbH.
# This file is part of the Pretzel project and is licensed under the
# GNU Affero General Public License version 3.
# See the LICENSE_AGPLv3 file at the root of the project for the full license text.

import json
from functools import partial
from unittest.mock import patch

import httpx
import pytest
from tornado.httpclient import HTTPClientError

CHAT_STREAM = (
    b'{"message":{"role":"assistant","content":"Hel"},"done":false}\n'
    b'{"message":{"role":"assistant","content":"lo"},"done":false}\n'
    b'{"message":{"role":"assistant","content":""},"done":true}\n'
)


def fake_ollama(handler):
    """Patch the proxy's httpx client so requests go to `handler` instead of the network."""
    return patch(
        "jupyterlab.handlers.ollama_handler.httpx.AsyncClient",
        partial(httpx.AsyncClient, transport=httpx.MockTransport(handler)),
    )


def proxy_body(**kwargs):
    return json.dumps({"base_url": "https://ollama.com", "api_key": "test-key", **kwargs})


async def test_chat_is_forwarded_with_api_key_and_streamed_back(labserverapp, jp_fetch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(
            200, content=CHAT_STREAM, headers={"Content-Type": "application/x-ndjson"}
        )

    payload = {
        "model": "gemma4:31b",
        "messages": [{"role": "user", "content": "Hi"}],
        "stream": True,
    }
    with fake_ollama(handler):
        response = await jp_fetch(
            "lab", "api", "ollama", "chat", method="POST", body=proxy_body(payload=payload)
        )

    assert response.code == 200
    assert response.body == CHAT_STREAM
    assert response.headers["Content-Type"] == "application/x-ndjson"
    [request] = requests
    assert request.method == "POST"
    assert str(request.url) == "https://ollama.com/api/chat"
    assert request.headers["Authorization"] == "Bearer test-key"
    assert json.loads(request.content) == payload


async def test_tags_is_a_get_without_body(labserverapp, jp_fetch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"models": [{"name": "gemma4:31b"}]})

    with fake_ollama(handler):
        response = await jp_fetch("lab", "api", "ollama", "tags", method="POST", body=proxy_body())

    assert json.loads(response.body) == {"models": [{"name": "gemma4:31b"}]}
    [request] = requests
    assert request.method == "GET"
    assert str(request.url) == "https://ollama.com/api/tags"
    assert request.content == b""


async def test_upstream_errors_are_passed_through(labserverapp, jp_fetch):
    def handler(request):
        return httpx.Response(401, json={"error": "unauthorized"})

    with fake_ollama(handler), pytest.raises(HTTPClientError) as e:
        await jp_fetch("lab", "api", "ollama", "me", method="POST", body=proxy_body())

    assert e.value.code == 401
    assert json.loads(e.value.response.body) == {"error": "unauthorized"}


async def test_unreachable_server_returns_502(labserverapp, jp_fetch):
    def handler(request):
        raise httpx.ConnectError("connection refused")

    with fake_ollama(handler), pytest.raises(HTTPClientError) as e:
        await jp_fetch("lab", "api", "ollama", "tags", method="POST", body=proxy_body())

    assert e.value.code == 502
    assert "Could not reach Ollama" in json.loads(e.value.response.body)["error"]


async def test_non_http_base_url_is_rejected(labserverapp, jp_fetch):
    with pytest.raises(HTTPClientError) as e:
        await jp_fetch(
            "lab",
            "api",
            "ollama",
            "tags",
            method="POST",
            body=json.dumps({"base_url": "file:///etc"}),
        )

    assert e.value.code == 400


async def test_unknown_endpoint_is_not_proxied(labserverapp, jp_fetch):
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={})

    with fake_ollama(handler), pytest.raises(HTTPClientError):
        await jp_fetch("lab", "api", "ollama", "pull", method="POST", body=proxy_body())

    assert requests == []
