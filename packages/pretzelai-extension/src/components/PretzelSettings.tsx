/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Fade,
  FormControl,
  FormHelperText,
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
import InfoIcon from '@mui/icons-material/Info';
import Tooltip from '@mui/material/Tooltip';

import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { getDefaultSettings } from '../migrations/defaultSettings';
import { PLUGIN_ID } from '../utils';
import { getProvidersInfo } from '../migrations/providerInfo';
import { IProvidersInfo } from '../migrations/providerInfo';

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

const InfoIconStyled = styled(InfoIcon)(({ theme }) => ({
  fontSize: '1rem',
  marginLeft: '5px',
  color: 'var(--jp-ui-font-color2)',
  opacity: 0.6,
  verticalAlign: 'middle'
}));

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
  const [selectedModels, setSelectedModels] = useState<Record<string, { provider: string; model: string }>>({
    aiChat: { provider: '', model: '' },
    inlineCompletion: { provider: '', model: '' }
  });
  const [providersInfo, setProvidersInfo] = useState<IProvidersInfo>({});

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
      const currentVersion = pretzelSettingsJSON.version || '1.1';
      const providersInfo = getProvidersInfo(currentVersion);
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
      setProvidersInfo(providersInfo);
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

      // Update selectedModels state to reflect the default models correctly
      setSelectedModels({
        aiChat: {
          provider: defaultSettings.features.aiChat.modelProvider,
          model: defaultSettings.features.aiChat.modelString
        },
        inlineCompletion: {
          provider: defaultSettings.features.inlineCompletion.modelProvider,
          model: defaultSettings.features.inlineCompletion.modelString
        }
      });
    } catch (error) {
      console.error('Error saving default settings:', error);
    }
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
    <FormControl fullWidth size="small" error={!!validationErrors[`features.${featurePath}.model`]}>
      <Select
        value={`${selectedModels[featurePath].provider}:${selectedModels[featurePath].model}`}
        onChange={e => {
          const [provider, model] = e.target.value.split(':');
          setSelectedModels(prev => ({
            ...prev,
            [featurePath]: { provider, model }
          }));
          handleChange(`features.${featurePath}.modelProvider`, provider);
          handleChange(`features.${featurePath}.modelString`, model);
        }}
      >
        {Object.entries(providersInfo).map(([providerName, providerInfo]) => {
          if (tempSettings.providers[providerName]?.enabled) {
            return [
              <ListSubheader key={providerName}>
                {providerInfo.displayName}
                {providerInfo.description && (
                  <Tooltip title={providerInfo.description} placement="right">
                    <InfoIconStyled />
                  </Tooltip>
                )}
              </ListSubheader>,
              ...Object.entries(providerInfo.models).map(([modelName, modelInfo]) => {
                if (
                  (featurePath === 'aiChat' && modelInfo.canBeUsedForChat) ||
                  (featurePath === 'inlineCompletion' && modelInfo.canBeUsedForInlineCompletion)
                ) {
                  return (
                    <MenuItem key={`${providerName}:${modelName}`} value={`${providerName}:${modelName}`}>
                      <Tooltip title={modelInfo.description} placement="right">
                        <span>{modelInfo.displayName}</span>
                      </Tooltip>
                    </MenuItem>
                  );
                }
                return null;
              })
            ];
          }
          return null;
        })}
      </Select>
      {validationErrors[`features.${featurePath}.model`] && (
        <FormHelperText>{validationErrors[`features.${featurePath}.model`]}</FormHelperText>
      )}
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

        // Update selectedModels state to reflect the saved models
        setSelectedModels({
          aiChat: {
            provider: tempSettings.features.aiChat.modelProvider,
            model: tempSettings.features.aiChat.modelString
          },
          inlineCompletion: {
            provider: tempSettings.features.inlineCompletion.modelProvider,
            model: tempSettings.features.inlineCompletion.modelString
          }
        });
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
      const apiKey = azureProvider?.apiSettings?.apiKey?.value;
      const baseUrl = azureProvider?.apiSettings?.baseUrl?.value;
      const deploymentName = azureProvider?.apiSettings?.deploymentName?.value;

      // Check if any of the three settings are present
      if (apiKey || baseUrl || deploymentName) {
        // If any are present, all three must be provided
        if (!apiKey) {
          errors['providers.Azure.apiSettings.apiKey'] = 'Azure API Key is required';
        } else if (apiKey.length < 32) {
          errors['providers.Azure.apiSettings.apiKey'] = 'Invalid Azure API Key';
        }

        if (!baseUrl) {
          errors['providers.Azure.apiSettings.baseUrl'] = 'Azure Base URL is required';
        } else if (!baseUrl.startsWith('https://')) {
          errors['providers.Azure.apiSettings.baseUrl'] = 'Invalid Azure Base URL';
        }

        if (!deploymentName) {
          errors['providers.Azure.apiSettings.deploymentName'] = 'Azure Deployment Name is required';
        }
      }
      // If none are present, validation passes silently
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

    const validateModelApiKey = (featurePath: string) => {
      const { provider } = selectedModels[featurePath];
      if (provider !== 'Pretzel AI') {
        const apiKey = tempSettings.providers[provider]?.apiSettings?.apiKey?.value;
        if (!apiKey) {
          errors[`providers.${provider}.apiSettings.apiKey`] = `${provider} API key is required for the selected model`;
        }
      }
    };

    validateModelApiKey('aiChat');
    validateModelApiKey('inlineCompletion');

    const availableModels = getAvailableModels();
    const validateModel = (featurePath: string) => {
      const { provider, model } = selectedModels[featurePath];

      if (!provider || !model) {
        errors[`features.${featurePath}.model`] = 'Please select a model';
      } else {
        const currentModel = `${provider}:${model}`;
        if (!availableModels.includes(currentModel)) {
          errors[`features.${featurePath}.model`] = 'Selected model is not available with current provider settings';
        }
      }
    };
    validateModel('aiChat');
    validateModel('inlineCompletion');

    const validateCodeMatchThreshold = () => {
      const threshold = tempSettings.features.aiChat.codeMatchThreshold;
      if (threshold === null || threshold === '') {
        errors['features.aiChat.codeMatchThreshold'] = 'Code match threshold is required';
      } else {
        const thresholdNumber = Number(threshold);
        if (isNaN(thresholdNumber) || thresholdNumber < 0 || thresholdNumber > 100) {
          errors['features.aiChat.codeMatchThreshold'] = 'Code match threshold must be a number between 0 and 100';
        }
      }
    };
    await validateOpenAI();
    validateAzure();
    await validateMistral();
    validateCodeMatchThreshold();

    setValidationErrors(errors);
    setIsValidating(false);
    return Object.keys(errors).length === 0;
  };

  const renderProviderSettings = (providerName: string) => {
    const provider = tempSettings.providers[providerName];
    const providerInfo = providersInfo[providerName];
    if (!provider || !providerInfo) return null;

    return (
      <Box>
        <CompactGrid container spacing={1} alignItems="center">
          <Grid item xs={6}>
            <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem', fontWeight: 'bold' }}>
              {providerInfo.displayName}
              {providerInfo.description && (
                <Tooltip title={providerInfo.description} placement="right">
                  <InfoIconStyled />
                </Tooltip>
              )}
            </InputLabel>
          </Grid>
          <Grid item xs={6}>
            <Switch
              size="small"
              checked={provider.enabled}
              onChange={e => handleChange(`providers.${providerName}.enabled`, e.target.checked)}
            />
          </Grid>
        </CompactGrid>
        {provider.enabled && provider.showSettings && (
          <Box sx={{ mt: 2 }}>
            {Object.entries(provider.apiSettings).map(([key, setting]: [string, any], index) => (
              <CompactGrid container spacing={1} alignItems="center" key={key} sx={{ mb: 2 }}>
                <Grid item xs={6}>
                  <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
                    {providerInfo.apiSettings?.[key]?.displayName || key}
                    {providerInfo.apiSettings?.[key]?.description && (
                      <Tooltip title={providerInfo.apiSettings[key].description} placement="right">
                        <InfoIconStyled />
                      </Tooltip>
                    )}
                  </InputLabel>
                </Grid>
                <Grid item xs={6}>
                  <CompactTextField
                    fullWidth
                    variant="outlined"
                    size="small"
                    type="text"
                    value={setting.value}
                    onChange={e => handleChange(`providers.${providerName}.apiSettings.${key}.value`, e.target.value)}
                    error={!!validationErrors[`providers.${providerName}.apiSettings.${key}`]}
                    helperText={validationErrors[`providers.${providerName}.apiSettings.${key}`]}
                  />
                </Grid>
              </CompactGrid>
            ))}
          </Box>
        )}
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
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
            Code Match Threshold
            <Tooltip
              title="This threshold is used to find matching code in the current Jupyter notebook. Number between 0-100. Lower values will match more (but possibly irrelevant) code."
              placement="right"
            >
              <InfoIconStyled />
            </Tooltip>
          </InputLabel>
        </Grid>
        <Grid item xs={6}>
          <CompactTextField
            fullWidth
            variant="outlined"
            size="small"
            type="text"
            value={tempSettings.features.aiChat.codeMatchThreshold ?? ''}
            onChange={e => {
              const value = e.target.value;
              if (value === '' || (Number(value) >= 0 && Number(value) <= 100)) {
                handleChange('features.aiChat.codeMatchThreshold', value === '' ? null : Number(value));
              }
            }}
            error={!!validationErrors['features.aiChat.codeMatchThreshold']}
            helperText={validationErrors['features.aiChat.codeMatchThreshold']}
          />
        </Grid>
      </CompactGrid>
    </Box>
  );

  const renderInlineCopilotSettings = () => (
    <Box>
      <SectionTitle variant="h6">Inline Copilot Settings</SectionTitle>
      <CompactGrid container spacing={1} alignItems="center">
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
            Enable Inline Copilot
            <Tooltip
              title="The inline copilot completes code as you type, similar to GitHub Copilot. You can turn it on or off here."
              placement="right"
            >
              <InfoIconStyled />
            </Tooltip>
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
      {renderInlineCopilotSettings()}
      <SectionDivider sx={{ my: 2 }} />
      <SectionTitle variant="h6">Configure AI Services</SectionTitle>
      {AI_SERVICES_ORDER.map(providerName => {
        const provider = tempSettings.providers[providerName];
        const providerInfo = providersInfo[providerName];
        if (!provider || !providerInfo) return null;
        return (
          <React.Fragment key={providerName}>
            <ProviderSection>{renderProviderSettings(providerName)}</ProviderSection>
            {providerName !== AI_SERVICES_ORDER[AI_SERVICES_ORDER.length - 1] && <Divider sx={{ my: 2 }} />}
          </React.Fragment>
        );
      })}{' '}
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
