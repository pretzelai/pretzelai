import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Fade,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  ListSubheader,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import { styled } from '@mui/material/styles';
import React, { useCallback, useEffect, useState } from 'react';

import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { getDefaultSettings } from '../migrations/defaultSettings';
import { PLUGIN_ID } from '../utils';

const providerMap: Record<string, string> = {
  'Pretzel AI': 'Pretzel AI Server',
  OpenAI: 'OpenAI',
  Azure: 'Azure Enterprise AI Server',
  Mistral: 'Mistral'
};

const modelMap: Record<string, string> = {
  pretzelai: "Pretzel's Free AI Server (default)",
  'gpt-4': 'GPT-4',
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-4o': 'GPT-4o',
  'gpt-35-turbo': 'GPT-3.5 Turbo',
  'codestral-latest': 'Codestral'
};

const AI_SERVICES_ORDER = ['OpenAI', 'Mistral', 'Azure'];

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

const CompactTextField = styled(TextField)(({ theme }) => ({
  '& .MuiInputBase-input': {
    padding: '8px 12px'
  },
  '& .MuiOutlinedInput-root': {
    height: '36px'
  },
  '& .Mui-error': {
    borderColor: theme.palette.error.main
  }
}));

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

const SectionDivider = styled(Divider)(({ theme }) => ({
  backgroundColor: 'var(--jp-border-color2)',
  height: '1px'
}));

const ErrorBox = styled(Box)(({ theme }) => ({
  backgroundColor: 'rgba(211, 47, 47, 0.1)', // Muted red background
  color: theme.palette.error.dark,
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1),
  borderRadius: theme.shape.borderRadius,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  border: `1px solid ${theme.palette.error.light}`
}));

const ErrorContainer = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2)
}));

