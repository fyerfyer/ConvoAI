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
      // 智能分块：基于时间间隔 + 字符长度 + 说话轮次综合切分
      const chunks = this.chunkMessages(messages);
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

      // channelId 为可选过滤条件：传入时限制为频道内检索，否则 guild 全局共享
      const filters: { botId: string; guildId: string; channelId?: string } = {
        botId,
        guildId,
      };
      if (channelId) {
        filters.channelId = channelId;
      }

      const results = await this.qdrantService.search(
        queryVector,
        filters,
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

  /**
   * 智能分块策略：
   * 1. 时间间隔 > 30 分钟 → 强制拆分（大概率话题切换）
   * 2. 字符长度软上限 800 + 说话人切换 → 拆分
   * 3. 硬上限 10 条 / 软下限 2 条，避免过大或过碎的 chunk
   */
  private chunkMessages(
    messages: AgentContextMessage[],
  ): AgentContextMessage[][] {
    if (messages.length === 0) return [];

    const TIME_GAP_MS = 30 * 60 * 1000;
    const MAX_CHUNK_CHARS = 800;
    const MIN_MESSAGES = 2;
    const MAX_MESSAGES = 10;

    const chunks: AgentContextMessage[][] = [];
    let current: AgentContextMessage[] = [messages[0]];
    let currentChars = messages[0].content.length;

    for (let i = 1; i < messages.length; i++) {
      const msg = messages[i];
      const prev = messages[i - 1];
      const msgChars = msg.content.length;

      // 时间间隔检测
      const prevTime = new Date(prev.timestamp).getTime();
      const curTime = new Date(msg.timestamp).getTime();
      const hasTimeGap =
        !isNaN(prevTime) && !isNaN(curTime) && curTime - prevTime > TIME_GAP_MS;

      // 硬上限
      const atMaxMessages = current.length >= MAX_MESSAGES;

      // 字符超限 + 说话人切换（在说话人切换处拆分更自然）
      const speakerChanged =
        (msg.authorId || msg.author) !== (prev.authorId || prev.author);
      const wouldExceedSize =
        currentChars + msgChars > MAX_CHUNK_CHARS &&
        current.length >= MIN_MESSAGES;

      const shouldSplit =
        hasTimeGap || atMaxMessages || (wouldExceedSize && speakerChanged);

      if (shouldSplit && current.length >= MIN_MESSAGES) {
        chunks.push(current);
        current = [msg];
        currentChars = msgChars;
      } else {
        current.push(msg);
        currentChars += msgChars;
      }
    }

    if (current.length > 0) {
      // 尾部过短则并入前一个 chunk（不超过硬上限）
      if (
        current.length < MIN_MESSAGES &&
        chunks.length > 0 &&
        chunks[chunks.length - 1].length + current.length <= MAX_MESSAGES
      ) {
        chunks[chunks.length - 1].push(...current);
      } else {
        chunks.push(current);
      }
    }

    return chunks;
  }
}
