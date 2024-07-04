import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { PartialJSONValue } from '@lumino/coreutils';

import {
  Box,
  Button,
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
import { debounce } from 'lodash';

interface IPretzelSettingsProps {
  settingRegistry: ISettingRegistry;
}

export const PretzelSettings: React.FC<IPretzelSettingsProps> = ({ settingRegistry }) => {
  const [settings, setSettings] = useState<any>({});
  const [tempSettings, setTempSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [dynamicValidationErrors, setDynamicValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadSettings = async () => {
      const loadedSettings = await settingRegistry.load(PLUGIN_ID);
      setSettings(loadedSettings.composite);
      setTempSettings(loadedSettings.composite);
      setLoading(false);
    };
    loadSettings();
  }, [settingRegistry]);

  const validateOpenAIApiKey = useCallback(
    async (apiKey: string) => {
      if (!apiKey) {
        return 'API key required';
      }
      const baseUrl = tempSettings.openAiSettings?.openAiBaseUrl || 'https://api.openai.com/v1';
      try {
        const response = await fetch(`${baseUrl}/models`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          return 'Invalid OpenAI API Key';
        }
      } catch (error) {
        return 'Invalid OpenAI API Key';
      }
      return '';
    },
    [tempSettings.openAiSettings?.openAiBaseUrl]
  );

  const debouncedValidateOpenAIApiKey = useCallback(
    debounce(async (apiKey: string) => {
      const error = await validateOpenAIApiKey(apiKey);
      setDynamicValidationErrors(prev => ({ ...prev, 'openAiSettings.openAiApiKey': error }));
    }, 300),
    [validateOpenAIApiKey]
  );

  useEffect(() => {
    if (tempSettings.aiService === 'OpenAI API key' && tempSettings.openAiSettings?.openAiApiKey !== undefined) {
      debouncedValidateOpenAIApiKey(tempSettings.openAiSettings.openAiApiKey);
    }
  }, [tempSettings.aiService, tempSettings.openAiSettings?.openAiApiKey, debouncedValidateOpenAIApiKey]);

  const validateSettings = async (): Promise<boolean> => {
    const errors: Record<string, string> = {};

    if (tempSettings.aiService === 'OpenAI API key') {
      const openAIError = await validateOpenAIApiKey(tempSettings.openAiSettings?.openAiApiKey);
      if (openAIError) {
        errors['openAiSettings.openAiApiKey'] = openAIError;
      }
    }

    if (tempSettings.inlineCopilotSettings?.enabled && tempSettings.inlineCopilotSettings.provider === 'Mistral') {
      const mistralApiKey = tempSettings.inlineCopilotSettings?.mistralApiKey;
      if (!mistralApiKey) {
        errors['inlineCopilotSettings.mistralApiKey'] = 'Mistral API Key is required';
      } else {
        try {
          const response = await fetch('https://api.mistral.ai/v1/models', {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${mistralApiKey}`,
              'Content-Type': 'application/json'
            }
          });

          if (!response.ok) {
            errors['inlineCopilotSettings.mistralApiKey'] = 'Invalid Mistral API Key';
          }
        } catch (error) {
          errors['inlineCopilotSettings.mistralApiKey'] = 'Error validating Mistral API Key';
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    const isValid = await validateSettings();
    if (isValid) {
      try {
        const plugin = await settingRegistry.load(PLUGIN_ID);
        // Save each setting individually
        for (const [key, value] of Object.entries(tempSettings)) {
          await plugin.set(key, value as PartialJSONValue);
        }
        setSettings(tempSettings);
      } catch (error) {
        console.error('Error saving settings:', error);
        // Handle the error (e.g., show an error message to the user)
      }
    }
  };

  const handleChange = useCallback((path: string, value: any) => {
    setTempSettings(prevSettings => {
      const updatedSettings = { ...prevSettings };
      const pathParts = path.split('.');
      let current = updatedSettings;
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (!current[pathParts[i]]) {
          current[pathParts[i]] = {};
        }
        current = current[pathParts[i]];
      }
      current[pathParts[pathParts.length - 1]] = value;
      return updatedSettings;
    });

    // Clear dynamic validation errors when the value changes
    setDynamicValidationErrors(prev => ({ ...prev, [path]: '' }));
  }, []);

  const handleRestoreDefaults = async () => {
    const plugin = await settingRegistry.load(PLUGIN_ID);
    await plugin.remove('');
    const defaultSettings = plugin.composite;
    setSettings(defaultSettings);
    setTempSettings(defaultSettings);
    await plugin.set('', defaultSettings as PartialJSONValue);
  };

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

  const renderTextField = (label: string, path: string, type: string = 'text') => {
    const value = path.split('.').reduce((obj, key) => obj && obj[key], tempSettings) || '';
    return (
      <TextField
        fullWidth
        label={label}
        type={type}
        value={value}
        onChange={e => handleChange(path, e.target.value)}
        sx={{
          ...commonTextFieldSx,
          '& .MuiOutlinedInput-root': {
            ...commonTextFieldSx['& .MuiOutlinedInput-root'],
            '& fieldset': {
              borderColor: validationErrors[path] || dynamicValidationErrors[path] ? 'red' : 'var(--jp-border-color1)'
            }
          }
        }}
        error={!!(validationErrors[path] || dynamicValidationErrors[path])}
        helperText={validationErrors[path] || dynamicValidationErrors[path] || ''}
      />
    );
  };

  const renderProviderSettings = (provider: string, prefix: string) => {
    switch (provider) {
      case 'OpenAI API key':
        return (
          <>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>OpenAI API Key</InputLabel>
            </Grid>
            <Grid item xs={8}>
              {renderTextField('OpenAI API Key', `${prefix}.openAiSettings.openAiApiKey`)}
            </Grid>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>OpenAI Base URL</InputLabel>
            </Grid>
            <Grid item xs={8}>
              {renderTextField('OpenAI Base URL', `${prefix}.openAiSettings.openAiBaseUrl`)}
            </Grid>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>OpenAI Model</InputLabel>
            </Grid>
            <Grid item xs={8}>
              <FormControl fullWidth>
                <Select
                  value={tempSettings[prefix]?.openAiSettings?.openAiModel || ''}
                  onChange={e => handleChange(`${prefix}.openAiSettings.openAiModel`, e.target.value)}
                  sx={commonSelectSx}
                >
                  <MenuItem value="gpt-4">GPT-4</MenuItem>
                  <MenuItem value="gpt-4-turbo">GPT-4 Turbo</MenuItem>
                  <MenuItem value="gpt-3.5-turbo">GPT-3.5 Turbo</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </>
        );
      case 'Use Azure API':
        return (
          <>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Azure Base URL</InputLabel>
            </Grid>
            <Grid item xs={8}>
              {renderTextField('Azure Base URL', `${prefix}.azureSettings.azureBaseUrl`)}
            </Grid>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Azure Deployment Name</InputLabel>
            </Grid>
            <Grid item xs={8}>
              {renderTextField('Azure Deployment Name', `${prefix}.azureSettings.azureDeploymentName`)}
            </Grid>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Azure API Key</InputLabel>
            </Grid>
            <Grid item xs={8}>
              {renderTextField('Azure API Key', `${prefix}.azureSettings.azureApiKey`, 'password')}
            </Grid>
          </>
        );
      case 'Mistral':
        return (
          <>
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Mistral API Key</InputLabel>
            </Grid>
            <Grid item xs={8}>
              {renderTextField('Mistral API Key', `${prefix}.mistralSettings.mistralApiKey`, 'password')}
            </Grid>
          </>
        );
      default:
        return null;
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
                value={tempSettings.aiService}
                onChange={e => handleChange('aiService', e.target.value)}
                sx={commonSelectSx}
              >
                <MenuItem value="OpenAI API key">OpenAI API key</MenuItem>
                <MenuItem value="Use Pretzel AI Server">Use Pretzel AI Server</MenuItem>
                <MenuItem value="Use Azure API">Use Azure API</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {renderProviderSettings(tempSettings.aiService, '')}
        </Grid>

        <Box sx={{ mt: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)' }}>
            Inline Copilot Settings
          </Typography>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={4}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Enable Inline Copilot</InputLabel>
            </Grid>
            <Grid item xs={8}>
              <Switch
                checked={tempSettings.inlineCopilotSettings?.enabled || false}
                onChange={e => handleChange('inlineCopilotSettings.enabled', e.target.checked)}
              />
            </Grid>
          </Grid>

          {tempSettings.inlineCopilotSettings?.enabled && (
            <>
              <Grid container spacing={2} alignItems="center" sx={{ mt: 1 }}>
                <Grid item xs={4}>
                  <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Inline Copilot Provider</InputLabel>
                </Grid>
                <Grid item xs={8}>
                  <FormControl fullWidth>
                    <Select
                      value={tempSettings.inlineCopilotSettings.provider}
                      onChange={e => handleChange('inlineCopilotSettings.provider', e.target.value)}
                      sx={commonSelectSx}
                    >
                      <MenuItem value="Pretzel AI">Pretzel AI Server</MenuItem>
                      <MenuItem value="OpenAI API key">OpenAI</MenuItem>
                      <MenuItem value="Mistral">Mistral</MenuItem>
                      <MenuItem value="Use Azure API">Use Azure API</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {tempSettings.inlineCopilotSettings.provider !== tempSettings.aiService &&
                  renderProviderSettings(tempSettings.inlineCopilotSettings.provider, 'inlineCopilotSettings')}
              </Grid>
            </>
          )}
        </Box>

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
          <Grid item xs={4}>
            <Typography sx={{ color: 'var(--jp-ui-font-color1)' }}>Enable Prompt Telemetry</Typography>
          </Grid>
          <Grid item xs={8}>
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

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Button variant="contained" onClick={handleSave} sx={{ backgroundColor: 'var(--jp-brand-color1)' }}>
            Save Changes
          </Button>
          <Button variant="outlined" onClick={handleRestoreDefaults} sx={{ color: 'var(--jp-warn-color0)' }}>
            Restore Defaults
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};
