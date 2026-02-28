import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { AppLogger } from '../../../common/configs/logger/logger.service';

export interface EmbeddingResult {
  embedding: number[];
  index: number;
}

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private baseUrl!: string;
  private apiKey!: string;
  private model!: string;
  private dimension!: number;
  private enabled = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly logger: AppLogger,
  ) {}

  onModuleInit() {
    this.baseUrl = (
      this.configService.get<string>('EMBEDDING_BASE_URL') || ''
    ).replace(/\/$/, '');
    this.apiKey = this.configService.get<string>('EMBEDDING_API_KEY') || '';
    this.model =
      this.configService.get<string>('EMBEDDING_MODEL') || 'text-embedding-v4';
    this.dimension =
      this.configService.get<number>('EMBEDDING_DIMENSION') || 1024;

    this.enabled = !!(this.baseUrl && this.apiKey);

    if (this.enabled) {
      this.logger.log(
        `[EmbeddingService] Initialized with model "${this.model}" (dim=${this.dimension}) at ${this.baseUrl}`,
      );
    } else {
      this.logger.warn(
        '[EmbeddingService] No EMBEDDING_BASE_URL/EMBEDDING_API_KEY configured. ' +
          'Embedding and RAG features will be disabled.',
      );
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getDimension(): number {
    return this.dimension;
  }

  async embed(text: string): Promise<number[]> {
    if (!this.enabled) {
      throw new Error('EmbeddingService is not configured');
    }

    const results = await this.embedBatch([text]);
    return results[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (!this.enabled) {
      throw new Error('EmbeddingService is not configured');
    }

    if (texts.length === 0) return [];

    const maxBatchSize = 10;
    const allResults: EmbeddingResult[] = [];

    for (let i = 0; i < texts.length; i += maxBatchSize) {
      const batch = texts.slice(i, i + maxBatchSize);

      try {
        const response = await this.httpService.axiosRef.post(
          `${this.baseUrl}/embeddings`,
          {
            model: this.model,
            input: batch.length === 1 ? batch[0] : batch,
            dimensions: this.dimension,
            encoding_format: 'float',
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`,
            },
            timeout: 30_000,
          },
        );

        const data = response.data?.data;
        if (!Array.isArray(data)) {
          this.logger.warn(
            '[EmbeddingService] Unexpected response format from embedding API',
          );
          continue;
        }

        for (const item of data) {
          allResults.push({
            embedding: item.embedding,
            index: i + item.index,
          });
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(
          `[EmbeddingService] Batch embedding failed: ${error.message}`,
          error.stack,
        );
        throw error;
      }
    }

    return allResults;
  }
}
