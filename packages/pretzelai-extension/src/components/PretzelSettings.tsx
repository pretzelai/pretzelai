import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  Box,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Slider,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { PLUGIN_ID } from '../utils';

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

  const handleChange = useCallback(
    async (path: string, value: any) => {
      setSettings(prevSettings => {
        const updatedSettings = { ...prevSettings };
        const pathParts = path.split('.');
        let current = updatedSettings;
        for (let i = 0; i < pathParts.length - 1; i++) {
          current = current[pathParts[i]];
        }
        current[pathParts[pathParts.length - 1]] = value;
        return updatedSettings;
      });

      await settingRegistry.load(PLUGIN_ID).then(s => {
        s.set(path, value);
      });
    },
    [settingRegistry]
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        Loading settings...
      </Box>
    );
  }

  const commonTextFieldSx = {
    '& .MuiOutlinedInput-root': {
      backgroundColor: 'var(--jp-layout-color2)',
      '& fieldset': {
        borderColor: 'var(--jp-border-color1)'
      },
      '&:hover fieldset': {
        borderColor: 'var(--jp-border-color2)'
      },
      '&.Mui-focused fieldset': {
        borderColor: 'var(--jp-brand-color1)'
      }
    },
    '& .MuiInputLabel-root': {
      color: 'var(--jp-ui-font-color1)'
    },
    '& .MuiOutlinedInput-input': {
      color: 'var(--jp-ui-font-color1)'
    }
  };

  const commonSelectSx = {
    backgroundColor: 'var(--jp-layout-color2)',
    color: 'var(--jp-ui-font-color1)',
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: 'var(--jp-border-color1)'
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: 'var(--jp-border-color2)'
    },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
      borderColor: 'var(--jp-brand-color1)'
    }
  };

  return (
    <Box sx={{ p: 3, backgroundColor: 'var(--jp-layout-color1)', color: 'var(--jp-ui-font-color1)' }}>
      <Paper elevation={3} sx={{ p: 3, backgroundColor: 'var(--jp-layout-color0)' }}>
        <Typography variant="h4" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)', mb: 3 }}>
          Pretzel AI Settings
        </Typography>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={4}>
            <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>AI Service</InputLabel>
          </Grid>
          <Grid item xs={8}>
            <FormControl fullWidth>
              <Select
                value={settings.aiService}
                onChange={e => handleChange('aiService', e.target.value)}
                sx={commonSelectSx}
              >
                <MenuItem value="OpenAI API key">OpenAI API key</MenuItem>
                <MenuItem value="Use Pretzel AI Server">Use Pretzel AI Server</MenuItem>
                <MenuItem value="Use Azure API">Use Azure API</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {settings.aiService === 'OpenAI API key' && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>OpenAI API Key</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <TextField
                  fullWidth
                  type="password"
                  value={settings.openAiSettings.openAiApiKey}
                  onChange={e => handleChange('openAiSettings.openAiApiKey', e.target.value)}
                  sx={commonTextFieldSx}
                />
              </Grid>
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>OpenAI Base URL</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <TextField
                  fullWidth
                  value={settings.openAiSettings.openAiBaseUrl}
                  onChange={e => handleChange('openAiSettings.openAiBaseUrl', e.target.value)}
                  sx={commonTextFieldSx}
                />
              </Grid>
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>OpenAI Model</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <FormControl fullWidth>
                  <Select
                    value={settings.openAiSettings.openAiModel}
                    onChange={e => handleChange('openAiSettings.openAiModel', e.target.value)}
                    sx={commonSelectSx}
                  >
                    <MenuItem value="gpt-4o">GPT-4</MenuItem>
                    <MenuItem value="gpt-4-turbo">GPT-4 Turbo</MenuItem>
                    <MenuItem value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        )}

        {settings.aiService === 'Use Azure API' && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Azure Base URL</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <TextField
                  fullWidth
                  value={settings.azureSettings.azureBaseUrl}
                  onChange={e => handleChange('azureSettings.azureBaseUrl', e.target.value)}
                  sx={commonTextFieldSx}
                />
              </Grid>
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Azure Deployment Name</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <TextField
                  fullWidth
                  value={settings.azureSettings.azureDeploymentName}
                  onChange={e => handleChange('azureSettings.azureDeploymentName', e.target.value)}
                  sx={commonTextFieldSx}
                />
              </Grid>
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Azure API Key</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <TextField
                  fullWidth
                  type="password"
                  value={settings.azureSettings.azureApiKey}
                  onChange={e => handleChange('azureSettings.azureApiKey', e.target.value)}
                  sx={commonTextFieldSx}
                />
              </Grid>
            </Grid>
          </Box>
        )}

        <Divider sx={{ my: 4 }} />

        <Typography variant="h5" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)', mb: 2 }}>
          Inline AI Copilot Settings
        </Typography>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={10}>
            <Typography sx={{ color: 'var(--jp-ui-font-color1)' }}>Enable inline AI Copilot auto-complete</Typography>
          </Grid>
          <Grid item xs={2}>
            <Switch
              checked={settings.inlineCopilotSettings?.enabled}
              onChange={e => handleChange('inlineCopilotSettings.enabled', e.target.checked)}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: 'var(--jp-brand-color1)'
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: 'var(--jp-brand-color1)'
                }
              }}
            />
          </Grid>
        </Grid>

        {settings.inlineCopilotSettings.enabled && (
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>AI Model Provider</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <FormControl fullWidth>
                  <Select
                    value={settings.inlineCopilotSettings.provider}
                    onChange={e => handleChange('inlineCopilotSettings.provider', e.target.value)}
                    sx={commonSelectSx}
                  >
                    <MenuItem value="Pretzel AI">Pretzel AI</MenuItem>
                    <MenuItem value="Mistral">Mistral</MenuItem>
                    <MenuItem value="OpenAI">OpenAI</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>

            {settings.inlineCopilotSettings.provider === 'Mistral' && (
              <Grid container spacing={2} alignItems="center" sx={{ mt: 1 }}>
                <Grid item xs={4}>
                  <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Mistral API Key</InputLabel>
                </Grid>
                <Grid item xs={8}>
                  <TextField
                    fullWidth
                    type="password"
                    value={settings.inlineCopilotSettings.mistralApiKey}
                    onChange={e => handleChange('inlineCopilotSettings.mistralApiKey', e.target.value)}
                    sx={commonTextFieldSx}
                  />
                </Grid>
              </Grid>
            )}
          </Box>
        )}

        <Divider sx={{ my: 4 }} />

        <Typography variant="h5" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)', mb: 2 }}>
          Other Settings
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={4}>
            <Typography sx={{ color: 'var(--jp-ui-font-color1)' }}>Code Match Threshold</Typography>
          </Grid>
          <Grid item xs={8}>
            <Slider
              value={settings.codeMatchThreshold}
              onChange={(_, value) => handleChange('codeMatchThreshold', value)}
              valueLabelDisplay="auto"
              step={1}
              marks
              min={0}
              max={100}
              sx={{
                color: 'var(--jp-brand-color1)',
                '& .MuiSlider-thumb': {
                  backgroundColor: 'var(--jp-brand-color1)'
                },
                '& .MuiSlider-track': {
                  backgroundColor: 'var(--jp-brand-color1)'
                },
                '& .MuiSlider-rail': {
                  backgroundColor: 'var(--jp-layout-color3)'
                }
              }}
            />
          </Grid>
        </Grid>

        <Grid container spacing={2} alignItems="center" sx={{ mt: 2 }}>
          <Grid item xs={10}>
            <Typography sx={{ color: 'var(--jp-ui-font-color1)' }}>Enable Prompt Telemetry</Typography>
          </Grid>
          <Grid item xs={2}>
            <Switch
              checked={settings.posthogPromptTelemetry}
              onChange={e => handleChange('posthogPromptTelemetry', e.target.checked)}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': {
                  color: 'var(--jp-brand-color1)'
                },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                  backgroundColor: 'var(--jp-brand-color1)'
                }
              }}
            />
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};
