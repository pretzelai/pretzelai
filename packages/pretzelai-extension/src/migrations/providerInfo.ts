/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

export interface IProviderInfo {
  displayName: string;
  description: string;
  models: {
    [key: string]: {
      displayName: string;
      description: string;
      canBeUsedForChat: boolean;
      canBeUsedForInlineCompletion: boolean;
    };
  };
  apiSettings?: {
    [key: string]: {
      displayName: string;
      description: string;
    };
  };
}

export interface IProvidersInfo {
  [key: string]: IProviderInfo;
}

export function getProvidersInfo(version: string): IProvidersInfo {
  switch (version) {
    case '1.1':
      return {
        'Pretzel AI': {
          displayName: 'Pretzel AI Server',
          description: 'Free AI service provided by Pretzel AI. No API key required.',
          models: {
            pretzelai: {
              displayName: "Pretzel's Free AI Server (recommended)",
              description: 'Best for most users. Free and no API key required. Fast and accurate.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            }
          }
        },
        OpenAI: {
          displayName: 'OpenAI',
          description: '',
          models: {
            'gpt-4-turbo': {
              displayName: 'GPT-4 Turbo',
              description: 'Most capable GPT-4 model but slower than GPT-4o.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'gpt-4o': {
              displayName: 'GPT-4o',
              description: 'Fast and accurate. Cheaper than GPT-4 Turbo, but slightly less capable.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'gpt-4o-mini': {
              displayName: 'GPT-4o Mini',
              description: 'Fast and cost-effective model for simpler tasks. Good balance of speed and capability.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: ''
            },
            baseUrl: {
              displayName: 'Base URL (Optional)',
              description:
                'If your organization uses an enterprise version of OpenAI/ChatGPT, you probably have a custom URL for API requests. Get your custom URL from your IT department and fill it here. Leave blank to use the default OpenAI URL.'
            }
          }
        },
        Azure: {
          displayName: 'Azure Enterprise AI Server',
          description:
            "If your company uses an enterprise version of OpenAI, it may be hosted on Azure. Get your Azure connection details from your IT department and fill them here to connect to your company's AI server.",
          models: {
            'gpt-4': {
              displayName: 'GPT-4',
              description: 'Most advanced GPT-4 model available on Azure.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'gpt-35-turbo': {
              displayName: 'GPT-3.5 Turbo',
              description: 'Faster and more cost-effective model for many tasks.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: ''
            },
            baseUrl: {
              displayName: 'Base URL',
              description: ''
            },
            deploymentName: {
              displayName: 'Deployment Name',
              description: ''
            }
          }
        },
        Mistral: {
          displayName: 'Mistral',
          description: '',
          models: {
            'codestral-latest': {
              displayName: 'Codestral',
              description: 'Fast and accurate code generation model.',
              canBeUsedForChat: false,
              canBeUsedForInlineCompletion: true
            },
            'mistral-large-latest': {
              displayName: 'Mistral Large',
              description: 'General Purpose LLM with slighly less performance and accuracy compared to GPT-4.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: ''
            }
          }
        },
        Anthropic: {
          displayName: 'Anthropic',
          description: 'AI models from Anthropic.',
          models: {
            'claude-3-5-sonnet-20240620': {
              displayName: 'Claude-3.5 Sonnet',
              description:
                'The best model from Anthropic. Fast and highly capable, better than GPT-4 series of models.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'claude-3-opus-20240229': {
              displayName: 'Claude-3 Opus',
              description: 'Slow but highly capable model from Anthropic.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'claude-3-sonnet-20240229': {
              displayName: 'Claude-3 Sonnet',
              description: 'Balanced model for various tasks.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'claude-3-haiku-20240307': {
              displayName: 'Claude-3 Haiku',
              description: 'Fastest Claude model, good for simpler tasks.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: 'Your Anthropic API key'
            }
          }
        },
        Ollama: {
          displayName: 'Ollama',
          description: 'Run open-source AI models locally.',
          models: {},
          apiSettings: {
            baseUrl: {
              displayName: 'Base URL',
              description: 'The base URL for your Ollama instance'
            }
          }
        },
        Groq: {
          displayName: 'Groq',
          description:
            'Incredibly fast AI models based on open source models. Some models are not available for general use - please make sure you have access',
          models: {
            'llama-3.1-405b-reasoning': {
              displayName: 'LLaMA 3.1 405B Reasoning',
              description:
                'GPT-4 Turbo class open source LLM from Meta. NOTE! Please make sure you have access to this model in Groq.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'llama-3.1-70b-versatile': {
              displayName: 'LLaMA 3.1 70B Versatile',
              description: 'GPT-4o class model from Meta',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'llama-3.1-8b-instant': {
              displayName: 'LLaMA 3.1 8B Instant',
              description: 'Small GPT-3.5 class model from Meta. Instant completions',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            },
            'gemma2-9b-it': {
              displayName: 'Gemma2 9B IT',
              description: 'Small open-source language model from Google, optimized for instruction-following tasks.',
              canBeUsedForChat: true,
              canBeUsedForInlineCompletion: true
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: 'Your Groq API key'
            }
          }
        }
      };
    default:
      return {};
  }
}
