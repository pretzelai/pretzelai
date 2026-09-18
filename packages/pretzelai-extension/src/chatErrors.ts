/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import { providersInfo } from './migrations/providerInfo';

// Error for a failed HTTP response, keeping its status so the chat can explain what went wrong
export const httpError = async (response: Response): Promise<Error & { status: number }> =>
  Object.assign(new Error(`${response.status} ${(await response.text().catch(() => '')) || response.statusText}`), {
    status: response.status
  });

const getStatus = (error: any, message: string): number | undefined => {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  if (typeof status === 'number') {
    return status;
  }
  // SDKs put the status in the message: "401 Incorrect API key", "HTTP error! status: 429"
  const match = /^(\d{3})\b|status(?: code)?:?\s*(\d{3})\b/i.exec(message);
  return match ? Number(match[1] ?? match[2]) : undefined;
};

// Plain-language reason a chat request failed, and what the user can do about it
export const describeChatError = (error: any, provider: string, model: string): string => {
  const name = providersInfo[provider]?.displayName ?? provider;
  const message = String(error?.error?.message ?? error?.message ?? error ?? '').trim();
  const status = getStatus(error, message);

  if (status === 401 || status === 403) {
    return `${name} didn't accept the API key. Check it in Pretzel AI Settings, or pick another model below.`;
  }
  if (status === 404) {
    return `${name} couldn't find the model "${model}", or your account can't use it. Pick another model below.`;
  }
  if (status === 429) {
    return `${name} is limiting requests right now (too many requests, or the quota is used up). Wait a bit, or pick another model below.`;
  }
  if (status && status >= 500) {
    return `${name} had a problem on its side (error ${status}). Try again in a moment, or pick another model below.`;
  }
  if (
    error?.name === 'APIConnectionError' ||
    /failed to fetch|networkerror|network error|connection error|load failed/i.test(message)
  ) {
    return `Couldn't reach ${name}. Check your internet connection and try again, or pick another model below.`;
  }
  const details = message.split('\n')[0].slice(0, 200);
  return `${name} couldn't answer${details ? `: ${details}` : '.'}`;
};
