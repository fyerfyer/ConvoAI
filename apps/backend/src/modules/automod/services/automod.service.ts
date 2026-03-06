import { Injectable, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Redis from 'ioredis';
import { Types } from 'mongoose';

import { ToxicityModelService, ToxicityResult } from './toxicity-model.service';
import {
  AUTOMOD_ACTION,
  AUTOMOD_DEFAULTS,
  AUTOMOD_TRIGGER,
  AutoModActionType,
  AutoModTriggerType,
} from '@discord-platform/shared';
import { Guild, GuildModel } from '../../guild/schemas/guild.schema';
import { Member, MemberModel } from '../../member/schemas/member.schema';
import { AutoModLog, AutoModLogModel } from '../schemas/automod-log.schema';
import { REDIS_CLIENT } from '../../../common/configs/redis/redis.module';
import { AppLogger } from '../../../common/configs/logger/logger.service';
import {
  RedisKeys,
  CACHE_TTL,
} from '../../../common/constants/redis-keys.constant';

export interface AutoModVerdict {
  allowed: boolean;
  trigger?: AutoModTriggerType;
  reason?: string;
  actions: AutoModActionType[];
  toxicityScores?: ToxicityResult;
  muteDurationMs?: number;
}

export interface AutoModRule {
  enabled: boolean;
  trigger: string;
  keywords?: string[];
  toxicityThreshold?: number;
  actions: string[];
  muteDurationMs?: number;
  exemptRoles?: string[];
}

@Injectable()
export class AutoModService {
  constructor(
    private readonly toxicityModel: ToxicityModelService,
    @InjectModel(Guild.name) private readonly guildModel: GuildModel,
    @InjectModel(Member.name) private readonly memberModel: MemberModel,
    @InjectModel(AutoModLog.name)
    private readonly autoModLogModel: AutoModLogModel,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  // 对消息执行所有自动审核检查。
  // 返回包含允许/拦截决策以及相应操作的判定结果。
  async checkMessage(
    guildId: string,
    channelId: string,
    userId: string,
    content: string,
  ): Promise<AutoModVerdict> {
    this.logger.debug(
      `[AutoMod] checkMessage guild=${guildId} channel=${channelId} user=${userId} content="${content.slice(0, 80)}"`,
    );

    const guild = await this.guildModel
      .findById(guildId)
      .select('autoModConfig roles')
      .lean();

    const enabled = guild?.autoModConfig?.enabled ?? false;
    const rules: AutoModRule[] = guild?.autoModConfig?.rules ?? [];

    this.logger.debug(
      `[AutoMod] Guild config: enabled=${enabled}, rules=${rules.length}`,
    );

    if (!enabled || rules.length === 0) {
      // 运行 base toxicity check
      return this.baselineToxicityCheck(guildId, channelId, userId, content);
    }

    const isExempt = await this.isUserExempt(guildId, userId, rules);
    if (isExempt) {
      this.logger.debug(`[AutoMod] User ${userId} is exempt`);
      return { allowed: true, actions: [] };
    }

    for (const rule of rules) {
      if (!rule.enabled) continue;

      let verdict: AutoModVerdict | null = null;

      switch (rule.trigger) {
        case AUTOMOD_TRIGGER.KEYWORD:
          verdict = this.checkKeywordRule(rule, content);
          break;
        case AUTOMOD_TRIGGER.SPAM:
          verdict = await this.checkSpamRule(
            guildId,
            channelId,
            userId,
            content,
          );
          break;
        case AUTOMOD_TRIGGER.TOXIC_CONTENT:
          verdict = await this.checkToxicityRule(rule, content);
          break;
      }

      if (verdict && !verdict.allowed) {
        this.logger.log(
          `[AutoMod] Blocked: trigger=${verdict.trigger} reason="${verdict.reason}"`,
        );
        await this.logViolation(guildId, channelId, userId, verdict, content);
        return verdict;
      }
    }

    this.logger.debug(`[AutoMod] All rules passed, message allowed`);
    return { allowed: true, actions: [] };
  }

  async executeActions(
    guildId: string,
    userId: string,
    channelId: string,
    verdict: AutoModVerdict,
  ): Promise<void> {
    for (const action of verdict.actions) {
      switch (action) {
        case AUTOMOD_ACTION.MUTE_USER: {
          const duration =
            verdict.muteDurationMs ?? AUTOMOD_DEFAULTS.MUTE_DURATION_MS;
          const mutedUntil = new Date(Date.now() + duration);
          await this.memberModel.updateOne(
            {
              guild: new Types.ObjectId(guildId),
              user: new Types.ObjectId(userId),
            },
            { $set: { mutedUntil } },
          );
          this.logger.log(
            `[AutoMod] Muted user ${userId} in guild ${guildId} until ${mutedUntil.toISOString()}`,
          );
          break;
        }
        case AUTOMOD_ACTION.WARN_USER:
          this.logger.log(
            `[AutoMod] Warning user ${userId} in guild ${guildId}: ${verdict.reason}`,
          );
          break;
        case AUTOMOD_ACTION.BLOCK_MESSAGE:
          // 前端处理消息阻塞
          break;
      }
    }
  }

  async getConfig(
    guildId: string,
  ): Promise<{ enabled: boolean; rules: AutoModRule[] }> {
    const guild = await this.guildModel
      .findById(guildId)
      .select('autoModConfig')
      .lean();

    return {
      enabled: guild?.autoModConfig?.enabled ?? false,
      rules: guild?.autoModConfig?.rules ?? [],
    };
  }

  async updateConfig(
    guildId: string,
    config: { enabled: boolean; rules: AutoModRule[] },
  ): Promise<void> {
    await this.guildModel.updateOne(
      { _id: new Types.ObjectId(guildId) },
      { $set: { autoModConfig: config } },
    );
    this.logger.log(
      `[AutoMod] Updated config for guild ${guildId}: enabled=${config.enabled}, rules=${config.rules.length}`,
    );
  }

  async getLogs(
    guildId: string,
    limit = 50,
    offset = 0,
  ): Promise<{
    logs: InstanceType<typeof AutoModLog>[];
    total: number;
  }> {
    const filter = { guildId: new Types.ObjectId(guildId) };
    const [logs, total] = await Promise.all([
      this.autoModLogModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      this.autoModLogModel.countDocuments(filter),
    ]);
    return { logs, total };
  }

  private async isUserExempt(
    guildId: string,
    userId: string,
    rules: AutoModRule[],
  ): Promise<boolean> {
    const exemptRoleIds = new Set<string>();
    for (const rule of rules) {
      if (rule.exemptRoles) {
        for (const roleId of rule.exemptRoles) {
          exemptRoleIds.add(roleId);
        }
      }
    }

    if (exemptRoleIds.size === 0) return false;

    const member = await this.memberModel
      .findOne({
        guild: new Types.ObjectId(guildId),
        user: new Types.ObjectId(userId),
      })
      .select('roles')
      .lean();

    if (!member) return false;

    for (const roleId of member.roles) {
      if (exemptRoleIds.has(roleId.toString())) {
        return true;
      }
    }

    return false;
  }

  private checkKeywordRule(
    rule: AutoModRule,
    content: string,
  ): AutoModVerdict | null {
    if (!rule.keywords || rule.keywords.length === 0) return null;

    const lowerContent = content.toLowerCase();
    for (const keyword of rule.keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        return {
          allowed: false,
          trigger: AUTOMOD_TRIGGER.KEYWORD,
          reason: `Message contains blocked keyword: "${keyword}"`,
          actions: rule.actions as AutoModActionType[],
          muteDurationMs: rule.muteDurationMs,
        };
      }
    }

    return null;
  }

  private async checkSpamRule(
    guildId: string,
    channelId: string,
    userId: string,
    content: string,
  ): Promise<AutoModVerdict | null> {
    // Use Redis to track recent messages per user per channel
    const key = RedisKeys.automodSpam(guildId, channelId, userId);
    const now = Date.now();

    // Store message hash + timestamp
    const msgHash = simpleHash(content);
    const entry = `${msgHash}:${now}`;

    // Add the new entry and get all entries
    await this.redis.rpush(key, entry);
    await this.redis.expire(key, CACHE_TTL.AUTOMOD_SPAM);

    const entries = await this.redis.lrange(key, 0, -1);

    // Filter to recent window
    const windowMs = AUTOMOD_DEFAULTS.SPAM_WINDOW_MS;
    const recentEntries = entries.filter((e) => {
      const ts = parseInt(e.split(':')[1], 10);
      return now - ts < windowMs;
    });

    // Count duplicate messages in window
    const hashCounts = new Map<string, number>();
    for (const e of recentEntries) {
      const hash = e.split(':')[0];
      hashCounts.set(hash, (hashCounts.get(hash) || 0) + 1);
    }

    const maxDuplicates = hashCounts.get(msgHash) || 0;
    if (maxDuplicates >= AUTOMOD_DEFAULTS.SPAM_MAX_DUPLICATES) {
      return {
        allowed: false,
        trigger: AUTOMOD_TRIGGER.SPAM,
        reason: `Duplicate message detected (${maxDuplicates} times in ${windowMs / 1000}s)`,
        actions: [AUTOMOD_ACTION.BLOCK_MESSAGE, AUTOMOD_ACTION.WARN_USER],
        muteDurationMs: AUTOMOD_DEFAULTS.MUTE_DURATION_MS,
      };
    }

    return null;
  }

  private async checkToxicityRule(
    rule: AutoModRule,
    content: string,
  ): Promise<AutoModVerdict | null> {
    if (!this.toxicityModel.isAvailable()) {
      this.logger.debug('[AutoMod] Toxicity model not available, skipping');
      return null;
    }

    const threshold =
      rule.toxicityThreshold ?? AUTOMOD_DEFAULTS.TOXICITY_THRESHOLD;
    const result = await this.toxicityModel.classify(content, threshold);

    this.logger.debug(
      `[AutoMod] Toxicity result: score=${result?.toxicScore?.toFixed(3)} isToxic=${result?.isToxic} threshold=${threshold}`,
    );

    if (!result || !result.isToxic) return null;

    return {
      allowed: false,
      trigger: AUTOMOD_TRIGGER.TOXIC_CONTENT,
      reason: `Toxic content detected (${(result.toxicScore * 100).toFixed(1)}%)`,
      actions: rule.actions as AutoModActionType[],
      toxicityScores: result,
      muteDurationMs: rule.muteDurationMs,
    };
  }

  /**
   * Baseline toxicity check that runs even when guild automod is not configured.
   * Uses the multilingual BERT model — handles English, Chinese, and 13 other languages.
   */
  private async baselineToxicityCheck(
    guildId: string,
    channelId: string,
    userId: string,
    content: string,
  ): Promise<AutoModVerdict> {
    if (!this.toxicityModel.isAvailable()) {
      this.logger.debug('[AutoMod] Baseline: toxicity model not available');
      return { allowed: true, actions: [] };
    }

    const threshold = AUTOMOD_DEFAULTS.TOXICITY_THRESHOLD;
    const result = await this.toxicityModel.classify(content, threshold);

    this.logger.debug(
      `[AutoMod] Baseline toxicity: score=${result?.toxicScore?.toFixed(3)} isToxic=${result?.isToxic}`,
    );

    if (!result || !result.isToxic) {
      return { allowed: true, actions: [] };
    }

    const verdict: AutoModVerdict = {
      allowed: false,
      trigger: AUTOMOD_TRIGGER.TOXIC_CONTENT,
      reason: `Toxic content detected (${(result.toxicScore * 100).toFixed(1)}%)`,
      actions: [AUTOMOD_ACTION.BLOCK_MESSAGE],
      toxicityScores: result,
    };

    this.logger.log(`[AutoMod] Baseline blocked: reason="${verdict.reason}"`);

    await this.logViolation(guildId, channelId, userId, verdict, content);
    return verdict;
  }

  private async logViolation(
    guildId: string,
    channelId: string,
    userId: string,
    verdict: AutoModVerdict,
    messageContent: string,
  ): Promise<void> {
    try {
      await this.autoModLogModel.create({
        guildId: new Types.ObjectId(guildId),
        channelId: new Types.ObjectId(channelId),
        userId: new Types.ObjectId(userId),
        trigger: verdict.trigger,
        reason: verdict.reason,
        actions: verdict.actions,
        messageContent: messageContent.slice(0, 500),
        toxicityScores: verdict.toxicityScores
          ? { toxicScore: verdict.toxicityScores.toxicScore }
          : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`[AutoMod] Failed to log violation: ${msg}`);
    }
  }
}

/**
 * Simple non-cryptographic hash for deduplication.
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash.toString(36);
}
