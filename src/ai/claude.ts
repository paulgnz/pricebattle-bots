import Anthropic from '@anthropic-ai/sdk';
import { AIAnalysis, AcceptAnalysis } from '../types';
import { Logger } from '../utils';
import {
  BaseAIClient,
  parseJSONResponse,
  validatePrediction,
  validateAccept,
} from './client';

export class ClaudeClient extends BaseAIClient {
  private client: Anthropic;
  private model: string;
  private maxTokens: number;

  constructor(
    apiKey: string,
    options: {
      model?: string;
      maxTokens?: number;
      logger?: Logger;
    } = {}
  ) {
    super(options.logger);
    this.client = new Anthropic({ apiKey });
    this.model = options.model || 'claude-sonnet-4-20250514';
    this.maxTokens = options.maxTokens || 1024;
  }

  async analyze(prompt: string): Promise<AIAnalysis> {
    this.logRequest(prompt);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';

      this.logResponse(text);

      const data = parseJSONResponse(text);
      const analysis = validatePrediction(data);

      this.logger?.info('AI prediction', {
        direction: analysis.direction,
        confidence: analysis.confidence,
        duration: analysis.recommendedDuration,
      });

      return analysis;
    } catch (error) {
      this.logger?.error('Claude API error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async evaluateAccept(prompt: string): Promise<AcceptAnalysis> {
    this.logRequest(prompt);

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text =
        response.content[0].type === 'text' ? response.content[0].text : '';

      this.logResponse(text);

      const data = parseJSONResponse(text);
      const analysis = validateAccept(data);

      this.logger?.info('AI accept evaluation', {
        accept: analysis.accept,
        confidence: analysis.confidence,
      });

      return analysis;
    } catch (error) {
      this.logger?.error('Claude API error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
