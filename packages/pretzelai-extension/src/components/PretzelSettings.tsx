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
import { styled } from '@mui/material/styles';

import React, { useCallback, useEffect, useState } from 'react';
import { PLUGIN_ID } from '../utils';

interface IPretzelSettingsProps {
  settingRegistry: ISettingRegistry;
}

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: 'var(--jp-layout-color1)',
  color: 'var(--jp-ui-font-color0)',
  '& .MuiTypography-root': {
    color: 'var(--jp-ui-font-color0)'
  }
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  fontWeight: 'bold',
  borderBottom: '1px solid var(--jp-border-color1)',
  paddingBottom: theme.spacing(1)
}));

const ProviderSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  padding: theme.spacing(1),
  backgroundColor: 'var(--jp-layout-color2)',
  borderRadius: theme.shape.borderRadius,
  boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' // Subtle shadow for separation
}));

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
      <Box>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={4}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {providerName}
            </Typography>
          </Grid>
          <Grid item xs={8}>
            <Switch
              checked={provider.enabled}
              onChange={e => handleChange(`providers.${providerName}.enabled`, e.target.checked)}
            />
          </Grid>
          {provider.enabled && provider.showSettings && (
            <Grid item xs={12}>
              <Grid container spacing={2}>
                {Object.entries(provider.apiSettings).map(([settingKey, setting]: [string, any]) => (
                  <React.Fragment key={settingKey}>
                    <Grid item xs={4}>
                      <InputLabel sx={{ color: 'var(--jp-ui-font-color1)' }}>{setting.label || settingKey}</InputLabel>
                    </Grid>
                    <Grid item xs={8}>
                      <TextField
                        fullWidth
                        variant="outlined"
                        type={setting.type === 'string' ? 'text' : setting.type}
                        value={setting.value}
                        onChange={e =>
                          handleChange(`providers.${providerName}.apiSettings.${settingKey}.value`, e.target.value)
                        }
                        margin="dense"
                      />
                    </Grid>
                  </React.Fragment>
                ))}
              </Grid>
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
    <StyledPaper elevation={3}>
      <SectionTitle variant="h5">Pretzel AI Settings</SectionTitle>

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

      <SectionTitle variant="h6">AI Chat Settings</SectionTitle>
      <Grid container spacing={2} alignItems="center">
        {' '}
        {/* Reduced spacing */}
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

      <SectionTitle variant="h6">Inline Copilot Settings</SectionTitle>
      <Grid container spacing={2} alignItems="center">
        {' '}
        {/* Reduced spacing */}
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

      <SectionTitle variant="h6">Configure AI Services</SectionTitle>
      {Object.entries(tempSettings.providers).map(([providerName, provider]: [string, any]) => (
        <ProviderSection key={providerName}>{renderProviderSettings(providerName)}</ProviderSection>
      ))}

      <Button variant="contained" color="primary" onClick={handleSave} sx={{ mt: 3, mb: 2 }}>
        Save Settings
      </Button>
    </StyledPaper>
  );
};
