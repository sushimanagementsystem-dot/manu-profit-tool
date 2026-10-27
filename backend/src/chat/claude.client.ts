import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';

import { Problems } from '../common/problem';
import type { AppConfig } from '../config/env.schema';
import { InjectConfig } from '../config/config.module';

export type ChatTurn = Anthropic.Beta.Messages.BetaMessageParam;
export type ChatResponse = Anthropic.Beta.Messages.BetaMessage;

const MAX_TOKENS = 4096;
/** Picks Anthropic's recommended substitute model when a safety classifier declines a request. */
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Thin wrapper over the Messages API for the chat assistant: one place for the model, the
 * token ceiling, refusal handling and error translation.
 */
@Injectable()
export class ClaudeClient {
  private readonly logger = new Logger(ClaudeClient.name);
  private readonly client: Anthropic | null;

  constructor(@InjectConfig() private readonly config: AppConfig) {
    this.client = config.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: config.ANTHROPIC_API_KEY }) : null;
  }

  get isConfigured(): boolean {
    return this.client !== null;
  }

  async send(options: {
    system: Anthropic.Beta.Messages.BetaTextBlockParam[];
    tools: Anthropic.Beta.Messages.BetaToolUnion[];
    messages: ChatTurn[];
  }): Promise<ChatResponse> {
    if (!this.client) {
      throw Problems.aiUnavailable('The assistant is not configured on this server.');
    }
    try {
      const response = await this.client.beta.messages.create({
        model: this.config.CHAT_MODEL,
        max_tokens: MAX_TOKENS,
        // Thinking is always on for this model family; effort is the cost/quality control.
        output_config: { effort: this.config.CHAT_EFFORT },
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        system: options.system,
        tools: options.tools,
        messages: options.messages,
      });

      if (response.stop_reason === 'refusal') {
        throw Problems.aiUnavailable('The assistant could not answer that request. Try rephrasing it.');
      }
      return response;
    } catch (error) {
      throw this.translate(error);
    }
  }

  private translate(error: unknown): unknown {
    if (error instanceof Anthropic.RateLimitError) {
      return Problems.aiUnavailable('The assistant is busy right now. Please try again in a moment.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return Problems.aiUnavailable('The assistant could not be reached. Please try again.');
    }
    if (error instanceof Anthropic.APIError) {
      this.logger.error({ status: error.status }, error.message);
      return Problems.aiUnavailable('The assistant is unavailable right now. Please try again.');
    }
    return error;
  }
}
