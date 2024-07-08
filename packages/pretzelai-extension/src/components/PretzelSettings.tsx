import { ISettingRegistry } from '@jupyterlab/settingregistry';
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
  const [tempSettings, setTempSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadSettings = async () => {
      const loadedSettings = await settingRegistry.load(PLUGIN_ID);
      const pretzelSettingsJSON = loadedSettings.get('pretzelSettingsJSON').composite as any;
      setSettings(pretzelSettingsJSON);
      setTempSettings(pretzelSettingsJSON);
      setLoading(false);
    };
    loadSettings();
  }, [settingRegistry]);

  const getAvailableModels = () => {
    const models: string[] = [];
    Object.entries(tempSettings.providers).forEach(([providerName, provider]: [string, any]) => {
      Object.entries(provider.models).forEach(([modelName, model]: [string, any]) => {
        if (model.enabled) {
          models.push(`${providerName}: ${modelName}`);
        }
      });
    });
    return models;
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
  }, []);

  const handleSave = async () => {
    const isValid = await validateSettings();
    if (isValid) {
      try {
        const plugin = await settingRegistry.load(PLUGIN_ID);
        await plugin.set('pretzelSettingsJSON', tempSettings);
        setSettings(tempSettings);
        setValidationErrors({});

        // Update available models for AI Chat and Inline Copilot
        const availableModels = getAvailableModels();
        if (
          !availableModels.includes(
            `${tempSettings.features.aiChat.modelProvider}: ${tempSettings.features.aiChat.modelString}`
          )
        ) {
          handleChange('features.aiChat.modelProvider', availableModels[0].split(': ')[0]);
          handleChange('features.aiChat.modelString', availableModels[0].split(': ')[1]);
        }
        if (
          !availableModels.includes(
            `${tempSettings.features.inlineCompletion.modelProvider}: ${tempSettings.features.inlineCompletion.modelString}`
          )
        ) {
          handleChange('features.inlineCompletion.modelProvider', availableModels[0].split(': ')[0]);
          handleChange('features.inlineCompletion.modelString', availableModels[0].split(': ')[1]);
        }
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }
  };

  const validateSettings = async (): Promise<boolean> => {
    const errors: Record<string, string> = {};

    // Validate OpenAI API Key
    const openAIProvider = tempSettings.providers.OpenAI;
    if (openAIProvider?.apiSettings?.apiKey?.value) {
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${openAIProvider.apiSettings.apiKey.value}`
          }
        });
        if (!response.ok) {
          errors['providers.OpenAI.apiSettings.apiKey'] = 'Invalid OpenAI API Key';
        }
      } catch (error) {
        errors['providers.OpenAI.apiSettings.apiKey'] = 'Error validating OpenAI API Key';
      }
    }

    // Validate Azure API Key and Base URL
    const azureProvider = tempSettings.providers.Azure;
    if (azureProvider?.apiSettings?.apiKey?.value && azureProvider?.apiSettings?.baseUrl?.value) {
      if (azureProvider.apiSettings.apiKey.value.length < 32) {
        errors['providers.Azure.apiSettings.apiKey'] = 'Invalid Azure API Key';
      }
      if (!azureProvider.apiSettings.baseUrl.value.startsWith('https://')) {
        errors['providers.Azure.apiSettings.baseUrl'] = 'Invalid Azure Base URL';
      }
    }

    // Validate Mistral API Key
    const mistralProvider = tempSettings.providers.Mistral;
    if (mistralProvider?.apiSettings?.apiKey?.value) {
      if (mistralProvider.apiSettings.apiKey.value.length < 32) {
        errors['providers.Mistral.apiSettings.apiKey'] = 'Invalid Mistral API Key';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const renderProviderSettings = (providerName: string) => {
    const provider = tempSettings.providers[providerName];
    if (!provider) return null;

    return (
      <Box sx={{ mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={6}>
            <Typography
              variant="h6"
              gutterBottom
              sx={{ color: 'var(--jp-ui-font-color0)', display: 'flex', alignItems: 'center' }}
            >
              {providerName}
              <Switch
                checked={provider.enabled}
                onChange={e => handleChange(`providers.${providerName}.enabled`, e.target.checked)}
                sx={{ marginLeft: 2 }}
              />
            </Typography>
          </Grid>
          {provider.enabled && provider.showSettings && (
            <Grid container item xs={12} spacing={2}>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="API Key"
                  variant="outlined"
                  value={provider.apiSettings.apiKey.value}
                  onChange={e => handleChange(`providers.${providerName}.apiSettings.apiKey.value`, e.target.value)}
                  margin="normal"
                />
              </Grid>
              {provider.apiSettings.baseUrl && (
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    label="Base URL"
                    variant="outlined"
                    value={provider.apiSettings.baseUrl.value}
                    onChange={e => handleChange(`providers.${providerName}.apiSettings.baseUrl.value`, e.target.value)}
                    margin="normal"
                  />
                </Grid>
              )}
            </Grid>
          )}
        </Grid>
      </Box>
    );
  };

  if (loading) {
    return <div>Loading settings...</div>;
  }

  return (
    <Paper elevation={3} sx={{ p: 3, backgroundColor: 'var(--jp-layout-color1)' }}>
      <Typography variant="h5" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)' }}>
        Pretzel AI Settings
      </Typography>

      {/* Display validation errors at the top of the form */}
      {Object.keys(validationErrors).length > 0 && (
        <Box sx={{ mb: 3, color: 'error.main' }}>
          <Typography variant="h6">Validation Errors:</Typography>
          <ul>
            {Object.entries(validationErrors).map(([key, error]) => (
              <li key={key}>{error}</li>
            ))}
          </ul>
        </Box>
      )}

      {/* AI Chat Settings */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)' }}>
          AI Chat Settings
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={4}>
            <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Model</InputLabel>
          </Grid>
          <Grid item xs={8}>
            <FormControl fullWidth>
              <Select
                value={`${tempSettings.features.aiChat.modelProvider}: ${tempSettings.features.aiChat.modelString}`}
                onChange={e => {
                  const [provider, model] = e.target.value.split(': ');
                  handleChange('features.aiChat.modelProvider', provider);
                  handleChange('features.aiChat.modelString', model);
                }}
              >
                {getAvailableModels().map((model: string) => (
                  <MenuItem key={model} value={model}>
                    {model}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Box>

      {/* Inline Copilot Settings */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)' }}>
          Inline Copilot Settings
        </Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={4}>
            <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Enable Inline Copilot</InputLabel>
          </Grid>
          <Grid item xs={8}>
            <Switch
              checked={tempSettings.features.inlineCompletion.enabled}
              onChange={e => handleChange('features.inlineCompletion.enabled', e.target.checked)}
            />
          </Grid>
          {tempSettings.features.inlineCompletion.enabled && (
            <>
              <Grid item xs={4}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>Model</InputLabel>
              </Grid>
              <Grid item xs={8}>
                <FormControl fullWidth>
                  <Select
                    value={`${tempSettings.features.inlineCompletion.modelProvider}: ${tempSettings.features.inlineCompletion.modelString}`}
                    onChange={e => {
                      const [provider, model] = e.target.value.split(': ');
                      handleChange('features.inlineCompletion.modelProvider', provider);
                      handleChange('features.inlineCompletion.modelString', model);
                    }}
                  >
                    {getAvailableModels().map((model: string) => (
                      <MenuItem key={model} value={model}>
                        {model}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </>
          )}
        </Grid>
      </Box>

      <Divider sx={{ my: 3 }} />

      {/* Provider Settings */}
      <Typography variant="h6" gutterBottom sx={{ color: 'var(--jp-ui-font-color0)' }}>
        AI Model Providers
      </Typography>
      {Object.entries(tempSettings.providers).map(([providerName, provider]: [string, any]) => (
        <React.Fragment key={providerName}>{renderProviderSettings(providerName)}</React.Fragment>
      ))}

      <Button variant="contained" color="primary" onClick={handleSave} sx={{ mt: 3 }}>
        Save Settings
      </Button>
    </Paper>
  );
};
