/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';

export type OllamaMode = 'local' | 'cloud';

export const OLLAMA_LOCAL_DEFAULT_URL = 'http://localhost:11434';
export const OLLAMA_CLOUD_DEFAULT_URL = 'https://ollama.com';

export interface IOllamaConnection {
  mode: OllamaMode;
  baseUrl: string;
  apiKey: string;
}

/**
 * Get the connection details for the selected Ollama mode from the Ollama provider settings.
 */
export function getOllamaConnection(ollamaProvider: any): IOllamaConnection {
  const apiSettings = ollamaProvider?.apiSettings || {};
  const mode: OllamaMode = apiSettings.mode?.value === 'cloud' ? 'cloud' : 'local';
  const baseUrl =
    mode === 'cloud'
      ? apiSettings.cloudBaseUrl?.value || OLLAMA_CLOUD_DEFAULT_URL
      : apiSettings.baseUrl?.value || OLLAMA_LOCAL_DEFAULT_URL;
  return {
    mode,
    baseUrl: baseUrl.trim().replace(/\/+$/, ''),
    apiKey: mode === 'cloud' ? apiSettings.apiKey?.value || '' : ''
  };
}

/**
 * Call an Ollama API endpoint. Requests with a payload are POSTed.
 *
 * Local Ollama accepts browser requests from localhost, so it's called directly. Ollama Cloud doesn't
 * send CORS headers, so cloud requests go through Pretzel's server proxy, which adds the API key
 * (see jupyterlab/handlers/ollama_handler.py).
 */
export async function ollamaFetch(
  connection: IOllamaConnection,
  endpoint: 'tags' | 'chat' | 'me',
  payload?: object,
  signal?: AbortSignal
): Promise<Response> {
  if (connection.mode === 'local') {
    return fetch(
      `${connection.baseUrl}/api/${endpoint}`,
      payload
        ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal }
        : { signal }
    );
  }
  const settings = ServerConnection.makeSettings();
  return ServerConnection.makeRequest(
    URLExt.join(settings.baseUrl, 'lab/api/ollama', endpoint),
    {
      method: 'POST',
      // eslint-disable-next-line camelcase
      body: JSON.stringify({ base_url: connection.baseUrl, api_key: connection.apiKey, payload }),
      signal
    },
    settings
  ).catch(error => {
    // makeRequest wraps every fetch failure in a NetworkError; keep aborts recognizable as in local mode
    if (signal?.aborted) {
      throw new DOMException('The request was aborted', 'AbortError');
    }
    throw error;
  });
}

/**
 * Turn a failed Ollama response into a readable error message.
 */
export async function getOllamaErrorMessage(response: Response): Promise<string> {
  if (response.status === 401) {
    return 'Ollama rejected the API key. Please check your Ollama API key in Pretzel AI Settings.';
  }
  const text = await response.text();
  let detail = text;
  try {
    const data = JSON.parse(text);
    detail = data.error || data.message || text;
  } catch {
    // not JSON, use the raw text
  }
  return `Ollama returned an error (${response.status})${detail ? `: ${detail}` : ''}`;
}

/**
 * Start an Ollama chat and stream the reply text. `options` are Ollama model options such as
 * `stop` and `num_predict` (max tokens).
 *
 * Throws (before streaming starts) if Ollama can't be reached or rejects the request.
 */
export async function streamOllamaChat(
  connection: IOllamaConnection,
  model: string,
  messages: any[],
  signal?: AbortSignal,
  options?: Record<string, any>
): Promise<AsyncIterable<string>> {
  const response = await ollamaFetch(connection, 'chat', { model, messages, stream: true, options }, signal);
  if (!response.ok) {
    throw new Error(await getOllamaErrorMessage(response));
  }
  return readOllamaChatStream(response.body!);
}

// Ollama streams one JSON object per line. A line can be split across network chunks,
// so partial lines are kept in the buffer until the rest arrives.
async function* readOllamaChatStream(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let done = false;
  while (!done) {
    const result = await reader.read();
    done = result.done;
    buffer += decoder.decode(result.value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = done ? '' : lines.pop()!;
    for (const line of lines) {
      if (line.trim() === '') {
        continue;
      }
      const data = JSON.parse(line);
      if (data.error) {
        throw new Error(`Ollama error: ${data.error}`);
      }
      yield data.message?.content || '';
    }
  }
}
