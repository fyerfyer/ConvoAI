import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { EmbeddingService } from './embedding.service';
import { QdrantService } from './qdrant.service';
import {
  AgentContextMessage,
  RagContextEntry,
  MEMORY_DEFAULTS,
} from '@discord-platform/shared';
import { AppLogger } from '../../../common/configs/logger/logger.service';

@Injectable()
export class RagService {
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly logger: AppLogger,
  ) {}

  isEnabled(): boolean {
    return this.embeddingService.isEnabled() && this.qdrantService.isEnabled();
  }

  async indexConversation(
    botId: string,
    channelId: string,
    guildId: string,
    messages: AgentContextMessage[],
  ): Promise<number> {
    if (!this.isEnabled() || messages.length === 0) return 0;

    try {
      //  将消息分成大致 5 块
      // TODO：之后可以用更精准的分块方式
      const chunks = this.chunkMessages(messages, 5);
      const texts = chunks.map((chunk) =>
        chunk.map((m) => `[${m.author}]: ${m.content}`).join('\n'),
      );

      if (texts.length === 0) return 0;

      const embeddings = await this.embeddingService.embedBatch(texts);

      const points = embeddings.map((emb) => ({
        id: randomUUID(),
        vector: emb.embedding,
        payload: {
          botId,
          channelId,
          guildId,
          content: texts[emb.index],
          messageCount: chunks[emb.index].length,
          timestamp:
            chunks[emb.index][chunks[emb.index].length - 1]?.timestamp ||
            new Date().toISOString(),
          firstMessageId: chunks[emb.index][0]?.messageId || '',
          lastMessageId:
            chunks[emb.index][chunks[emb.index].length - 1]?.messageId || '',
        },
      }));

      await this.qdrantService.upsert(points);

      this.logger.debug(
        `[RagService] Indexed ${points.length} conversation chunks for bot ${botId} in channel ${channelId}`,
      );

      return points.length;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[RagService] Indexing failed: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }

  async searchRelevantContext(
    query: string,
    botId: string,
    guildId: string,
    channelId?: string,
    limit = MEMORY_DEFAULTS.RAG_TOP_K,
  ): Promise<RagContextEntry[]> {
    if (!this.isEnabled()) return [];

    try {
      const queryVector = await this.embeddingService.embed(query);

      const results = await this.qdrantService.search(
        queryVector,
        { botId, guildId },
        limit,
      );

      return results.map((r) => ({
        content: String(r.payload.content || ''),
        score: r.score,
        channelId: String(r.payload.channelId || channelId || ''),
        timestamp: String(r.payload.timestamp || ''),
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[RagService] Search failed: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  async deleteByBot(botId: string): Promise<void> {
    await this.qdrantService.deleteByFilter({ botId });
  }

  async deleteByChannel(botId: string, channelId: string): Promise<void> {
    await this.qdrantService.deleteByFilter({ botId, channelId });
  }

  private chunkMessages(
    messages: AgentContextMessage[],
    chunkSize: number,
  ): AgentContextMessage[][] {
    const chunks: AgentContextMessage[][] = [];
    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize));
    }
    return chunks;
  }
}
