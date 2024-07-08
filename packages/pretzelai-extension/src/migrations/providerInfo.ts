export interface IProviderInfo {
  displayName: string;
  models: {
    [key: string]: string;
  };
  apiSettings?: {
    [key: string]: {
      displayName: string;
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
          models: {
            pretzelai: "Pretzel's Free AI Server (default)"
          }
        },
        OpenAI: {
          displayName: 'OpenAI',
          models: {
            'gpt-4-turbo': 'GPT-4 Turbo',
            'gpt-4o': 'GPT-4o'
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key'
            },
            baseUrl: {
              displayName: 'Base URL'
            }
          }
        },
        Azure: {
          displayName: 'Azure Enterprise AI Server',
          models: {
            'gpt-4': 'GPT-4',
            'gpt-35-turbo': 'GPT-3.5 Turbo'
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key'
            },
            baseUrl: {
              displayName: 'Base URL'
            },
            deploymentName: {
              displayName: 'Deployment Name'
            }
          }
        },
        Mistral: {
          displayName: 'Mistral',
          models: {
            'codestral-latest': 'Codestral'
          },
          apiSettings: {
            apiKey: {
              displayName: 'API Key'
            }
          }
        }
      };
    // Add cases for future versions here
    default:
      return {};
  }
}
