/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

export const globalState: {
  availableVariables: string[];
  isMonacoRegistered: boolean;
  // The chat that was open when the chat panel was last rebuilt (saving settings rebuilds it), to carry on with it
  openChat: { messages: any[]; chatIndex: number; draft: string; focusInput?: boolean } | null;
} = {
  availableVariables: [],
  isMonacoRegistered: false,
  openChat: null
};
