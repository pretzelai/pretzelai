/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import { ISettingRegistry } from '@jupyterlab/settingregistry';

export async function migrate_1_0_to_1_1(settings: ISettingRegistry.ISettings): Promise<any> {
  const pretzelSettingsJSON = settings.get('pretzelSettingsJSON').composite as any;

  if (Object.keys(pretzelSettingsJSON).length === 0) {
    const openAiSettings = settings.get('openAiSettings').composite as any;
    const azureSettings = settings.get('azureSettings').composite as any;
    const aiServiceSetting = settings.get('aiService').composite;
    const aiService = aiServiceSetting || 'Use Pretzel AI Server';
    const codeMatchThreshold = settings.get('codeMatchThreshold').composite as number;
    const inlineCopilotSettings = settings.get('inlineCopilotSettings').composite as any;

    const inlineCopilotEnabled = inlineCopilotSettings?.enabled || false;
    const inlineCopilotProvider = inlineCopilotSettings?.provider || 'Pretzel AI';
    const mistralApiKey = inlineCopilotSettings?.mistralApiKey || '';

    const posthogPromptTelemetry = settings.get('posthogPromptTelemetry').composite as boolean;

    const inlineCopilotModelString = (() => {
      switch (inlineCopilotProvider) {
        case 'Pretzel AI':
          return 'pretzelai';
        case 'Mistral':
          return 'codestral-latest';
        case 'OpenAI':
          return 'gpt-4o';
        default:
          return 'pretzelai';
      }
    })();

    const aiCompletionModelString = (() => {
      switch (aiService) {
        case 'OpenAI API key':
          return openAiSettings?.openAiModel || 'gpt-4o';
        case 'Use Azure API':
          return azureSettings?.azureDeploymentName || 'gpt-4';
        case 'Use Pretzel AI Server':
          return 'pretzelai';
        default:
          return 'pretzelai';
      }
    })();

    const aiChatModelProvider = (() => {
      switch (aiService) {
        case 'OpenAI API key':
          return 'OpenAI';
        case 'Use Azure API':
          return 'Azure';
        case 'Use Pretzel AI Server':
          return 'Pretzel AI';
        default:
          return 'Pretzel AI';
      }
    })();

    const newSettings = {
      version: '1.1',
      features: {
        inlineCompletion: {
          enabled: inlineCopilotEnabled,
          modelProvider: inlineCopilotProvider,
          modelString: inlineCopilotModelString
        },
        aiChat: {
          enabled: true,
          modelProvider: aiChatModelProvider,
          modelString: aiCompletionModelString,
          codeMatchThreshold: codeMatchThreshold
        },
        posthogTelemetry: {
          posthogPromptTelemetry: {
            enabled: posthogPromptTelemetry
          }
        }
      },
      providers: {
        'Pretzel AI': {
          name: 'Pretzel AI',
          enabled: true,
          showSettings: false,
          apiSettings: {},
          models: {
            pretzelai: { name: 'pretzelai', enabled: true }
          }
        },
        OpenAI: {
          name: 'OpenAI',
          enabled: true,
          showSettings: true,
          apiSettings: {
            apiKey: {
              type: 'string',
              required: true,
              default: '',
              value: openAiSettings?.openAiApiKey,
              showSetting: true
            },
            baseUrl: {
              type: 'string',
              required: false,
              default: '',
              value: openAiSettings?.openAiBaseUrl,
              showSetting: false
            }
          },
          models: {
            'gpt-4-turbo': {
              name: 'gpt-4-turbo',
              enabled: true,
              showSetting: true,
              settings: { maxTokens: { type: 'number', default: 2048, showSetting: false, required: false } }
            },
            'gpt-4o': {
              name: 'gpt-4o',
              enabled: true,
              showSetting: true,
              settings: { maxTokens: { type: 'number', default: 4096, showSetting: false, required: false } }
            },
            'gpt-3.5-turbo': {
              name: 'gpt-3.5-turbo',
              enabled: true,
              showSetting: true,
              settings: { maxTokens: { type: 'number', default: 4096, showSetting: false, required: false } }
            }
          }
        },
        Azure: {
          name: 'Azure',
          enabled: true,
          showSettings: true,
          apiSettings: {
            apiKey: {
              type: 'string',
              required: true,
              default: '',
              value: azureSettings?.azureApiKey || '',
              showSetting: true
            },
            baseUrl: {
              type: 'string',
              required: true,
              default: '',
              value: azureSettings?.azureBaseUrl || '',
              showSetting: true
            },
            deploymentName: {
              type: 'string',
              required: true,
              default: '',
              value: azureSettings?.azureDeploymentName || '',
              showSetting: true
            }
          },
          models: {
            'gpt-4': {
              name: 'gpt-4',
              enabled: true,
              showSetting: true
            },
            'gpt-35-turbo': {
              name: 'gpt-35-turbo',
              enabled: true,
              showSetting: true
            }
          }
        },
        Mistral: {
          name: 'Mistral',
          enabled: true,
          showSettings: true,
          apiSettings: {
            apiKey: {
              type: 'string',
              required: true,
              default: '',
              value: mistralApiKey,
              showSetting: true
            }
          },
          models: {
            'codestral-latest': {
              name: 'codestral-latest',
              enabled: true,
              showSetting: true
            }
          }
        }
      }
    };
    return newSettings;
  }
  return pretzelSettingsJSON;
}

