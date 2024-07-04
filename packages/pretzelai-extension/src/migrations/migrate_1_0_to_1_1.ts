/* eslint-disable camelcase */
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { AiService } from '../prompt';

export async function migrate_1_0_to_1_1(settings: ISettingRegistry.ISettings): Promise<void> {
  const pretzelSettingsJSON = settings.get('pretzelSettingsJSON').composite as any;

  if (Object.keys(pretzelSettingsJSON).length === 0) {
    const openAiSettings = settings.get('openAiSettings').composite as any;
    const azureSettings = settings.get('azureSettings').composite as any;
    const aiServiceSetting = settings.get('aiService').composite;
    const aiService = (aiServiceSetting as AiService) || 'Use Pretzel AI Server';
    const codeMatchThreshold = settings.get('codeMatchThreshold').composite as number;
    const inlineCopilotSettings = settings.get('inlineCopilotSettings').composite as any;

    const inlineCopilotEnabled = inlineCopilotSettings?.enabled || false;
    const inlineCopilotProvider = inlineCopilotSettings?.provider || 'Pretzel AI';

    const inlineCopilotModelString = (() => {
      switch (inlineCopilotProvider) {
        case 'Pretzel AI':
          return 'pretzel-ai';
        case 'Mistral':
          return 'codestral-latest';
        case 'OpenAI':
          return 'gpt-4o';
        default:
          return 'pretzel-ai';
      }
    })();

    const aiCompletionModelString = (() => {
      switch (aiService) {
        case 'OpenAI API key':
          return openAiSettings?.openAiModel || 'gpt-4o';
        case 'Use Azure API':
          return azureSettings?.azureDeploymentName || 'gpt-4';
        case 'Use Pretzel AI Server':
        default:
          return 'pretzel-ai';
      }
    })();

    const newSettings = {
      version: '1.1',
      features: {
        inlineCompletion: {
          enabled: inlineCopilotEnabled,
          model: inlineCopilotModelString
        },
        aiChat: {
          enabled: true,
          model: aiCompletionModelString,
          codeMatchThreshold: codeMatchThreshold
        }
      },
      providers: [
        {
          name: 'Pretzel AI Server',
          enabled: true,
          showSettings: false,
          apiSettings: {},
          models: [{ name: 'pretzel-ai', enabled: true }]
        },
        {
          name: 'OpenAI',
          enabled: true,
          showSettings: true,
          apiSettings: {
            apiKey: {
              type: 'string',
              required: true,
              default: openAiSettings?.openAiApiKey || '',
              showSetting: true
            },
            baseUrl: {
              type: 'string',
              required: false,
              default: openAiSettings?.openAiBaseUrl || '',
              showSetting: false
            }
          },
          models: [
            {
              name: 'gpt-4-turbo',
              enabled: true,
              showSetting: true,
              settings: { maxTokens: { type: 'number', default: 2048, showSetting: false, required: false } }
            },
            {
              name: 'gpt-4o',
              enabled: true,
              showSetting: true,
              settings: { maxTokens: { type: 'number', default: 4096, showSetting: false, required: false } }
            }
          ]
        },
        {
          name: 'Azure',
          enabled: true,
          showSettings: true,
          apiSettings: {
            apiKey: {
              type: 'string',
              required: true,
              default: azureSettings?.azureApiKey || '',
              showSetting: true
            },
            baseUrl: {
              type: 'string',
              required: true,
              default: azureSettings?.azureBaseUrl || '',
              showSetting: true
            },
            deploymentName: {
              type: 'string',
              required: true,
              default: azureSettings?.azureDeploymentName || '',
              showSetting: true
            }
          },
          models: [
            {
              name: 'gpt-4',
              enabled: true,
              showSetting: true
            },
            {
              name: 'gpt-35-turbo',
              enabled: true,
              showSetting: true
            }
          ]
        }
      ]
    };
    await settings.set('pretzelSettingsJSON', newSettings);
  }
}
