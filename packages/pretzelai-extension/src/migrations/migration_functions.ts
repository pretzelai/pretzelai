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

function addMissingSettings(target, source) {
  const clonedTarget = structuredClone(target);
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      if (!(key in clonedTarget)) {
        clonedTarget[key] = structuredClone(source[key]);
      } else if (typeof source[key] === 'object' && source[key] !== null) {
        if (typeof clonedTarget[key] !== 'object' || clonedTarget[key] === null) {
          clonedTarget[key] = {};
        }
        clonedTarget[key] = addMissingSettings(clonedTarget[key], source[key]);
      }
    }
  }
  return clonedTarget;
}

function addPropertiesMigration(settings, migration_name) {
  const newSettings = addMissingSettings(settings, returnDefaults()) as ReturnType<typeof returnDefaults>;
  newSettings.version = migration_name.split('_to_')[1];
  return newSettings;
}

export const migration_functions = {
  // To just add properties in your migration:
  // 1. Add the props to the returnDefaults function
  // 2. Update the version in returnDefaults function
  // 3. Update the version in schema/plugin.json
  // 4. Add the migration function here with addPropertiesMigration same as '1_1_to_1_2'
  '1.1_to_1.2': settings => addPropertiesMigration(settings, '1.1_to_1.2'),

  '1.0_to_1.1': async function migrate_1_0_to_1_1(settings: ISettingRegistry.ISettings): Promise<any> {
    const pretzelSettingsJSON = settings.get('pretzelSettingsJSON').composite as any;

    if (Object.keys(pretzelSettingsJSON).length === 0) {
      const openAiSettings = settings.get('openAiSettings').composite as any;
      const azureSettings = settings.get('azureSettings').composite as any;
      const aiServiceSetting = settings.get('aiService').composite;
      const aiService = aiServiceSetting || 'Use Pretzel AI Server';
      const codeMatchThreshold = settings.get('codeMatchThreshold').composite as number;
      const inlineCopilotSettings = settings.get('inlineCopilotSettings').composite as any;

      const inlineCopilotEnabled = !!inlineCopilotSettings?.enabled;
      const inlineCopilotProvider = (inlineCopilotSettings?.provider as string) || 'Pretzel AI';
      const mistralApiKey = (inlineCopilotSettings?.mistralApiKey as string) || '';

      const posthogPromptTelemetry = !!settings.get('posthogPromptTelemetry').composite;

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

      const newSettings = returnDefaults_1_1();
      newSettings.features.inlineCompletion.enabled = inlineCopilotEnabled;
      newSettings.features.inlineCompletion.modelProvider = inlineCopilotProvider;
      newSettings.features.inlineCompletion.modelString = inlineCopilotModelString;
      newSettings.features.aiChat.enabled = true;
      newSettings.features.aiChat.modelProvider = aiChatModelProvider;
      newSettings.features.aiChat.modelString = aiCompletionModelString;
      newSettings.features.aiChat.codeMatchThreshold = codeMatchThreshold;
      newSettings.features.posthogTelemetry.posthogPromptTelemetry.enabled = posthogPromptTelemetry;
      newSettings.providers.OpenAI.apiSettings.apiKey.value = openAiSettings?.openAiApiKey;
      newSettings.providers.OpenAI.apiSettings.baseUrl.value = openAiSettings?.openAiBaseUrl;
      newSettings.providers.Mistral.apiSettings.apiKey.value = mistralApiKey;
      newSettings.providers.Azure.apiSettings.apiKey.value = azureSettings?.azureApiKey || '';
      newSettings.providers.Azure.apiSettings.baseUrl.value = azureSettings?.azureBaseUrl || '';
      newSettings.providers.Azure.apiSettings.deploymentName.value = azureSettings?.azureDeploymentName || '';
      return newSettings;
    }
    return pretzelSettingsJSON;
  }
};

