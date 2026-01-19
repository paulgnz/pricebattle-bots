import OpenAI from 'openai';
import { AIAnalysis, AcceptAnalysis } from '../types';
import { Logger } from '../utils';
import {
  BaseAIClient,
  parseJSONResponse,
  validatePrediction,
  validateAccept,
} from './client';

export class OpenAIClient extends BaseAIClient {
  private client: OpenAI;
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
    this.client = new OpenAI({ apiKey });
    this.model = options.model || 'gpt-4o';
    this.maxTokens = options.maxTokens || 1024;
  }

  async analyze(prompt: string): Promise<AIAnalysis> {
    this.logRequest(prompt);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content || '';

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
      this.logger?.error('OpenAI API error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async evaluateAccept(prompt: string): Promise<AcceptAnalysis> {
    this.logRequest(prompt);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const text = response.choices[0]?.message?.content || '';

      this.logResponse(text);

      const data = parseJSONResponse(text);
      const analysis = validateAccept(data);

      this.logger?.info('AI accept evaluation', {
        accept: analysis.accept,
        confidence: analysis.confidence,
      });

      return analysis;
    } catch (error) {
      this.logger?.error('OpenAI API error', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
