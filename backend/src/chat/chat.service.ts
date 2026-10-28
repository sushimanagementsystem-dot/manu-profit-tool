import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';

import { Problems } from '../common/problem';
import { SnapshotService } from '../costing/snapshot.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildJobContext, CHAT_SYSTEM_PROMPT } from './chat.prompt';
import { ChatToolExecutor } from './chat-tool.executor';
import { buildToolDefinitions } from './chat.tools';
import { ClaudeClient, type ChatResponse, type ChatTurn } from './claude.client';

/** Per-job limits that bound the cost of one analysis. */
const MAX_USER_MESSAGES = 50;
const MAX_TOOL_ITERATIONS = 8;
/** Stored messages replayed to the model; older ones remain in the database for the UI. */
const HISTORY_WINDOW = 12;

type ProposalInfo = { revisionId: string; summary: string };

export type ChatMessageView = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: Date;
  proposal: (ProposalInfo & { status: string }) | null;
};

export type ChatReply = {
  message: ChatMessageView;
  /** Set when the assistant prepared a change the client must confirm. */
  proposal: (ProposalInfo & { impact: unknown }) | null;
};

/**
 * The assistant's turn loop: read history, call the model, run the tools it asks for, and
 * store the exchange. Each stored message keeps the exact API turns it produced — including
 * tool calls and their results — so history is replayed verbatim and only ever appended to,
 * which keeps the model's reasoning valid and the prompt cache warm.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly tools = buildToolDefinitions();

  constructor(
    private readonly prisma: PrismaService,
    private readonly claude: ClaudeClient,
    private readonly executor: ChatToolExecutor,
    private readonly snapshots: SnapshotService,
  ) {}

  async history(jobId: string): Promise<ChatMessageView[]> {
    const [messages, proposals] = await Promise.all([
      this.prisma.chatMessage.findMany({ where: { jobId }, orderBy: { seq: 'asc' } }),
      this.prisma.revision.findMany({
        where: { jobId, proposedByMessageId: { not: null } },
        select: { id: true, proposedByMessageId: true, rationale: true, status: true },
      }),
    ]);
    const byMessage = new Map(proposals.map((proposal) => [proposal.proposedByMessageId, proposal]));

    return messages.map((message) => {
      const proposal = byMessage.get(message.id);
      return {
        id: message.id,
        role: message.role as 'USER' | 'ASSISTANT',
        content: message.content,
        createdAt: message.createdAt,
        proposal: proposal
          ? { revisionId: proposal.id, summary: proposal.rationale ?? '', status: proposal.status }
          : null,
      };
    });
  }

  async send(jobId: string, status: string, revision: number, text: string): Promise<ChatReply> {
    if (!this.claude.isConfigured) {
      throw Problems.aiUnavailable('The assistant is not configured on this server.');
    }
    if (status !== 'READY') {
      throw Problems.invalidState('The assistant is available once the analysis is ready.');
    }
    const asked = await this.prisma.chatMessage.count({ where: { jobId, role: 'USER' } });
    if (asked >= MAX_USER_MESSAGES) {
      throw Problems.invalidState(`This analysis has reached its limit of ${MAX_USER_MESSAGES} questions.`);
    }

    const stored = await this.prisma.chatMessage.findMany({ where: { jobId }, orderBy: { seq: 'asc' } });
    const nextSeq = stored.length ? stored[stored.length - 1].seq + 1 : 0;
    const lastSeenRevision = stored.length ? stored[stored.length - 1].revisionAtTime : null;
    const note = lastSeenRevision !== null && revision > lastSeenRevision ? await this.changesSince(jobId, lastSeenRevision, revision) : null;
    const userTurn = await this.storeUserMessage(jobId, nextSeq, revision, text, stored.length === 0, note);

    const history = stored.slice(-HISTORY_WINDOW).flatMap((message) => message.apiContent as unknown as ChatTurn[]);
    const messages: ChatTurn[] = [...history, userTurn];

    const turnsBefore = messages.length;
    const { response, proposal } = await this.runToolLoop(jobId, revision, messages);
    const producedTurns = messages.slice(turnsBefore);

    const message = await this.storeAssistantMessage(jobId, nextSeq + 1, revision, producedTurns, response, proposal);
    return { message, proposal: proposal ? { ...proposal.info, impact: proposal.impact } : null };
  }

  /** Calls the model, runs any tools it asks for, and repeats until it answers in text. */
  private async runToolLoop(
    jobId: string,
    revision: number,
    messages: ChatTurn[],
  ): Promise<{ response: ChatResponse; proposal?: { info: ProposalInfo; impact: unknown } }> {
    const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
      { type: 'text', text: CHAT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ];
    let proposal: { info: ProposalInfo; impact: unknown } | undefined;

    for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
      const response = await this.claude.send({ system, tools: this.tools, messages });
      messages.push({ role: 'assistant', content: response.content });

      const toolUses = response.content.filter(
        (block): block is Anthropic.Beta.Messages.BetaToolUseBlock => block.type === 'tool_use',
      );
      if (response.stop_reason !== 'tool_use' || !toolUses.length) return { response, proposal };

      const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const outcome = await this.executor.execute(toolUse.name, toolUse.input, { jobId, revision });
        if (outcome.proposal) {
          proposal = { info: outcome.proposal, impact: (outcome.result as { impact?: unknown }).impact };
        }
        results.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: JSON.stringify(outcome.result),
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }
      messages.push({ role: 'user', content: results });
    }

    this.logger.warn({ jobId }, 'Chat tool loop hit its iteration limit');
    throw Problems.aiUnavailable('The assistant could not complete that request. Try asking it more simply.');
  }

  /**
   * What changed in the analysis since the assistant last saw it, whoever changed it: the client
   * editing the table, or a change confirmed from the chat. Without this the assistant would go on
   * quoting figures from earlier in the conversation that no longer hold.
   */
  private async changesSince(jobId: string, from: number, to: number): Promise<string> {
    const revisions = await this.prisma.revision.findMany({
      where: { jobId, status: 'APPROVED', number: { gt: from, lte: to } },
      orderBy: { number: 'asc' },
      select: { appliedDiff: true },
    });
    const changes = revisions.flatMap((revision) =>
      ((revision.appliedDiff as unknown as { description: string }[] | null) ?? []).map((effect) => effect.description),
    );
    return (
      `[System note, not from the user: the analysis changed since your last reply (revision ${from} to ${to}).` +
      (changes.length ? ` Changes: ${changes.slice(0, 20).join('; ')}.` : '') +
      ' Figures you quoted earlier may be out of date; look them up again with your tools before answering.]'
    );
  }

  /** The job summary rides along with the first question, keeping the system prompt cacheable. */
  private async storeUserMessage(
    jobId: string,
    seq: number,
    revision: number,
    text: string,
    withContext: boolean,
    note: string | null = null,
  ): Promise<ChatTurn> {
    const context = withContext ? `${buildJobContext((await this.snapshots.get(jobId)).payload)}\n\n---\n\n` : '';
    const content = `${context}${note ? `${note}\n\n---\n\n` : ''}${text}`;
    const turn: ChatTurn = { role: 'user', content };
    await this.prisma.chatMessage.create({
      data: {
        jobId,
        seq,
        role: 'USER',
        content: text,
        apiContent: [turn] as never,
        revisionAtTime: revision,
      },
    });
    return turn;
  }

  private async storeAssistantMessage(
    jobId: string,
    seq: number,
    revision: number,
    producedTurns: ChatTurn[],
    response: ChatResponse,
    proposal?: { info: ProposalInfo },
  ): Promise<ChatMessageView> {
    const text = response.content
      .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    const message = await this.prisma.chatMessage.create({
      data: {
        jobId,
        seq,
        role: 'ASSISTANT',
        content: text || 'I could not produce an answer for that.',
        apiContent: producedTurns as never,
        revisionAtTime: revision,
        usage: {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      },
    });

    if (proposal) {
      await this.prisma.revision.update({
        where: { id: proposal.info.revisionId },
        data: { proposedByMessageId: message.id },
      });
    }
    return {
      id: message.id,
      role: 'ASSISTANT',
      content: message.content,
      createdAt: message.createdAt,
      proposal: proposal ? { ...proposal.info, status: 'PROPOSED' } : null,
    };
  }
}
