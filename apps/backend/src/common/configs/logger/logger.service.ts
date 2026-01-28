import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger implements LoggerService {
  private context?: string;

  constructor(private readonly pinoLogger: PinoLogger) {}

  setContext(context: string): void {
    this.context = context;
  }

  log(message: string, context?: string): void;
  log(message: string, meta?: Record<string, unknown>, context?: string): void;
  log(
    message: string,
    metaOrContext?: string | Record<string, unknown>,
    context?: string,
  ): void {
    const logContext = this.getContext(metaOrContext, context);
    const meta = this.getMeta(metaOrContext);

    if (meta) {
      this.pinoLogger.info({ ...meta, context: logContext }, message);
    } else {
      this.pinoLogger.info({ context: logContext }, message);
    }
  }

  error(message: string, trace?: string, context?: string): void;
  error(
    message: string,
    meta?: Record<string, unknown>,
    trace?: string,
    context?: string,
  ): void;
  error(
    message: string,
    traceOrMeta?: string | Record<string, unknown>,
    traceOrContext?: string,
    context?: string,
  ): void {
    const logContext = this.getContext(traceOrContext, context);
    const trace =
      typeof traceOrMeta === 'string' ? traceOrMeta : traceOrContext;
    const meta = typeof traceOrMeta === 'object' ? traceOrMeta : undefined;

    const logData: Record<string, unknown> = { context: logContext };
    if (meta) {
      Object.assign(logData, meta);
    }
    if (trace) {
      logData.trace = trace;
    }

    this.pinoLogger.error(logData, message);
  }

  warn(message: string, context?: string): void;
  warn(message: string, meta?: Record<string, unknown>, context?: string): void;
  warn(
    message: string,
    metaOrContext?: string | Record<string, unknown>,
    context?: string,
  ): void {
    const logContext = this.getContext(metaOrContext, context);
    const meta = this.getMeta(metaOrContext);

    if (meta) {
      this.pinoLogger.warn({ ...meta, context: logContext }, message);
    } else {
      this.pinoLogger.warn({ context: logContext }, message);
    }
  }

  debug(message: string, context?: string): void;
  debug(
    message: string,
    meta?: Record<string, unknown>,
    context?: string,
  ): void;
  debug(
    message: string,
    metaOrContext?: string | Record<string, unknown>,
    context?: string,
  ): void {
    const logContext = this.getContext(metaOrContext, context);
    const meta = this.getMeta(metaOrContext);

    if (meta) {
      this.pinoLogger.debug({ ...meta, context: logContext }, message);
    } else {
      this.pinoLogger.debug({ context: logContext }, message);
    }
  }

  verbose(message: string, context?: string): void;
  verbose(
    message: string,
    meta?: Record<string, unknown>,
    context?: string,
  ): void;
  verbose(
    message: string,
    metaOrContext?: string | Record<string, unknown>,
    context?: string,
  ): void {
    const logContext = this.getContext(metaOrContext, context);
    const meta = this.getMeta(metaOrContext);

    if (meta) {
      this.pinoLogger.trace({ ...meta, context: logContext }, message);
    } else {
      this.pinoLogger.trace({ context: logContext }, message);
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    const logData = { ...meta, context: this.context };
    this.pinoLogger.info(logData, message);
  }

  exception(
    message: string,
    error: Error,
    meta?: Record<string, unknown>,
  ): void {
    const logData = {
      ...meta,
      context: this.context,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };
    this.pinoLogger.error(logData, message);
  }

  private getContext(
    metaOrContext?: string | Record<string, unknown>,
    context?: string,
  ): string {
    if (typeof metaOrContext === 'string') {
      return metaOrContext;
    }
    return context || this.context || 'Application';
  }

  private getMeta(
    metaOrContext?: string | Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (typeof metaOrContext === 'object') {
      return metaOrContext;
    }
    return undefined;
  }
}
