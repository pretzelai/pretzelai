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
              description: 'Best for most users. Free and no API key required. Fast and accurate.'
            }
          }
        },
        OpenAI: {
          displayName: 'OpenAI',
          description: '',
          models: {
            'gpt-4-turbo': {
              displayName: 'GPT-4 Turbo',
              description: 'Most capable GPT-4 model but slower than GPT-4o.'
            },
            'gpt-4o': {
              displayName: 'GPT-4o',
              description: 'Fast and accurate. Cheaper than GPT-4 Turbo, but slightly less capable.'
            },
            'gpt-3.5-turbo': {
              displayName: 'GPT-3.5 Turbo',
              description: 'Faster and more cost-effective model for many tasks. Good for simple tasks.'
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
              description: 'Most advanced GPT-4 model available on Azure.'
            },
            'gpt-35-turbo': {
              displayName: 'GPT-3.5 Turbo',
              description: 'Faster and more cost-effective model for many tasks.'
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
              description: 'Fast and accurate code generation model.'
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: ''
            }
          }
        }
      };
    default:
      return {};
  }
}
