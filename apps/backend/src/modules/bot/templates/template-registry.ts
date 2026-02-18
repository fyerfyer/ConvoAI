import { Injectable } from '@nestjs/common';
import { BaseTemplate } from './base-template';
import { WelcomeTemplate } from './welcome.template';
import { PollTemplate } from './poll.template';
import { GameTemplate } from './game.template';
import { ReminderTemplate } from './reminder.template';
import { AutoResponderTemplate } from './auto-responder.template';
import {
  TemplateInfo,
  TemplateIdValue,
  TemplateConfigFieldSchema,
} from '@discord-platform/shared';

@Injectable()
export class TemplateRegistry {
  private readonly templates = new Map<string, BaseTemplate>();

  constructor() {
    this.register(new WelcomeTemplate());
    this.register(new PollTemplate());
    this.register(new GameTemplate());
    this.register(new ReminderTemplate());
    this.register(new AutoResponderTemplate());
  }

  private register(template: BaseTemplate): void {
    this.templates.set(template.id, template);
  }

  get(templateId: string): BaseTemplate | undefined {
    return this.templates.get(templateId);
  }

  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  listTemplates(): TemplateInfo[] {
    return Array.from(this.templates.values()).map((t) => ({
      id: t.id as TemplateIdValue,
      name: t.name,
      description: t.description,
      icon: t.icon,
      category: t.category,
      configSchema: this.getConfigSchema(t.id),
    }));
  }

  private getConfigSchema(
    templateId: string,
  ): Record<string, TemplateConfigFieldSchema> {
    const schemas: Record<string, Record<string, TemplateConfigFieldSchema>> = {
      welcome: {
        welcomeMessage: {
          type: 'string',
          label: 'Welcome Message',
          description: 'Supports {user}, {guild}, {channel} variables',
          default: 'Welcome to the server, **{user}**! 🎉',
        },
        showMemberCount: {
          type: 'boolean',
          label: 'Show Member Count',
          default: false,
        },
      },
      poll: {
        maxOptions: {
          type: 'number',
          label: 'Maximum Options',
          description: 'Maximum number of options per poll',
          default: 6,
        },
        defaultDuration: {
          type: 'number',
          label: 'Default Duration (seconds)',
          description: 'Default poll duration',
          default: 3600,
        },
      },
      game: {
        enabledGames: {
          type: 'array',
          label: 'Enabled Games',
          description: 'Options: 8ball, roll, guess, rps',
          default: ['8ball', 'roll', 'guess', 'rps'],
        },
        guessRange: {
          type: 'object',
          label: 'Guess Number Range',
          default: { min: 1, max: 100 },
        },
      },
      reminder: {
        maxRemindersPerUser: {
          type: 'number',
          label: 'Maximum Reminders Per User',
          default: 10,
        },
        maxDuration: {
          type: 'number',
          label: 'Maximum Duration (seconds)',
          default: 86400,
        },
      },
      'auto-responder': {
        rules: {
          type: 'array',
          label: 'Response Rules',
          description: 'List of keyword-response rules',
          required: true,
          default: [],
        },
      },
    };

    return schemas[templateId] || {};
  }
}
