import { Injectable, OnModuleInit } from '@nestjs/common';
import * as ort from 'onnxruntime-node';
import * as path from 'path';
import * as fs from 'fs';
import { AppLogger } from '../../../common/configs/logger/logger.service';

interface TokenizerConfig {
  model: {
    vocab: Record<string, number>;
  };
}

// 噪声与有意义消息分类的原型文本
const NOISE_PROTOTYPES = [
  'hi',
  'hello',
  'hey',
  'ok',
  'lol',
  'haha',
  'yes',
  'no',
  'thanks',
  'ty',
  'np',
  'brb',
  'omg',
  'wow',
  'nice',
  'cool',
  'sure',
  'yeah',
  'nah',
  'bye',
  'gn',
  'gm',
  'gg',
  'rip',
  'f',
  'idk',
  'nvm',
  'k',
  'hmm',
  'yep',
];

const MEANINGFUL_PROTOTYPES = [
  'I think we should use PostgreSQL instead of MongoDB for this project',
  'The meeting is at 3pm tomorrow, bring the Q3 report',
  'Remember to update the API documentation before the release',
  'The bug is caused by a race condition in the message handler',
  'I prefer dark mode and want notifications only for mentions',
  'We need to migrate the database before deploying version 2.0',
  'The deployment pipeline uses Docker containers with Kubernetes',
  'Can you review my pull request for the authentication module',
  'The performance test shows 200ms latency which is too high',
  'My favorite programming language is TypeScript for web development',
  'The server crashed because of an out of memory error at midnight',
  'Please schedule the code review meeting for next Wednesday',
  'The design document outlines the new microservice architecture',
  'I found a security vulnerability in the login endpoint',
  'The user feedback suggests we need to improve the search feature',
];

@Injectable()
export class EmbeddingModelService implements OnModuleInit {
  private session: ort.InferenceSession | null = null;
  private vocab: Map<string, number> = new Map();
  private maxSeqLength = 128;
  private embeddingDim = 384;

  // 特殊 token IDs
  private clsTokenId = 101;
  private sepTokenId = 102;
  private padTokenId = 0;
  private unkTokenId = 100;

  private noiseCentroid: Float32Array | null = null;
  private meaningCentroid: Float32Array | null = null;

  constructor(private readonly logger: AppLogger) {}

