import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { Box, FormControl, InputLabel, MenuItem, Select, Slider, Switch, TextField, Typography } from '@mui/material';
import React, { useEffect, useState } from 'react';
import { PLUGIN_ID } from '../utils';
import '@jupyterlab/application/style/index.css';

interface IPretzelSettingsProps {
  settingRegistry: ISettingRegistry;
}

export const PretzelSettings: React.FC<IPretzelSettingsProps> = ({ settingRegistry }) => {
  const [settings, setSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      const loadedSettings = await settingRegistry.load(PLUGIN_ID);
      setSettings(loadedSettings.composite);
      setLoading(false);
    };
    loadSettings();
  }, [settingRegistry]);

  const handleChange = async (path: string, value: any) => {
    const updatedSettings = { ...settings };
    const pathParts = path.split('.');
    let current = updatedSettings;
    for (let i = 0; i < pathParts.length - 1; i++) {
      current = current[pathParts[i]];
    }
    current[pathParts[pathParts.length - 1]] = value;
    setSettings(updatedSettings);

    await settingRegistry.load(PLUGIN_ID).then(s => {
      s.set(path, value);
    });
  };

  if (loading) {
    return <div>Loading settings...</div>;
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Pretzel AI Settings
      </Typography>

      <FormControl fullWidth margin="normal">
        <InputLabel>AI Service</InputLabel>
        <Select value={settings.aiService} onChange={e => handleChange('aiService', e.target.value)}>
          <MenuItem value="OpenAI API key">OpenAI API key</MenuItem>
          <MenuItem value="Use Pretzel AI Server">Use Pretzel AI Server</MenuItem>
          <MenuItem value="Use Azure API">Use Azure API</MenuItem>
        </Select>
      </FormControl>

      {settings.aiService === 'OpenAI API key' && (
        <Box>
          <TextField
            fullWidth
            margin="normal"
            label="OpenAI API Key"
            type="password"
            value={settings.openAiSettings.openAiApiKey}
            onChange={e => handleChange('openAiSettings.openAiApiKey', e.target.value)}
          />
          <TextField
            fullWidth
            margin="normal"
            label="OpenAI Base URL"
            value={settings.openAiSettings.openAiBaseUrl}
            onChange={e => handleChange('openAiSettings.openAiBaseUrl', e.target.value)}
          />
          <FormControl fullWidth margin="normal">
            <InputLabel>OpenAI Model</InputLabel>
            <Select
              value={settings.openAiSettings.openAiModel}
              onChange={e => handleChange('openAiSettings.openAiModel', e.target.value)}
            >
              <MenuItem value="gpt-4o">GPT-4</MenuItem>
              <MenuItem value="gpt-4-turbo">GPT-4 Turbo</MenuItem>
              <MenuItem value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>
            </Select>
          </FormControl>
        </Box>
      )}

      {settings.aiService === 'Use Azure API' && (
        <Box>
          <TextField
            fullWidth
            margin="normal"
            label="Azure Base URL"
            value={settings.azureSettings.azureBaseUrl}
            onChange={e => handleChange('azureSettings.azureBaseUrl', e.target.value)}
          />
          <TextField
            fullWidth
            margin="normal"
            label="Azure Deployment Name"
            value={settings.azureSettings.azureDeploymentName}
            onChange={e => handleChange('azureSettings.azureDeploymentName', e.target.value)}
          />
          <TextField
            fullWidth
            margin="normal"
            label="Azure API Key"
            type="password"
            value={settings.azureSettings.azureApiKey}
            onChange={e => handleChange('azureSettings.azureApiKey', e.target.value)}
          />
        </Box>
      )}

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Inline AI Copilot Settings
      </Typography>
      <FormControl fullWidth margin="normal">
        <Typography component="div">
          Enable inline AI Copilot auto-complete
          <Switch
            checked={settings.inlineCopilotSettings.enabled}
            onChange={e => handleChange('inlineCopilotSettings.enabled', e.target.checked)}
          />
        </Typography>
      </FormControl>

      {settings.inlineCopilotSettings.enabled && (
        <Box>
          <FormControl fullWidth margin="normal">
            <InputLabel>AI Model Provider</InputLabel>
            <Select
              value={settings.inlineCopilotSettings.provider}
              onChange={e => handleChange('inlineCopilotSettings.provider', e.target.value)}
            >
              <MenuItem value="Pretzel AI">Pretzel AI</MenuItem>
              <MenuItem value="Mistral">Mistral</MenuItem>
              <MenuItem value="OpenAI">OpenAI</MenuItem>
            </Select>
          </FormControl>

          {settings.inlineCopilotSettings.provider === 'Mistral' && (
            <TextField
              fullWidth
              margin="normal"
              label="Mistral API Key"
              type="password"
              value={settings.inlineCopilotSettings.mistralApiKey}
              onChange={e => handleChange('inlineCopilotSettings.mistralApiKey', e.target.value)}
            />
          )}
        </Box>
      )}

      <Typography variant="h5" gutterBottom sx={{ mt: 4 }}>
        Other Settings
      </Typography>
      <Box sx={{ width: 300 }}>
        <Typography gutterBottom>Code Match Threshold</Typography>
        <Slider
          value={settings.codeMatchThreshold}
          onChange={(_, value) => handleChange('codeMatchThreshold', value)}
          valueLabelDisplay="auto"
          step={1}
          marks
          min={0}
          max={100}
        />
      </Box>

      <FormControl fullWidth margin="normal">
        <Typography component="div">
          Enable Prompt Telemetry
          <Switch
            checked={settings.posthogPromptTelemetry}
            onChange={e => handleChange('posthogPromptTelemetry', e.target.checked)}
          />
        </Typography>
      </FormControl>
    </Box>
  );
};
