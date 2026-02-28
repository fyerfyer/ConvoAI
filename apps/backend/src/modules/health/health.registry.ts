import { Injectable } from '@nestjs/common';

export interface WorkerStatus {
  name: string;
  queue: string;
  status: 'started' | 'stopped';
  startedAt?: string;
  details?: string;
}

// 全局注册表：各 Worker / PubSub 订阅者在 onModuleInit 时自行注册。
// HealthController 读取此注册表即可汇总所有 worker 状态。
@Injectable()
export class HealthRegistry {
  private readonly workers = new Map<string, WorkerStatus>();

  register(status: WorkerStatus): void {
    this.workers.set(status.name, status);
  }

  getAll(): WorkerStatus[] {
    return Array.from(this.workers.values());
  }
}