export const PretzelSettings: React.FC<IPretzelSettingsProps> = ({ settingRegistry }) => {
  const [settings, setSettings] = useState<any>({});
  const [tempSettings, setTempSettings] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [showErrorBox, setShowErrorBox] = useState(false);
  const [selectedModels, setSelectedModels] = useState<Record<string, { provider: string; model: string }>>({});

  useEffect(() => {
    if (Object.keys(validationErrors).length > 0) {
      setShowErrorBox(true);
      const timer = setTimeout(() => {
        setShowErrorBox(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [validationErrors]);

  useEffect(() => {
    const loadSettings = async () => {
      const loadedSettings = await settingRegistry.load(PLUGIN_ID);
      const pretzelSettingsJSON = loadedSettings.get('pretzelSettingsJSON').composite as any;
      setSettings(pretzelSettingsJSON);
      setTempSettings(pretzelSettingsJSON);
      setSelectedModels({
        aiChat: {
          provider: pretzelSettingsJSON.features.aiChat.modelProvider,
          model: pretzelSettingsJSON.features.aiChat.modelString
        },
        inlineCompletion: {
          provider: pretzelSettingsJSON.features.inlineCompletion.modelProvider,
          model: pretzelSettingsJSON.features.inlineCompletion.modelString
        }
      });
      setLoading(false);
    };
    loadSettings();
  }, [settingRegistry]);

  const handleRestoreDefaults = async () => {
    const currentVersion = tempSettings.version || '1.1';
    const defaultSettings = getDefaultSettings(currentVersion);
    setTempSettings(defaultSettings);

    // Save the default settings
    try {
      const plugin = await settingRegistry.load(PLUGIN_ID);
      await plugin.set('pretzelSettingsJSON', defaultSettings);
      setSettings(defaultSettings);
      setValidationErrors({});

      // Update available models for AI Chat and Inline Copilot
      const availableModels = getAvailableModels();
      const updateModelIfUnavailable = (featurePath: string) => {
        const currentModel = `${defaultSettings.features[featurePath].modelProvider}: ${defaultSettings.features[featurePath].modelString}`;
        if (!availableModels.includes(currentModel)) {
          const [newProvider, newModel] = availableModels[0].split(': ');
          handleChange(`features.${featurePath}.modelProvider`, newProvider);
          handleChange(`features.${featurePath}.modelString`, newModel);
        }
      };

      updateModelIfUnavailable('aiChat');
      updateModelIfUnavailable('inlineCompletion');
    } catch (error) {
      console.error('Error saving default settings:', error);
    }
  };

  const getGroupedModels = () => {
    const groupedModels: { [key: string]: string[] } = {};
    Object.entries(tempSettings.providers).forEach(([providerName, provider]: [string, any]) => {
      if (provider.enabled) {
        if (!groupedModels[providerName]) {
          groupedModels[providerName] = [];
        }
        Object.entries(provider.models).forEach(([modelName, model]: [string, any]) => {
          if (model.enabled) {
            groupedModels[providerName].push(modelName);
          }
        });
      }
    });
    return groupedModels;
  };

  const getAvailableModels = () => {
    const models: string[] = [];
    Object.entries(tempSettings.providers).forEach(([providerName, provider]: [string, any]) => {
      if (provider.enabled) {
        Object.entries(provider.models).forEach(([modelName, model]: [string, any]) => {
          if (model.enabled) {
            models.push(`${providerName}:${modelName}`);
          }
        });
      }
    });
    return models;
  };

  const renderModelSelect = (featurePath: string) => (
    <FormControl fullWidth size="small">
      <Select
        value={`${tempSettings.features[featurePath].modelProvider}:${tempSettings.features[featurePath].modelString}`}
        onChange={e => {
          const [provider, model] = e.target.value.split(':');
          handleChange(`features.${featurePath}.modelProvider`, provider);
          handleChange(`features.${featurePath}.modelString`, model);
          setSelectedModels(prev => ({
            ...prev,
            [featurePath]: { provider, model }
          }));
        }}
      >
        {Object.entries(getGroupedModels()).map(([provider, models]) => [
          <ListSubheader key={provider}>{provider}</ListSubheader>,
          ...models.map(model => (
            <MenuItem key={`${provider}:${model}`} value={`${provider}:${model}`}>
              {modelMap[model] || model}
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
        const updateModelIfUnavailable = (featurePath: string) => {
          const currentModel = `${selectedModels[featurePath].provider}:${selectedModels[featurePath].model}`;
          if (!availableModels.includes(currentModel)) {
            const [newProvider, newModel] = availableModels[0].split(':');
            setTempSettings(prev => ({
              ...prev,
              features: {
                ...prev.features,
                [featurePath]: {
                  ...prev.features[featurePath],
                  modelProvider: newProvider,
                  modelString: newModel
                }
              }
            }));
            setSelectedModels(prev => ({
              ...prev,
              [featurePath]: { provider: newProvider, model: newModel }
            }));
          }
        };

        updateModelIfUnavailable('aiChat');
        updateModelIfUnavailable('inlineCompletion');
      } catch (error) {
        console.error('Error saving settings:', error);
      }
    }
  };

  const validateSettings = async (): Promise<boolean> => {
    setIsValidating(true);
    const errors: Record<string, string> = {};

    const validateOpenAI = async () => {
      const openAIProvider = tempSettings.providers.OpenAI;
      if (openAIProvider?.enabled && openAIProvider?.apiSettings?.apiKey?.value) {
        try {
          const baseUrl = openAIProvider.apiSettings?.baseUrl?.value || 'https://api.openai.com';
          const response = await fetch(`${baseUrl}/v1/models`, {
            headers: {
              Authorization: `Bearer ${openAIProvider.apiSettings.apiKey.value}`
            }
          });
          if (!response.ok) {
            errors['providers.OpenAI.apiSettings.apiKey'] =
              'Invalid OpenAI API Key' + (openAIProvider.apiSettings?.baseUrl?.value ? ' or incorrect base URL' : '');
          }
        } catch (error) {
          errors['providers.OpenAI.apiSettings.apiKey'] =
            'Error validating OpenAI API Key' +
            (openAIProvider.apiSettings?.baseUrl?.value ? ' or incorrect base URL' : '');
        }
      }
    };

    const validateAzure = () => {
      const azureProvider = tempSettings.providers.Azure;
      if (azureProvider?.enabled) {
        if (azureProvider?.apiSettings?.apiKey?.value && azureProvider.apiSettings.apiKey.value.length < 32) {
          errors['providers.Azure.apiSettings.apiKey'] = 'Invalid Azure API Key';
        }
        if (
          azureProvider?.apiSettings?.baseUrl?.value &&
          !azureProvider.apiSettings.baseUrl.value.startsWith('https://')
        ) {
          errors['providers.Azure.apiSettings.baseUrl'] = 'Invalid Azure Base URL';
        }
        if (!azureProvider?.apiSettings?.deploymentName?.value) {
          errors['providers.Azure.apiSettings.deploymentName'] = 'Deployment Name is required';
        }
      }
    };

    const validateMistral = async () => {
      const mistralProvider = tempSettings.providers.Mistral;
      if (mistralProvider?.enabled && mistralProvider?.apiSettings?.apiKey?.value) {
        try {
          const response = await fetch('https://api.mistral.ai/v1/models', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${mistralProvider.apiSettings.apiKey.value}`
            }
          });

          if (response.status === 200) {
            // API key is valid
          } else if (response.status === 401) {
            errors['providers.Mistral.apiSettings.apiKey'] = 'Invalid Mistral API Key';
          } else {
            errors['providers.Mistral.apiSettings.apiKey'] = `Unexpected response from Mistral API: ${response.status}`;
          }
        } catch (error) {
          console.error('Error validating Mistral API Key:', error);
          errors['providers.Mistral.apiSettings.apiKey'] =
            'Error validating Mistral API Key. Please check your internet connection.';
        }
      }
    };

    const availableModels = getAvailableModels();
    const validateModel = (featurePath: string) => {
      const { provider, model } = selectedModels[featurePath];
      const currentModel = `${provider}:${model}`;

      if (!availableModels.includes(currentModel)) {
        errors[`features.${featurePath}.model`] = 'Selected model is not available with current provider settings';
      }
    };

    validateModel('aiChat');
    validateModel('inlineCompletion');

    await validateOpenAI();
    validateAzure();
    await validateMistral();

    setValidationErrors(errors);
    setIsValidating(false);
    return Object.keys(errors).length === 0;
  };

  const renderProviderSettings = (providerName: string, displayName: string) => {
    const provider = tempSettings.providers[providerName];
    if (!provider) return null;

    return (
      <Box>
        <CompactGrid container spacing={2} alignItems="center">
          <Grid item xs={6}>
            <Typography variant="subtitle1">{displayName}</Typography>
          </Grid>
          <Grid item xs={6}>
            <Switch
              size="small"
              checked={provider.enabled}
              onChange={e => handleChange(`providers.${providerName}.enabled`, e.target.checked)}
            />
          </Grid>
          {provider.enabled && (
            <>
              <Grid item xs={12} sx={{ mb: 2 }}></Grid>
              {provider.showSettings && (
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
                            error={!!validationErrors[`providers.${providerName}.apiSettings.${settingKey}`]}
                            helperText={validationErrors[`providers.${providerName}.apiSettings.${settingKey}`]}
                          />
                        </Grid>
                      </React.Fragment>
                    ))}
                  </CompactGrid>
                </Grid>
              )}
            </>
          )}
        </CompactGrid>
      </Box>
    );
  };

  if (loading) {
    return <div>Loading settings...</div>;
  }

  const renderAIChatSettings = () => (
    <Box>
      <SectionTitle variant="h6">AI Chat Settings</SectionTitle>
      <CompactGrid container spacing={1} alignItems="center">
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Model</InputLabel>
        </Grid>
        <Grid item xs={6}>
          {renderModelSelect('aiChat')}
        </Grid>
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Code Match Threshold</InputLabel>
        </Grid>
        <Grid item xs={6}>
          <CompactTextField
            fullWidth
            variant="outlined"
            size="small"
            type="number"
            value={tempSettings.features.aiChat.codeMatchThreshold}
            onChange={e => handleChange('features.aiChat.codeMatchThreshold', Number(e.target.value))}
          />
        </Grid>
      </CompactGrid>
    </Box>
  );

  // Add this new section to render PostHog Telemetry settings
  const renderOtherSettings = () => (
    <Box>
      <SectionTitle variant="h6">Other Settings</SectionTitle>
      <CompactGrid container spacing={1} alignItems="center">
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
            Enable PostHog Prompt Telemetry
          </InputLabel>
        </Grid>
        <Grid item xs={6}>
          <Switch
            size="small"
            checked={tempSettings.features.posthogTelemetry.posthogPromptTelemetry.enabled}
            onChange={e => handleChange('features.posthogTelemetry.posthogPromptTelemetry.enabled', e.target.checked)}
          />
        </Grid>
      </CompactGrid>
    </Box>
  );

  return (
    <SettingsContainer>
      <Typography variant="h5" gutterBottom>
        Pretzel AI Settings
      </Typography>
      <Fade in={showErrorBox} timeout={1000}>
        <ErrorContainer sx={{ display: showErrorBox ? 'block' : 'none' }}>
          <Stack spacing={1}>
            {Object.entries(validationErrors).map(([key, error]) => (
              <ErrorBox key={key}>
                <Typography variant="body2">{error}</Typography>
                <IconButton
                  size="small"
                  aria-label="close"
                  onClick={() => {
                    const newErrors = { ...validationErrors };
                    delete newErrors[key];
                    setValidationErrors(newErrors);
                    if (Object.keys(newErrors).length === 0) {
                      setShowErrorBox(false);
                    }
                  }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              </ErrorBox>
            ))}
          </Stack>
        </ErrorContainer>
      </Fade>

      {renderAIChatSettings()}
      <SectionDivider sx={{ my: 2 }} />
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
      <SectionDivider sx={{ my: 2 }} />
      <SectionTitle variant="h6">Configure AI Services</SectionTitle>
      {AI_SERVICES_ORDER.map(providerName => {
        const provider = tempSettings.providers[providerName];
        if (!provider) return null;
        return (
          <React.Fragment key={providerName}>
            <ProviderSection>
              {renderProviderSettings(providerName, providerMap[providerName] || providerName)}
            </ProviderSection>
            {providerName !== AI_SERVICES_ORDER[AI_SERVICES_ORDER.length - 1] && <Divider sx={{ my: 2 }} />}
          </React.Fragment>
        );
      })}
      <SectionDivider sx={{ my: 2 }} />
      {renderOtherSettings()}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2 }}>
        <Button variant="outlined" color="secondary" onClick={handleRestoreDefaults}>
          Restore Defaults
        </Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={isValidating}
          startIcon={isValidating ? <CircularProgress size={20} /> : null}
        >
          {isValidating ? 'Validating...' : 'Save Settings'}
        </Button>
      </Box>
    </SettingsContainer>
  );
};
