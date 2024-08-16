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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import InfoIcon from '@mui/icons-material/Info';
import Tooltip from '@mui/material/Tooltip';

import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { getDefaultSettings } from '../migrations/defaultSettings';
import { getCookie, PLUGIN_ID } from '../utils';
import { getProvidersInfo } from '../migrations/providerInfo';
import { IProvidersInfo } from '../migrations/providerInfo';
import debounce from 'lodash/debounce';
import Groq from 'groq-sdk';

const AI_SERVICES_ORDER = ['OpenAI', 'Anthropic', 'Mistral', 'Groq', 'Ollama', 'Azure'];

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
    padding: '8px 12px',
    color: 'var(--jp-ui-font-color0)' // Light text color
  },
  '& .MuiOutlinedInput-root': {
    height: '36px',
    borderColor: 'var(--jp-border-color1)', // Light border color
    '& fieldset': {
      borderColor: 'var(--jp-border-color1)' // Light border color
    },
    '&:hover fieldset': {
      borderColor: 'var(--jp-border-color2)' // Light border color on hover
    },
    '&.Mui-focused fieldset': {
      borderColor: 'var(--jp-brand-color1)' // Light border color when focused
    }
  },
  '& .Mui-error': {
    borderColor: theme.palette.error.main
  }
}));

const CustomSelect = styled(Select)(({ theme }) => ({
  '& .MuiSelect-select': {
    color: 'var(--jp-ui-font-color0)' // Light text color
  },
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--jp-border-color1)' // Light border color
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--jp-border-color2)' // Light border color on hover
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'var(--jp-brand-color1)' // Light border color when focused
  },
  '& .MuiList-padding': {
    backgroundColor: 'var(--jp-layout-color1)' // Match the background color of the list
  },
  '& .MuiSvgIcon-root': {
    color: 'var(--jp-ui-font-color0)' // Light icon color
  },
  // Add this rule to fix the background color of the <ul> element
  '& .MuiList-root': {
    backgroundColor: 'var(--jp-layout-color1)' // Match the background color of the list
  }
}));

const SettingsContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
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
      // Update Ollama provider info for models
      updateOllamaProviderInfo();

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

  const updateOllamaProviderInfo = () => {
    const ollamaInfo = providersInfo['Ollama'];
    if (ollamaInfo) {
      const ollamaModels = tempSettings.providers['Ollama'].models;
      const updatedModels = {};
      for (const modelKey of Object.keys(ollamaModels)) {
        updatedModels[modelKey] = {
          displayName: `${modelKey}`,
          description:
            "Model provided by Ollama. Please see model documentation online to understand it's capabilities.",
          canBeUsedForChat: true,
          canBeUsedForInlineCompletion: true
        };
      }
      ollamaInfo.models = updatedModels;
      setProvidersInfo({
        ...providersInfo,
        Ollama: ollamaInfo
      });
    }
  };

  useEffect(() => {
    if (tempSettings.providers?.Ollama?.models) {
      updateOllamaProviderInfo();
    }
  }, [JSON.stringify(tempSettings?.providers?.Ollama?.models)]);

  useEffect(() => {
    const ollamaBaseUrl = tempSettings.providers?.Ollama?.apiSettings?.baseUrl?.value;
    const ollamaEnabled = tempSettings.providers?.Ollama?.enabled;
    if (ollamaBaseUrl && ollamaEnabled) {
      fetchOllamaModels(ollamaBaseUrl);
    }
  }, [tempSettings.providers?.Ollama?.enabled]);

  const handleRestoreDefaults = async () => {
    const currentVersion = tempSettings.version || '1.1';
    const defaultSettings = getDefaultSettings(currentVersion);
    setTempSettings(defaultSettings);

    // Save the default settings
    try {
      const plugin = await settingRegistry.load(PLUGIN_ID);
      await plugin.set('pretzelSettingsJSON', defaultSettings);
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
      <CustomSelect
        value={`${selectedModels[featurePath].provider}:${selectedModels[featurePath].model}`}
        onChange={e => {
          // @ts-expect-error ignoring the type issues here
          const [provider, ...modelParts] = e.target.value.split(':');
          const model = modelParts.join(':'); // Join back the parts of the model name that may contain colons
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
              <ListSubheader
                key={providerName}
                style={{
                  backgroundColor: 'var(--jp-layout-color1)', // Dark background color
                  color: 'var(--jp-ui-font-color2)' // Lighter text color for distinction
                }}
              >
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
                    <MenuItem
                      key={`${providerName}:${modelName}`}
                      value={`${providerName}:${modelName}`}
                      sx={{
                        backgroundColor: 'var(--jp-layout-color1)',
                        color: 'var(--jp-ui-font-color0)',
                        '&:hover': {
                          backgroundColor: 'var(--jp-layout-color2)'
                        },
                        '&.Mui-selected': {
                          backgroundColor: 'var(--jp-brand-color1)',
                          color: 'var(--jp-ui-inverse-font-color0)',
                          '&:hover': {
                            backgroundColor: 'var(--jp-brand-color2)'
                          }
                        },
                        '& .MuiList-padding': {
                          backgroundColor: 'var(--jp-layout-color1)'
                        }
                      }}
                    >
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
      </CustomSelect>
      {validationErrors[`features.${featurePath}.model`] && (
        <FormHelperText>{validationErrors[`features.${featurePath}.model`]}</FormHelperText>
      )}
    </FormControl>
  );
  const fetchOllamaModels = useCallback(async (baseUrl: string) => {
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (response.ok) {
        const data = await response.json();
        const updatedOllamaModels = {};
        data.models.forEach(model => {
          updatedOllamaModels[model.name] = {
            name: model.name,
            enabled: true,
            showSetting: true
          };
        });
        setTempSettings(prevSettings => ({
          ...prevSettings,
          providers: {
            ...prevSettings.providers,
            Ollama: {
              ...prevSettings.providers.Ollama,
              models: updatedOllamaModels
            }
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching Ollama models:', error);
    }
  }, []);

  const debouncedFetchOllamaModels = useMemo(() => debounce(fetchOllamaModels, 500), [fetchOllamaModels]);

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

  const handleOllamaUrlChange = useCallback(
    (value: string) => {
      handleChange('providers.Ollama.apiSettings.baseUrl.value', value);
      debouncedFetchOllamaModels(value);
    },
    [handleChange, debouncedFetchOllamaModels]
  );

  const handleSave = async () => {
    const isValid = await validateSettings();
    if (isValid) {
      try {
        const plugin = await settingRegistry.load(PLUGIN_ID);
        await plugin.set('pretzelSettingsJSON', tempSettings);
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
            errors['providers.Mistral.apiSettings.apiKey'] =
              'Invalid Mistral API Key (Note: new Mistral keys take ~2min to start working)';
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

    const validateAnthropic = async () => {
      const anthropicProvider = tempSettings.providers.Anthropic;
      if (anthropicProvider?.enabled && anthropicProvider?.apiSettings?.apiKey?.value) {
        try {
          const xsrfToken = await getCookie('_xsrf');
          const response = await fetch('/anthropic/verify_key', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-XSRFToken': xsrfToken
            },
            body: JSON.stringify({
              // eslint-disable-next-line camelcase
              api_key: anthropicProvider.apiSettings.apiKey.value
            })
          });

          const data = await response.json();

          if (data.valid) {
            return;
          } else {
            errors['providers.Anthropic.apiSettings.apiKey'] = data.error || 'Invalid Anthropic API Key';
          }
        } catch (error) {
          console.error('Error validating Anthropic API Key:', error);
          errors['providers.Anthropic.apiSettings.apiKey'] =
            'Error validating Anthropic API Key. Please check your internet connection.';
        }
      }
    };

    const validateOllama = async () => {
      const ollamaProvider = tempSettings.providers.Ollama;
      if (ollamaProvider?.enabled) {
        const baseUrl = ollamaProvider?.apiSettings?.baseUrl?.value;
        if (!baseUrl) {
          errors['providers.Ollama.apiSettings.baseUrl'] = 'Ollama base URL is required';
        } else {
          try {
            const response = await fetch(`${baseUrl}/api/tags`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (response.status !== 200) {
              errors[
                'providers.Ollama.apiSettings.baseUrl'
              ] = `Unexpected response from Ollama API: ${response.status}`;
            }
          } catch (error) {
            console.error('Error validating Ollama API:', error);
            errors['providers.Ollama.apiSettings.baseUrl'] =
              'Error validating Ollama API. Please check your internet connection and the provided base URL.';
          }
        }
      }
    };

    const validateGroq = async () => {
      const groqProvider = tempSettings.providers.Groq;
      if (groqProvider?.enabled && groqProvider?.apiSettings?.apiKey?.value) {
        try {
          const groq = new Groq({ apiKey: groqProvider.apiSettings.apiKey.value, dangerouslyAllowBrowser: true });

          const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: 'Hi' }],
            model: 'llama-3.1-8b-instant'
          });

          if (!chatCompletion.choices[0].message.content) {
            errors['providers.Groq.apiSettings.apiKey'] = 'Invalid Groq API Key';
          }
        } catch (error) {
          console.error('Error validating Groq API Key:', error);
          errors['providers.Groq.apiSettings.apiKey'] =
            'Error validating Groq API Key. Please check your internet connection.';
        }
      }
    };

    const validateModelApiKey = (featurePath: string) => {
      const { provider } = selectedModels[featurePath];
      if (provider !== 'Pretzel AI' && provider !== 'Ollama') {
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
    await Promise.allSettled([
      validateOpenAI(),
      validateMistral(),
      validateAnthropic(),
      validateOllama(),
      validateGroq()
    ]);
    validateAzure();
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
                    onChange={e => {
                      if (providerName === 'Ollama' && key === 'baseUrl') {
                        handleOllamaUrlChange(e.target.value);
                      } else {
                        handleChange(`providers.${providerName}.apiSettings.${key}.value`, e.target.value);
                      }
                    }}
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
      <SectionTitle variant="h6">AI Settings</SectionTitle>
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
      <CompactGrid container spacing={1} alignItems="center">
        <Grid item xs={6}>
          <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>
            {`Enable AI inline autocomplete (Copilot)`}
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
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Copilot Model</InputLabel>
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
      <Box sx={{ height: '80vh', overflowY: 'auto', paddingBottom: '80px' }}>
        <Typography variant="h5" gutterBottom>
          Pretzel Settings
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
        <Divider sx={{ my: 2 }} />
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
        {/* <SectionTitle variant="h6">Connections</SectionTitle>
        <Box sx={{ mb: 2 }}>
          <CompactGrid container spacing={1} alignItems="center">
            <Grid item xs={6}>
              <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem', fontWeight: 'bold' }}>
                PostgreSQL
              </InputLabel>
            </Grid>
            <Grid item xs={6}>
              <Switch
                size="small"
                checked={tempSettings.features.connections.postgres.enabled}
                onChange={e => handleChange('features.connections.postgres.enabled', e.target.checked)}
              />
            </Grid>
          </CompactGrid>
          {tempSettings.features.connections.postgres.enabled && (
            <CompactGrid container spacing={1} alignItems="center" sx={{ mt: 1 }}>
              <Grid item xs={6}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Host</InputLabel>
              </Grid>
              <Grid item xs={6}>
                <CompactTextField
                  fullWidth
                  variant="outlined"
                  size="small"
                  type="text"
                  value={tempSettings.features.connections.postgres.host}
                  onChange={e => handleChange('features.connections.postgres.host', e.target.value)}
                  error={!!validationErrors['features.connections.postgres.host']}
                  helperText={validationErrors['features.connections.postgres.host']}
                />
              </Grid>
              <Grid item xs={6}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Port</InputLabel>
              </Grid>
              <Grid item xs={6}>
                <CompactTextField
                  fullWidth
                  variant="outlined"
                  size="small"
                  type="text"
                  value={tempSettings.features.connections.postgres.port}
                  onChange={e => handleChange('features.connections.postgres.port', Number(e.target.value))}
                  error={!!validationErrors['features.connections.postgres.port']}
                  helperText={validationErrors['features.connections.postgres.port']}
                />
              </Grid>
              <Grid item xs={6}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Database</InputLabel>
              </Grid>
              <Grid item xs={6}>
                <CompactTextField
                  fullWidth
                  variant="outlined"
                  size="small"
                  type="text"
                  value={tempSettings.features.connections.postgres.database}
                  onChange={e => handleChange('features.connections.postgres.database', e.target.value)}
                  error={!!validationErrors['features.connections.postgres.database']}
                  helperText={validationErrors['features.connections.postgres.database']}
                />
              </Grid>
              <Grid item xs={6}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Username</InputLabel>
              </Grid>
              <Grid item xs={6}>
                <CompactTextField
                  fullWidth
                  variant="outlined"
                  size="small"
                  type="text"
                  value={tempSettings.features.connections.postgres.username}
                  onChange={e => handleChange('features.connections.postgres.username', e.target.value)}
                  error={!!validationErrors['features.connections.postgres.username']}
                  helperText={validationErrors['features.connections.postgres.username']}
                />
              </Grid>
              <Grid item xs={6}>
                <InputLabel sx={{ color: 'var(--jp-ui-font-color1)', fontSize: '0.875rem' }}>Password</InputLabel>
              </Grid>
              <Grid item xs={6}>
                <CompactTextField
                  fullWidth
                  variant="outlined"
                  size="small"
                  type="password"
                  value={tempSettings.features.connections.postgres.password}
                  onChange={e => handleChange('features.connections.postgres.password', e.target.value)}
                  error={!!validationErrors['features.connections.postgres.password']}
                  helperText={validationErrors['features.connections.postgres.password']}
                />
              </Grid>
            </CompactGrid>
          )}
        </Box> */}
        <SectionDivider sx={{ my: 2 }} />
        {renderOtherSettings()}
      </Box>
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '16px',
          backgroundColor: 'var(--jp-layout-color1)',
          borderTop: '1px solid var(--jp-border-color1)',
          display: 'flex',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '800px'
        }}
      >
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
