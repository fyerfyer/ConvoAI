import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { AppLogger } from '../../../common/configs/logger/logger.service';
import { MEMORY_DEFAULTS } from '@discord-platform/shared';

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  payload: Record<string, unknown>;
}

@Injectable()
export class QdrantService implements OnModuleInit {
  private client!: QdrantClient;
  private collectionName!: string;
  private dimension!: number;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    const qdrantUrl =
      this.configService.get<string>('QDRANT_URL') || 'http://localhost:6333';
    this.collectionName =
      this.configService.get<string>('QDRANT_COLLECTION') || 'discord_memory';
    this.dimension =
      this.configService.get<number>('EMBEDDING_DIMENSION') || 1024;

    try {
      this.client = new QdrantClient({ url: qdrantUrl });

      await this.ensureCollection();
      this.enabled = true;

      this.logger.log(
        `[QdrantService] Connected to Qdrant at ${qdrantUrl}, collection: ${this.collectionName}`,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(
        `[QdrantService] Failed to connect to Qdrant: ${error.message}. Vector features disabled.`,
      );
      this.enabled = false;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async ensureCollection(): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName,
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.dimension,
            distance: 'Cosine',
          },
          optimizers_config: {
            default_segment_number: 2,
          },
          replication_factor: 1,
        });

        // 创建索引
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'botId',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'channelId',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'guildId',
          field_schema: 'keyword',
        });

        this.logger.log(
          `[QdrantService] Created collection "${this.collectionName}" with dimension ${this.dimension}`,
        );
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[QdrantService] Failed to ensure collection: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (!this.enabled || points.length === 0) return;

    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[QdrantService] Upsert failed: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async search(
    vector: number[],
    filters: {
      botId?: string;
      channelId?: string;
      guildId?: string;
    },
    limit = MEMORY_DEFAULTS.RAG_TOP_K,
    scoreThreshold = MEMORY_DEFAULTS.RAG_SCORE_THRESHOLD,
  ): Promise<SearchResult[]> {
    if (!this.enabled) return [];

    try {
      const must: Array<{
        key: string;
        match: { value: string };
      }> = [];

      if (filters.botId) {
        must.push({ key: 'botId', match: { value: filters.botId } });
      }
      if (filters.guildId) {
        must.push({ key: 'guildId', match: { value: filters.guildId } });
      }

      const results = await this.client.search(this.collectionName, {
        vector,
        limit,
        score_threshold: scoreThreshold,
        filter: must.length > 0 ? { must } : undefined,
        with_payload: true,
      });

      return results.map((r) => ({
        id: typeof r.id === 'string' ? r.id : String(r.id),
        score: r.score,
        payload: (r.payload ?? {}) as Record<string, unknown>,
      }));
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[QdrantService] Search failed: ${error.message}`,
        error.stack,
      );
      return [];
    }
  }

  async deleteByFilter(filters: {
    botId?: string;
    channelId?: string;
    guildId?: string;
  }): Promise<void> {
    if (!this.enabled) return;

    const must: Array<{
      key: string;
      match: { value: string };
    }> = [];

    if (filters.botId) {
      must.push({ key: 'botId', match: { value: filters.botId } });
    }
    if (filters.channelId) {
      must.push({ key: 'channelId', match: { value: filters.channelId } });
    }
    if (filters.guildId) {
      must.push({ key: 'guildId', match: { value: filters.guildId } });
    }

    if (must.length === 0) return;

    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: { must },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(
        `[QdrantService] Delete by filter failed: ${error.message}`,
        error.stack,
      );
    }
  }

  async countByFilter(filters: {
    botId?: string;
    channelId?: string;
    guildId?: string;
  }): Promise<number> {
    if (!this.enabled) return 0;

    const must: Array<{
      key: string;
      match: { value: string };
    }> = [];

    if (filters.botId) {
      must.push({ key: 'botId', match: { value: filters.botId } });
    }
    if (filters.channelId) {
      must.push({ key: 'channelId', match: { value: filters.channelId } });
    }
    if (filters.guildId) {
      must.push({ key: 'guildId', match: { value: filters.guildId } });
    }

    if (must.length === 0) return 0;

    try {
      const result = await this.client.count(this.collectionName, {
        filter: { must },
        exact: true,
      });
      return result?.count ?? 0;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(
        `[QdrantService] Count failed: ${error.message}`,
        error.stack,
      );
      return 0;
    }
  }
}
