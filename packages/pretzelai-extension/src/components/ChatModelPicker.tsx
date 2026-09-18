/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Divider, ListSubheader, Menu, MenuItem } from '@mui/material';
import React, { useState } from 'react';
import { getDefaultSettings } from '../migrations/defaultSettings';
import { providersInfo } from '../migrations/providerInfo';

interface IChatModelGroup {
  provider: string;
  displayName: string;
  models: { model: string; displayName: string }[];
}

// Chat models that are ready to use: the ones Pretzel Settings offers for AI Chat (enabled providers, models that
// can chat), leaving out providers that still need an API key
export const getChatModelGroups = (settings: ReturnType<typeof getDefaultSettings> | null): IChatModelGroup[] => {
  const groups: IChatModelGroup[] = [];
  for (const [provider, info] of Object.entries(providersInfo)) {
    const providerSettings: any = settings?.providers[provider];
    if (!providerSettings?.enabled) {
      continue;
    }
    const needsApiKey = provider !== 'Pretzel AI' && provider !== 'Ollama';
    if (needsApiKey && !providerSettings.apiSettings?.apiKey?.value) {
      continue;
    }
    // Ollama's models are the ones found on the Ollama server, kept in the settings
    const modelNames = provider === 'Ollama' ? Object.keys(providerSettings.models ?? {}) : Object.keys(info.models);
    const models = modelNames
      .filter(model => providerSettings.models?.[model]?.enabled)
      .filter(model => provider === 'Ollama' || info.models[model].canBeUsedForChat)
      .map(model => ({ model, displayName: info.models[model]?.displayName ?? model }));
    if (models.length) {
      groups.push({ provider, displayName: info.displayName, models });
    }
  }
  return groups;
};

interface IChatModelPickerProps {
  settings: ReturnType<typeof getDefaultSettings> | null;
  provider: string;
  model: string;
  onChange: (provider: string, model: string) => void;
  onOpenSettings: () => void;
  onClosed: () => void;
}

// Button in the chat that shows the chat model and switches it
export function ChatModelPicker({
  settings,
  provider,
  model,
  onChange,
  onOpenSettings,
  onClosed
}: IChatModelPickerProps): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const groups = getChatModelGroups(settings);
  // "Pretzel's Free AI Server (recommended)" -> "Pretzel's Free AI Server"
  const name = (providersInfo[provider]?.models[model]?.displayName ?? model).replace(/\s*\(.*\)$/, '');
  const itemSx = {
    color: 'var(--jp-ui-font-color1)',
    '&:hover': { backgroundColor: 'var(--jp-layout-color2)' }
  };
  const subheaderStyle = { backgroundColor: 'var(--jp-layout-color1)', color: 'var(--jp-ui-font-color2)' };

  return (
    <>
      <button
        className="chat-model-button"
        onClick={e => setAnchor(e.currentTarget)}
        title={`Chat model: ${name}. Click to switch.`}
        aria-label="Chat model"
      >
        <span className="chat-model-name">{name}</span>
        <ExpandLessIcon />
      </button>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        // Back to typing once the menu is gone
        disableRestoreFocus
        TransitionProps={{ onExited: onClosed }}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        PaperProps={{
          className: 'chat-model-menu',
          sx: {
            minWidth: 240,
            maxWidth: 320,
            maxHeight: 420,
            backgroundColor: 'var(--jp-layout-color1)',
            color: 'var(--jp-ui-font-color1)',
            border: '1px solid var(--jp-border-color1)'
          }
        }}
        MenuListProps={{ dense: true }}
      >
        {groups.flatMap(group => [
          <ListSubheader key={group.provider} style={subheaderStyle}>
            {group.displayName}
          </ListSubheader>,
          ...group.models.map(option => (
            <MenuItem
              key={`${group.provider}:${option.model}`}
              selected={group.provider === provider && option.model === model}
              onClick={() => {
                setAnchor(null);
                if (group.provider !== provider || option.model !== model) {
                  onChange(group.provider, option.model);
                }
              }}
              sx={itemSx}
            >
              {option.displayName}
            </MenuItem>
          ))
        ])}
        {groups.length > 0 && <Divider />}
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onOpenSettings();
          }}
          sx={{ ...itemSx, fontSize: '0.8rem', opacity: 0.85 }}
        >
          Add or set up models in Pretzel AI Settings…
        </MenuItem>
      </Menu>
    </>
  );
}
