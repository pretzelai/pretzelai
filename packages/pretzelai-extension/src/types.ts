/*
 * Copyright (c) Pretzel AI GmbH.
 * This file is part of the Pretzel project and is licensed under the
 * GNU Affero General Public License version 3.
 * See the LICENSE_AGPLv3 file at the root of the project for the full license text.
 * Contributions by contributors listed in the PRETZEL_CONTRIBUTORS file (found at
 * the root of the project) are licensed under AGPLv3.
 */

import OpenAI from 'openai';
import { OpenAIClient } from '@azure/openai';
import MistralClient from '@mistralai/mistralai';
import { INotebookTracker } from '@jupyterlab/notebook';
import { JupyterFrontEnd } from '@jupyterlab/application';
import { Dispatch, SetStateAction } from 'react';

export type AIClient = OpenAI | OpenAIClient | MistralClient | null;

export interface AIMessage {
  id: string;
  content: string | MessageContent[];
  role: 'user' | 'assistant' | 'system';
}

export type MessageContent = TextContent | ImageContent;

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image';
  data: string;
}

export interface ModelInfo {
  name: string;
  enabled: boolean;
  showSetting: boolean;
  settings?: Record<string, any>;
}

export interface APISetting {
  type: string;
  required: boolean;
  default: string | number;
  value: string | number;
  showSetting: boolean;
}

export interface ProviderSettings {
  name: string;
  enabled: boolean;
  showSettings: boolean;
  apiSettings: Record<string, APISetting>;
  models: Record<string, ModelInfo>;
}

export interface FeatureSettings {
  enabled: boolean;
  modelProvider: string;
  modelString: string;
  codeMatchThreshold?: number;
}

export interface PretzelSettingsType {
  version: string;
  features: {
    inlineCompletion: FeatureSettings;
    aiChat: FeatureSettings;
    posthogTelemetry: {
      posthogPromptTelemetry: { enabled: boolean };
      posthogGeneralTelemetry: { enabled: boolean };
    };
    connections: {
      postgres: {
        enabled: boolean;
        host: string;
        port: number;
        database: string;
        username: string;
        password: string;
      };
    };
  };
  providers: Record<string, ProviderSettings>;
}

export interface ChatAIStreamParams {
  aiChatModelProvider: string;
  aiChatModelString: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  mistralApiKey?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  groqApiKey?: string;
  renderChat: (message: string) => void;
  messages: AIMessage[];
  topSimilarities: string[];
  activeCellCode?: string;
  selectedCode?: string;
  setReferenceSource: Dispatch<SetStateAction<string>>;
  setIsAiGenerating: (isGenerating: boolean) => void;
  signal: AbortSignal;
  notebookTracker: INotebookTracker | null;
}

export interface GenerateAIStreamParams {
  aiChatModelProvider: string;
  aiChatModelString: string;
  aiClient: AIClient;
  embeddings: Embedding[];
  userInput: string;
  base64Images: string[];
  oldCodeForPrompt: string;
  traceback: string;
  notebookTracker: INotebookTracker;
  codeMatchThreshold: number;
  numberOfSimilarCells: number;
  posthogPromptTelemetry: boolean;
  openAiApiKey: string;
  openAiBaseUrl: string;
  azureBaseUrl: string;
  azureApiKey: string;
  deploymentId: string;
  mistralApiKey: string;
  mistralModel: string;
  anthropicApiKey: string;
  ollamaBaseUrl: string;
  groqApiKey: string;
  isInject: boolean;
}

export interface Embedding {
  id: string;
  source: string;
  hash: string;
  embedding: number[];
}

export type PromptMessageItem = { type: 'text'; text: string } | { type: 'image'; data: string };

export type PromptMessage = [{ type: 'text'; text: string }, ...PromptMessageItem[]];

export interface FixedSizeStack<T> {
  stack: T[];
  maxSize: number;
  startSentinel: T;
  endSentinel: T;
  push(item: T): void;
  length: number;
  stackWithoutSentinels: T[];
  get(index: number): T;
  isFull(): boolean;
}

export interface StreamParams {
  aiChatModelProvider: string;
  aiChatModelString: string;
  openAiApiKey?: string;
  openAiBaseUrl?: string;
  prompt: string;
  base64Images: string[];
  azureBaseUrl?: string;
  azureApiKey?: string;
  deploymentId?: string;
  mistralApiKey?: string;
  mistralModel?: string;
  anthropicApiKey?: string;
  ollamaBaseUrl?: string;
  groqApiKey?: string;
}
