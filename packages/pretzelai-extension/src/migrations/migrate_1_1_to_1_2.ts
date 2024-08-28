/* eslint-disable camelcase */
/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

export async function migrate_1_1_to_1_2(pretzelSettingsJSON: ReturnType<typeof returnDefaults_1_2>): Promise<any> {
  // pretzelSettingsJSON is actually the 1.1 settings - we're using type of 1.2 because that's what we want to return
  // we change the things that need to be changed and return the settings
  const defaultSettings = returnDefaults_1_2();
  // change the posthogGeneralTelemetry to the default settings
  pretzelSettingsJSON.features.posthogTelemetry.posthogGeneralTelemetry = {
    enabled: defaultSettings.features.posthogTelemetry.posthogGeneralTelemetry.enabled
  };
  // update the version
  pretzelSettingsJSON.version = defaultSettings.version;
  return pretzelSettingsJSON;
}

type ModelInfo = {
  name: string;
  enabled: boolean;
  showSetting: boolean;
  settings: Record<string, any>;
};

type OllamaModels = { [key: string]: ModelInfo } | Record<string, never>;

export function returnDefaults_1_2() {
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
        models: {} as OllamaModels
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