export function returnDefaults_1_1(): any {
  return {
    version: '1.1',
    features: {
      inlineCompletion: {
        enabled: true,
        modelProvider: 'Pretzel AI',
        modelString: 'pretzelai'
      },
      aiChat: {
        enabled: true,
        modelProvider: 'Pretzel AI',
        modelString: 'pretzelai',
        codeMatchThreshold: 20
      },
      posthogTelemetry: {
        posthogPromptTelemetry: {
          enabled: true
        }
      }
    },
    providers: {
      'Pretzel AI': {
        name: 'Pretzel AI',
        enabled: true,
        showSettings: false,
        apiSettings: {},
        models: {
          pretzelai: { name: 'pretzelai', enabled: true }
        }
      },
      OpenAI: {
        name: 'OpenAI',
        enabled: true,
        showSettings: true,
        apiSettings: {
          apiKey: {
            type: 'string',
            required: true,
            default: '',
            value: '',
            showSetting: true
          },
          baseUrl: {
            type: 'string',
            required: false,
            default: '',
            value: '',
            showSetting: false
          }
        },
        models: {
          'gpt-4-turbo': {
            name: 'gpt-4-turbo',
            enabled: true,
            showSetting: true,
            settings: { maxTokens: { type: 'number', default: 4096, showSetting: false, required: false } }
          },
          'gpt-4o': {
            name: 'gpt-4o',
            enabled: true,
            showSetting: true,
            settings: { maxTokens: { type: 'number', default: 4096, showSetting: false, required: false } }
          },
          'gpt-3.5-turbo': {
            name: 'gpt-3.5-turbo',
            enabled: true,
            showSetting: true,
            settings: { maxTokens: { type: 'number', default: 4096, showSetting: false, required: false } }
          }
        }
      },
      Azure: {
        name: 'Azure',
        enabled: false,
        showSettings: true,
        apiSettings: {
          apiKey: {
            type: 'string',
            required: true,
            default: '',
            value: '',
            showSetting: true
          },
          baseUrl: {
            type: 'string',
            required: true,
            default: '',
            value: '',
            showSetting: true
          },
          deploymentName: {
            type: 'string',
            required: true,
            default: '',
            value: '',
            showSetting: true
          }
        },
        models: {
          'gpt-4': {
            name: 'gpt-4',
            enabled: true,
            showSetting: true
          },
          'gpt-35-turbo': {
            name: 'gpt-35-turbo',
            enabled: true,
            showSetting: true
          }
        }
      },
      Mistral: {
        name: 'Mistral',
        enabled: true,
        showSettings: true,
        apiSettings: {
          apiKey: {
            type: 'string',
            required: true,
            default: '',
            value: '',
            showSetting: true
          }
        },
        models: {
          'codestral-latest': {
            name: 'codestral-latest',
            enabled: true,
            showSetting: true
          }
        }
      }
    }
  };
}
