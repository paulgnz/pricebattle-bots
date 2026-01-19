import { AIClient, AIConfig } from '../types';
import { ClaudeClient } from './claude';
import { OpenAIClient } from './openai';
import { Logger } from '../utils';

export { ClaudeClient } from './claude';
export { OpenAIClient } from './openai';
export * from './prompts';
export * from './client';

/**
 * Create an AI client based on configuration
 */
export function createAIClient(config: AIConfig, logger?: Logger): AIClient {
  const options = {
    model: config.model,
    maxTokens: config.maxTokens,
    logger,
  };

  switch (config.provider) {
    case 'claude':
      return new ClaudeClient(config.apiKey, options);
    case 'openai':
      return new OpenAIClient(config.apiKey, options);
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`);
  }
}
