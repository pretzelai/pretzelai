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
              displayName: "Pretzel's Free AI Server (default)",
              description: 'General-purpose AI model suitable for most tasks.'
            }
          }
        },
        OpenAI: {
          displayName: 'OpenAI',
          description: "Connect to OpenAI's API for access to powerful language models.",
          models: {
            'gpt-4-turbo': {
              displayName: 'GPT-4 Turbo',
              description: 'Latest and most capable GPT-4 model. Faster and cheaper than the original GPT-4.'
            },
            'gpt-4o': {
              displayName: 'GPT-4o',
              description: 'Original GPT-4 model. More expensive but may be more reliable for certain tasks.'
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: 'Your OpenAI API key. Keep this secret and secure.'
            },
            baseUrl: {
              displayName: 'Base URL (Optional)',
              description: 'Custom base URL for API requests. Leave blank to use the default OpenAI URL.'
            }
          }
        },
        Azure: {
          displayName: 'Azure Enterprise AI Server',
          description: 'Connect to your Azure OpenAI deployment for enterprise-grade AI services.',
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
              description: 'Your Azure OpenAI API key.'
            },
            baseUrl: {
              displayName: 'Base URL',
              description: 'The base URL of your Azure OpenAI deployment.'
            },
            deploymentName: {
              displayName: 'Deployment Name',
              description: 'The name of your specific model deployment on Azure.'
            }
          }
        },
        Mistral: {
          displayName: 'Mistral',
          description: 'Connect to Mistral AI for access to their specialized AI models.',
          models: {
            'codestral-latest': {
              displayName: 'Codestral',
              description: 'Specialized model for code-related tasks and programming assistance.'
            }
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key',
              description: 'Your Mistral AI API key.'
            }
          }
        }
      };
    default:
      return {};
  }
}
