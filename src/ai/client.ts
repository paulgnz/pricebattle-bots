import { AIAnalysis, AcceptAnalysis, AIClient } from '../types';
import { Logger } from '../utils';

/**
 * Parse AI response to extract JSON
 */
export function parseJSONResponse<T>(text: string): T {
  // Try to find JSON in the response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON object found in response');
  }

  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch (e) {
    throw new Error(`Failed to parse JSON: ${e}`);
  }
}

/**
 * Validate prediction response
 */
export function validatePrediction(data: any): AIAnalysis {
  if (!data.direction || !['UP', 'DOWN', 'NEUTRAL'].includes(data.direction)) {
    throw new Error('Invalid direction in AI response');
  }

  if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 100) {
    throw new Error('Invalid confidence in AI response');
  }

  return {
    direction: data.direction,
    confidence: data.confidence,
    reasoning: data.reasoning || '',
    recommendedDuration: data.duration_seconds || 3600,
    suggestedStake: data.stake_percent || 3,
  };
}

/**
 * Validate accept response
 */
export function validateAccept(data: any): AcceptAnalysis {
  if (typeof data.accept !== 'boolean') {
    throw new Error('Invalid accept value in AI response');
  }

  return {
    accept: data.accept,
    confidence: data.confidence || 50,
    reasoning: data.reasoning || '',
  };
}

/**
 * Base class for AI clients with common functionality
 */
export abstract class BaseAIClient implements AIClient {
  protected logger?: Logger;

  constructor(logger?: Logger) {
    this.logger = logger;
  }

  abstract analyze(prompt: string): Promise<AIAnalysis>;
  abstract evaluateAccept(prompt: string): Promise<AcceptAnalysis>;

  protected logRequest(prompt: string): void {
    this.logger?.debug('AI request', {
      promptLength: prompt.length,
    });
  }

  protected logResponse(response: string): void {
    this.logger?.debug('AI response', {
      responseLength: response.length,
    });
  }
}
