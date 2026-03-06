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

export interface ToxicityResult {
  toxicScore: number;
  isToxic: boolean;
  maxScore: number;
  maxLabel: string;
}

// 使用 textdetox/bert-multilingual-toxicity-classifier 处理分类
// ONNX CPU 推理
@Injectable()
export class ToxicityModelService implements OnModuleInit {
  private session: ort.InferenceSession | null = null;
  private vocab: Map<string, number> = new Map();
  private defaultThreshold = 0.5;
  private maxSeqLength = 128;

  private clsTokenId = 101; // [CLS]
  private sepTokenId = 102; // [SEP]
  private padTokenId = 0; // [PAD]
  private unkTokenId = 100; // [UNK]

  constructor(private readonly logger: AppLogger) {}

  async onModuleInit(): Promise<void> {
    const modelsBase = process.env.MODELS_DIR
      ? process.env.MODELS_DIR
      : path.resolve(__dirname, '../../../apps/backend/models');
    const modelDir = path.join(modelsBase, 'toxic-bert-onnx');
    const modelPath = path.join(modelDir, 'model.onnx');
    const tokenizerPath = path.join(modelDir, 'tokenizer.json');

    if (!fs.existsSync(modelPath) || !fs.existsSync(tokenizerPath)) {
      this.logger.warn(
        `[ToxicityModel] Model files not found at ${modelDir}, toxicity detection disabled`,
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
        `[ToxicityModel] Loaded toxic-bert ONNX model (vocab size: ${this.vocab.size})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[ToxicityModel] Failed to load model: ${msg}`);
      this.session = null;
    }
  }

  isAvailable(): boolean {
    return this.session !== null && this.vocab.size > 0;
  }

  async classify(
    text: string,
    threshold?: number,
  ): Promise<ToxicityResult | null> {
    if (!this.session) return null;

    const effectiveThreshold = threshold ?? this.defaultThreshold;

    // Tokenize
    const { inputIds, attentionMask } = this.tokenize(text);

    // 创建 tensors
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

    const tokenTypeIds = new Array(inputIds.length).fill(0);
    const tokenTypeIdsTensor = new ort.Tensor(
      'int64',
      BigInt64Array.from(tokenTypeIds.map(BigInt)),
      [1, tokenTypeIds.length],
    );

    const feeds: Record<string, ort.Tensor> = {
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
      token_type_ids: tokenTypeIdsTensor,
    };

    // inference
    const results = await this.session.run(feeds);

    // logits
    // [not_toxic, toxic]
    const outputKey = this.session.outputNames[0];
    const logits = results[outputKey].data as Float32Array;

    const expA = Math.exp(logits[0]);
    const expB = Math.exp(logits[1]);
    const toxicScore = expB / (expA + expB);
    const maxLabel = toxicScore >= 0.5 ? 'toxic' : 'not_toxic';

    return {
      toxicScore,
      isToxic: toxicScore >= effectiveThreshold,
      maxScore: toxicScore,
      maxLabel,
    };
  }

  /**
   * 多语言 BERT 的 WordPiece Tokenizer。
   * 不进行小写转换（mBERT 区分大小写），并在 CJK 字符周围添加空格，
   * 使每个汉字都成为独立的 token
   */

  //
  private tokenize(text: string): {
    inputIds: number[];
    attentionMask: number[];
  } {
    const tokens = this.wordPieceTokenize(addSpacesAroundCjk(text));

    const maxTokens = this.maxSeqLength - 2;
    const truncated = tokens.slice(0, maxTokens);

    // input_ids: [CLS] + tokens + [SEP] + padding
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
      .replace(/([^\w\s\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF])/g, ' $1 ')
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

// mirror BertNormalizer handle_chinese_chars=True
function addSpacesAroundCjk(text: string): string {
  return text.replace(
    /[\u2E80-\u2EFF\u2F00-\u2FDF\u3000-\u303F\u31C0-\u31EF\u3200-\u32FF\u3300-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F]/g,
    ' $& ',
  );
}