export function returnDefaults() {
  return {
    version: '1.2',
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
        },
        posthogGeneralTelemetry: {
          enabled: true
        }
      },
      connections: {
        postgres: {
          enabled: false,
          host: '',
          port: 5432,
          database: 'postgres',
          username: '',
          password: ''
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
          'gpt-4o-mini': {
            name: 'gpt-4o-mini',
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
          },
          'mistral-large-latest': {
            name: 'mistral-large-latest',
            enabled: true,
            showSetting: true
          }
        }
      },
      Anthropic: {
        name: 'Anthropic',
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
          'claude-3-5-sonnet-20240620': {
            name: 'claude-3-5-sonnet-20240620',
            enabled: true,
            showSetting: true
          },
          'claude-3-opus-20240229': {
            name: 'claude-3-opus-20240229',
            enabled: true,
            showSetting: true
          },
          'claude-3-sonnet-20240229': {
            name: 'claude-3-sonnet-20240229',
            enabled: true,
            showSetting: true
          },
          'claude-3-haiku-20240307': {
            name: 'claude-3-haiku-20240307',
            enabled: true,
            showSetting: true
          }
        }
      },
      Ollama: {
        name: 'Ollama',
        enabled: false,
        showSettings: true,
        apiSettings: {
          baseUrl: {
            type: 'string',
            required: true,
            default: 'http://localhost:11434',
            value: 'http://localhost:11434',
            showSetting: true
          }
        },
        models: {}
      },
      Groq: {
        name: 'Groq',
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
          'llama-3.1-405b-reasoning': {
            name: 'llama-3.1-405b-reasoning',
            enabled: true,
            showSetting: true
          },
          'llama-3.1-70b-versatile': {
            name: 'llama-3.1-70b-versatile',
            enabled: true,
            showSetting: true
          },
          'llama-3.1-8b-instant': {
            name: 'llama-3.1-8b-instant',
            enabled: true,
            showSetting: true
          },
          'gemma2-9b-it': {
            name: 'gemma2-9b-it',
            enabled: true,
            showSetting: true
          }
        }
      }
    }
  };
}

export function returnDefaults_1_1() {
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
      },
      connections: {
        postgres: {
          enabled: false,
          host: '',
          port: 5432,
          database: 'postgres',
          username: '',
          password: ''
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
          'gpt-4o-mini': {
            name: 'gpt-4o-mini',
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
          },
          'mistral-large-latest': {
            name: 'mistral-large-latest',
            enabled: true,
            showSetting: true
          }
        }
      },
      Anthropic: {
        name: 'Anthropic',
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
          'claude-3-5-sonnet-20240620': {
            name: 'claude-3-5-sonnet-20240620',
            enabled: true,
            showSetting: true
          },
          'claude-3-opus-20240229': {
            name: 'claude-3-opus-20240229',
            enabled: true,
            showSetting: true
          },
          'claude-3-sonnet-20240229': {
            name: 'claude-3-sonnet-20240229',
            enabled: true,
            showSetting: true
          },
          'claude-3-haiku-20240307': {
            name: 'claude-3-haiku-20240307',
            enabled: true,
            showSetting: true
          }
        }
      },
      Ollama: {
        name: 'Ollama',
        enabled: false,
        showSettings: true,
        apiSettings: {
          baseUrl: {
            type: 'string',
            required: true,
            default: 'http://localhost:11434',
            value: 'http://localhost:11434',
            showSetting: true
          }
        },
        models: {}
      },
      Groq: {
        name: 'Groq',
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
          'llama-3.1-405b-reasoning': {
            name: 'llama-3.1-405b-reasoning',
            enabled: true,
            showSetting: true
          },
          'llama-3.1-70b-versatile': {
            name: 'llama-3.1-70b-versatile',
            enabled: true,
            showSetting: true
          },
          'llama-3.1-8b-instant': {
            name: 'llama-3.1-8b-instant',
            enabled: true,
            showSetting: true
          },
          'gemma2-9b-it': {
            name: 'gemma2-9b-it',
            enabled: true,
            showSetting: true
          }
        }
      }
    }
  };
}