  async onModuleInit(): Promise<void> {
    const modelsBase = process.env.MODELS_DIR
      ? process.env.MODELS_DIR
      : path.resolve(__dirname, '../../../apps/backend/models');
    const modelDir = path.join(modelsBase, 'minilm-onnx');
    const modelPath = path.join(modelDir, 'model.onnx');
    const tokenizerPath = path.join(modelDir, 'tokenizer.json');

    if (!fs.existsSync(modelPath) || !fs.existsSync(tokenizerPath)) {
      this.logger.warn(
        `[EmbeddingModel] Model files not found at ${modelDir}, embedding disabled`,
      );
      return;
    }

    try {
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      const tokenizerJson: TokenizerConfig = JSON.parse(
        fs.readFileSync(tokenizerPath, 'utf-8'),
      );
      if (tokenizerJson.model?.vocab) {
        for (const [token, id] of Object.entries(tokenizerJson.model.vocab)) {
          this.vocab.set(token, id);
        }
      }

      this.logger.log(
        `[EmbeddingModel] Loaded MiniLM ONNX model (vocab size: ${this.vocab.size})`,
      );

      await this.computePrototypes();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[EmbeddingModel] Failed to load model: ${msg}`);
      this.session = null;
    }
  }

  isAvailable(): boolean {
    return (
      this.session !== null &&
      this.noiseCentroid !== null &&
      this.meaningCentroid !== null
    );
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (!this.session) return null;

    const { inputIds, attentionMask } = this.tokenize(text);

    const inputIdsTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(inputIds.map(BigInt)),
      [1, inputIds.length],
    );
    const attentionMaskTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(attentionMask.map(BigInt)),
      [1, attentionMask.length],
    );
    const tokenTypeIdsTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(new Array(inputIds.length).fill(0).map(BigInt)),
      [1, inputIds.length],
    );

    const feeds: Record<string, ort.Tensor> = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    };

    const results = await this.session.run(feeds);

    const outputKey = this.session.outputNames[0];
    const rawOutput = results[outputKey].data as Float32Array;
    const dims = results[outputKey].dims; // [1, seqLen, hiddenSize]
    const seqLen = Number(dims[1]);
    const hiddenSize = Number(dims[2]);

    // 平均池化：对非填充 token 取平均值
    const embedding = new Float32Array(hiddenSize);
    let validTokens = 0;

    for (let t = 0; t < seqLen; t++) {
      if (attentionMask[t] === 1) {
        for (let h = 0; h < hiddenSize; h++) {
          embedding[h] += rawOutput[t * hiddenSize + h];
        }
        validTokens++;
      }
    }

    if (validTokens > 0) {
      for (let h = 0; h < hiddenSize; h++) {
        embedding[h] /= validTokens;
      }
    }

    // L2 norm
    return l2Normalize(embedding);
  }

  // 使用跟 prototype 距离判断质量
  async classifyQuality(text: string): Promise<number> {
    if (!this.isAvailable()) return 0.5;

    const embedding = await this.embed(text);
    if (!embedding) return 0.5;

    const noiseSim = cosineSimilarity(embedding, this.noiseCentroid);
    const meaningSim = cosineSimilarity(embedding, this.meaningCentroid);

    // softmax
    const expNoise = Math.exp(noiseSim * 3);
    const expMeaning = Math.exp(meaningSim * 3);
    return expMeaning / (expNoise + expMeaning);
  }

  // 计算余弦相似度
  async computeSemanticDensity(texts: string[]): Promise<number> {
    if (!this.isAvailable() || texts.length === 0) return 0;

    const embeddings: Float32Array[] = [];
    for (const text of texts) {
      const emb = await this.embed(text);
      if (emb) embeddings.push(emb);
    }

    if (embeddings.length <= 1) return 0;

    const centroid = new Float32Array(this.embeddingDim);
    for (const emb of embeddings) {
      for (let i = 0; i < this.embeddingDim; i++) {
        centroid[i] += emb[i];
      }
    }
    for (let i = 0; i < this.embeddingDim; i++) {
      centroid[i] /= embeddings.length;
    }

    let totalDist = 0;
    for (const emb of embeddings) {
      totalDist += 1 - cosineSimilarity(emb, centroid);
    }

    return totalDist / embeddings.length;
  }

  private async computePrototypes(): Promise<void> {
    this.logger.log('[EmbeddingModel] Computing prototype centroids...');

    const noiseEmbeddings: Float32Array[] = [];
    for (const text of NOISE_PROTOTYPES) {
      const emb = await this.embed(text);
      if (emb) noiseEmbeddings.push(emb);
    }

    const meaningEmbeddings: Float32Array[] = [];
    for (const text of MEANINGFUL_PROTOTYPES) {
      const emb = await this.embed(text);
      if (emb) meaningEmbeddings.push(emb);
    }

    if (noiseEmbeddings.length > 0) {
      this.noiseCentroid = computeCentroid(noiseEmbeddings, this.embeddingDim);
    }
    if (meaningEmbeddings.length > 0) {
      this.meaningCentroid = computeCentroid(
        meaningEmbeddings,
        this.embeddingDim,
      );
    }

    this.logger.log(
      `[EmbeddingModel] Prototypes ready (noise: ${noiseEmbeddings.length}, meaning: ${meaningEmbeddings.length})`,
    );
  }

  private tokenize(text: string): {
    inputIds: number[];
    attentionMask: number[];
  } {
    const tokens = this.wordPieceTokenize(text.toLowerCase());
    const maxTokens = this.maxSeqLength - 2;
    const truncated = tokens.slice(0, maxTokens);

    const inputIds: number[] = [this.clsTokenId];
    for (const token of truncated) {
      inputIds.push(this.vocab.get(token) ?? this.unkTokenId);
    }
    inputIds.push(this.sepTokenId);

    const attentionMask: number[] = new Array(inputIds.length).fill(1);
    while (inputIds.length < this.maxSeqLength) {
      inputIds.push(this.padTokenId);
      attentionMask.push(0);
    }

    return { inputIds, attentionMask };
  }

  private wordPieceTokenize(text: string): string[] {
    const tokens: string[] = [];
    const words = text
      .replace(/([^\w\s])/g, ' $1 ')
      .split(/\s+/)
      .filter(Boolean);

    for (const word of words) {
      let remaining = word;
      let isFirst = true;

      while (remaining.length > 0) {
        let found = false;
        for (let end = remaining.length; end > 0; end--) {
          const sub = isFirst
            ? remaining.slice(0, end)
            : `##${remaining.slice(0, end)}`;
          if (this.vocab.has(sub)) {
            tokens.push(sub);
            remaining = remaining.slice(end);
            isFirst = false;
            found = true;
            break;
          }
        }
        if (!found) {
          tokens.push('[UNK]');
          break;
        }
      }
    }

    return tokens;
  }
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function l2Normalize(vec: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) {
    norm += vec[i] * vec[i];
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  const result = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    result[i] = vec[i] / norm;
  }
  return result;
}

function computeCentroid(
  embeddings: Float32Array[],
  dim: number,
): Float32Array {
  const centroid = new Float32Array(dim);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }
  return l2Normalize(centroid);
}
