import { ISettingRegistry } from '@jupyterlab/settingregistry';
import {
  Box,
  Button,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  ListSubheader,
  MenuItem,
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

const ProviderSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  paddingTop: theme.spacing(2)
}));

const CompactGrid = styled(Grid)({
  '& .MuiGrid-item': {
    paddingTop: '4px',
    paddingBottom: '4px'
  }
});

const CompactTextField = styled(TextField)({
  '& .MuiInputBase-input': {
    padding: '8px 12px'
  },
  '& .MuiOutlinedInput-root': {
    height: '36px'
  }
});

const SettingsContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  backgroundColor: 'var(--jp-layout-color1)',
  color: 'var(--jp-ui-font-color0)',
  maxWidth: '800px',
  margin: '0 auto',
  '& .MuiTypography-root': {
    color: 'var(--jp-ui-font-color0)'
  }
}));

const SectionTitle = styled(Typography)(({ theme }) => ({
  marginTop: theme.spacing(2),
  marginBottom: theme.spacing(1),
  fontWeight: 'bold'
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

  const getGroupedModels = () => {
    const groupedModels: { [key: string]: string[] } = {};
    Object.entries(tempSettings.providers).forEach(([providerName, provider]: [string, any]) => {
      if (!groupedModels[providerName]) {
        groupedModels[providerName] = [];
      }
      Object.entries(provider.models).forEach(([modelName, model]: [string, any]) => {
        if (model.enabled) {
          groupedModels[providerName].push(modelName);
        }
      });
    });
    return groupedModels;
  };

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

  const renderModelSelect = (featurePath: string) => (
    <FormControl fullWidth size="small">
      <Select
        value={`${tempSettings.features[featurePath].modelProvider}: ${tempSettings.features[featurePath].modelString}`}
        onChange={e => {
          const [provider, model] = e.target.value.split(': ');
          handleChange(`features.${featurePath}.modelProvider`, provider);
          handleChange(`features.${featurePath}.modelString`, model);
        }}
      >
        {Object.entries(getGroupedModels()).map(([provider, models]) => [
          <ListSubheader key={provider}>{provider}</ListSubheader>,
          ...models.map(model => (
            <MenuItem key={`${provider}: ${model}`} value={`${provider}: ${model}`}>
              {model}
            </MenuItem>
          ))
        ])}
      </Select>
    </FormControl>
  );
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
        <CompactGrid container spacing={2} alignItems="center">
          <Grid item xs={6}>
            <Typography variant="subtitle1">{providerName}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Switch
              size="small"
              checked={provider.enabled}
              onChange={e => handleChange(`providers.${providerName}.enabled`, e.target.checked)}
            />
          </Grid>
          <Grid item xs={12} sx={{ mb: 2 }}></Grid>
          {provider.enabled && provider.showSettings && (
            <Grid item xs={12}>
              <CompactGrid container spacing={2}>
                {Object.entries(provider.apiSettings).map(([settingKey, setting]: [string, any]) => (
                  <React.Fragment key={settingKey}>
                    <Grid item xs={6}>
                      <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
                        {setting.label || settingKey}
                      </InputLabel>
                    </Grid>
                    <Grid item xs={6}>
                      <CompactTextField
                        fullWidth
                        variant="outlined"
                        size="small"
                        type={setting.type === 'string' ? 'text' : setting.type}
                        value={setting.value}
                        onChange={e =>
                          handleChange(`providers.${providerName}.apiSettings.${settingKey}.value`, e.target.value)
                        }
                      />
                    </Grid>
                  </React.Fragment>
                ))}
              </CompactGrid>
            </Grid>
          )}
        </CompactGrid>
      </Box>
    );
  };

  if (loading) {
    return <div>Loading settings...</div>;
  }

  return (
    <SettingsContainer>
      <Typography variant="h5" gutterBottom>
        Pretzel AI Settings
      </Typography>

      {Object.keys(validationErrors).length > 0 && (
        <Box sx={{ mb: 2, color: 'error.main' }}>
          <Typography variant="subtitle2">Validation Errors:</Typography>
          <ul>
            {Object.entries(validationErrors).map(([key, error]) => (
              <li key={key}>{error}</li>
            ))}
          </ul>
        </Box>
      )}

      <SectionTitle variant="h6">AI Chat Settings</SectionTitle>
      <CompactGrid container spacing={1} alignItems="center">
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Model</InputLabel>
        </Grid>
        <Grid item xs={6}>
          {renderModelSelect('aiChat')}
        </Grid>
      </CompactGrid>

      <Divider sx={{ my: 2 }} />

      <SectionTitle variant="h6">Inline Copilot Settings</SectionTitle>
      <CompactGrid container spacing={1} alignItems="center">
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
            Enable Inline Copilot
          </InputLabel>
        </Grid>
        <Grid item xs={6}>
          <Switch
            size="small"
            checked={tempSettings.features.inlineCompletion.enabled}
            onChange={e => handleChange('features.inlineCompletion.enabled', e.target.checked)}
          />
        </Grid>
        {tempSettings.features.inlineCompletion.enabled && (
          <>
            <Grid item xs={6}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Model</InputLabel>
            </Grid>
            <Grid item xs={6}>
              {renderModelSelect('inlineCompletion')}
            </Grid>
          </>
        )}
      </CompactGrid>

      <Divider sx={{ my: 2 }} />

      <SectionTitle variant="h6">Configure AI Services</SectionTitle>
      {Object.entries(tempSettings.providers).map(([providerName, provider]: [string, any]) => (
        <React.Fragment key={providerName}>
          <ProviderSection>{renderProviderSettings(providerName)}</ProviderSection>
          {providerName !== Object.keys(tempSettings.providers).slice(-1)[0] && <Divider sx={{ my: 2 }} />}
        </React.Fragment>
      ))}

      <Button variant="contained" color="primary" onClick={handleSave} sx={{ mt: 2 }}>
        Save Settings
      </Button>
    </SettingsContainer>
  );
};
