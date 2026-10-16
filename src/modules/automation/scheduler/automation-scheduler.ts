import { PrismaClient, AutomationStatus } from '@prisma/client';
import crypto from 'node:crypto';
import { db } from '../../../database/client';
import { AutomationRepository } from '../repositories/automation.repository';
import { ExecutionRepository } from '../repositories/execution.repository';
import { ActivityRepository } from '../repositories/activity.repository';
import { ExecutionEngine } from '../engine/execution-engine';
import { ScheduleManager } from './schedule-manager';
import { logger } from '../../../config';
import {
  AutomationMetadata,
  SchedulerHealthStatus,
  MissedExecutionPolicy,
  ConcurrencyPolicy,
} from '../automation.types';
import { cronScheduler } from '../../../cron/scheduler';

export class AutomationScheduler {
  private autoRepo: AutomationRepository;
  private execRepo: ExecutionRepository;
  private actRepo: ActivityRepository;
  private executionEngine: ExecutionEngine;
  private prisma: PrismaClient;

  private workerId: string;
  private pollIntervalMs: number = 2000;
  private pollTimer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isTicking: boolean = false;

  private lastPollAt: Date = new Date();
  private startedAt: Date = new Date();
  private totalExecutedCount: number = 0;
  private totalFailedCount: number = 0;
  private activeExecutionsCount: number = 0;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
    this.autoRepo = new AutomationRepository();
    this.execRepo = new ExecutionRepository();
    this.actRepo = new ActivityRepository();
    this.executionEngine = new ExecutionEngine(prisma);
    this.workerId = `worker_${crypto.randomUUID().slice(0, 8)}`;
  }

  /**
   * Starts the authoritative database-first background scheduler (Phase 5.5 & 5.6).
   */
  public async start(pollIntervalMs: number = 2000): Promise<void> {
    if (this.isRunning) return;

    this.pollIntervalMs = pollIntervalMs;
    this.isRunning = true;
    this.startedAt = new Date();

    logger.info(`[AutomationScheduler] Starting background scheduler on worker '${this.workerId}' (Poll interval: ${pollIntervalMs}ms)`);

    // 1. Stuck Execution Sweeper & Restart Recovery (Phase 5.30 & 5.34)
    await this.recoverFromRestart();

    // 2. Begin authoritative polling loop
    this.pollTimer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error(`[AutomationScheduler] Error in scheduler tick: ${err.message}`);
      });
    }, this.pollIntervalMs);
  }

  /**
   * Stops the background scheduler cleanly.
   */
  public stop(): void {
    if (!this.isRunning) return;
    logger.info(`[AutomationScheduler] Stopping scheduler on worker '${this.workerId}'`);
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isRunning = false;
  }

  /**
   * Operational health telemetry (Phase 5.33).
   */
  public getHealthStatus(): SchedulerHealthStatus {
    const uptimeSeconds = Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
    return {
      isRunning: this.isRunning,
      workerId: this.workerId,
      pollIntervalMs: this.pollIntervalMs,
      lastPollAt: this.lastPollAt.toISOString(),
      activeExecutionsCount: this.activeExecutionsCount,
      activeExecutions: this.activeExecutionsCount,
      totalExecutedCount: this.totalExecutedCount,
      totalExecuted: this.totalExecutedCount,
      totalFailedCount: this.totalFailedCount,
      totalFailed: this.totalFailedCount,
      queueDepth: 0,
      uptimeSeconds,
    };
  }

  public async recoverOnStartup(): Promise<void> {
    return this.recoverFromRestart();
  }

  /**
   * Server Restart Recovery & Stuck Execution Cleanup (Phase 5.30 & 5.34).
   * Runs on boot to recover PostgreSQL state without lost work or orphaned locks.
   */
  public async recoverFromRestart(): Promise<void> {
    try {
      logger.info('[AutomationScheduler] Running restart recovery and stuck execution sweep...');

      // 1. Recover executions stuck in RUNNING for > 5 minutes
      const stuckExecutions = await this.execRepo.findStuckExecutions(300_000);
      for (const exec of stuckExecutions) {
        logger.warn(`[AutomationScheduler] Recovering stuck execution '${exec.id}' -> TIMED_OUT`);
        await this.execRepo.updateExecution(exec.id, {
          status: AutomationStatus.FAILED,
          error: { message: 'Execution timed out due to server restart or process stall', code: 'TIMED_OUT' },
          completedAt: new Date(),
        });
      }

      // 2. Discover due automations that were missed during server downtime (Phase 5.9)
      const dueAutomations = await this.autoRepo.findDueAutomations(new Date());
      logger.info(`[AutomationScheduler] Found ${dueAutomations.length} due/missed automations upon restart`);

      for (const auto of dueAutomations) {
        const cond = (auto.conditions as Record<string, any>) || {};
        const meta: AutomationMetadata = cond._meta || {};
        const missedPolicy: MissedExecutionPolicy = meta.missedExecutionPolicy || 'RUN_ONCE_IMMEDIATELY';

        if (missedPolicy === 'SKIP') {
          logger.info(`[AutomationScheduler] Missed policy SKIP for '${auto.id}'. Advancing nextRun.`);
          const tz = meta.timezone || 'UTC';
          const nextRun = auto.schedule ? ScheduleManager.calculateNextRun(auto.schedule, tz, new Date()) : null;
          await this.autoRepo.advanceNextRun(auto.id, nextRun);
        } else if (missedPolicy === 'MARK_MISSED') {
          await this.actRepo.logActivity(
            auto.id,
            auto.workspaceId,
            'EXECUTION_MISSED',
            'Scheduled execution was missed during system downtime',
            null,
            auto.userId,
          );
          const tz = meta.timezone || 'UTC';
          const nextRun = auto.schedule ? ScheduleManager.calculateNextRun(auto.schedule, tz, new Date()) : null;
          await this.autoRepo.advanceNextRun(auto.id, nextRun);
        }
        // RUN_ONCE_IMMEDIATELY will be naturally picked up in the next tick()
      }
    } catch (err: any) {
      logger.error(`[AutomationScheduler] Restart recovery encountered error: ${err.message}`);
    }
  }

  /**
   * Main scheduler polling tick.
   * Discovers due work from PostgreSQL, claims it atomically, and executes it.
   */
  public async tick(): Promise<void> {
    if (!this.isRunning || this.isTicking) return;
    this.isTicking = true;
    this.lastPollAt = new Date();

    try {
      // Find all automations due according to PostgreSQL
      const dueAutomations = await this.autoRepo.findDueAutomations(this.lastPollAt);
      if (dueAutomations.length === 0) {
        return;
      }

      for (const auto of dueAutomations) {
        await this.processDueAutomation(auto);
      }
    } catch (err: any) {
      logger.error(`[AutomationScheduler] Scheduler tick failed: ${err.message}`);
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Safe processing of a single due automation.
   * Safe Atomic Claiming (Phase 5.7) + Duplicate Protection (Phase 5.8) + Advance Next Run.
   */
  public async processDueAutomation(auto: any): Promise<boolean> {
    const cond = (auto.conditions as Record<string, any>) || {};
    const meta: AutomationMetadata = cond._meta || {};
    const tz = meta.timezone || 'UTC';
    const concurrencyPolicy: ConcurrencyPolicy = meta.concurrencyPolicy || 'SKIP_IF_RUNNING';

    // 1. Concurrency Policy: Check if an execution is already running
    if (concurrencyPolicy === 'SKIP_IF_RUNNING') {
      const activeExecs = await this.execRepo.findActiveExecutions(auto.id);
      if (activeExecs.length > 0) {
        logger.warn(`[AutomationScheduler] Automation '${auto.id}' is already running. Concurrency policy SKIP_IF_RUNNING skips this occurrence.`);
        return false;
      }
    }

    // 2. Safe Atomic Job Claiming (Phase 5.7)
    // Attempt atomic lock lease in PostgreSQL transaction
    const claimed = await this.autoRepo.claimAutomation(auto.id, this.workerId, 60000);
    if (!claimed) {
      // Another worker claimed it or lease is held
      logger.info(`[AutomationScheduler] Worker '${this.workerId}' skipped automation '${auto.id}' (already claimed by another worker)`);
      return false;
    }

    const scheduledOccurrenceTime = meta.nextRunAt || new Date().toISOString();
    const occurrenceKey = `${auto.id}:${scheduledOccurrenceTime}`;

    // 3. Duplicate Occurrence Protection (Phase 5.8)
    const existingExec = await this.execRepo.findByExecutionKey(auto.id, occurrenceKey);
    if (existingExec) {
      logger.info(`[AutomationScheduler] Occurrence '${occurrenceKey}' already executed for '${auto.id}'. Advancing nextRun.`);
      const nextRun = auto.schedule ? ScheduleManager.calculateNextRun(auto.schedule, tz, new Date()) : null;
      await this.autoRepo.releaseClaim(auto.id, this.workerId, nextRun);
      return false;
    }

    // 4. Calculate and advance nextRunAt for future ticks (Database-First advancement)
    const nextRun = auto.schedule ? ScheduleManager.calculateNextRun(auto.schedule, tz, new Date()) : null;

    logger.info(`[AutomationScheduler] Worker '${this.workerId}' claimed due automation '${auto.id}' (${auto.name}). Triggering execution.`);

    this.activeExecutionsCount++;

    // 5. Execute automation asynchronously
    (async () => {
      try {
        const triggerData: Record<string, unknown> = {
          triggeredBy: 'SCHEDULER',
          workerId: this.workerId,
          scheduledOccurrence: scheduledOccurrenceTime,
          executionKey: occurrenceKey,
          idempotencyKey: occurrenceKey,
        };

        const result = await this.executionEngine.execute(
          auto.id,
          triggerData,
          auto.userId || undefined,
        );

        this.totalExecutedCount++;

        // Release claim and persist next occurrence
        await this.autoRepo.releaseClaim(
          auto.id,
          this.workerId,
          nextRun,
          result.status,
        );
      } catch (err: any) {
        this.totalFailedCount++;
        logger.error(`[AutomationScheduler] Execution error for '${auto.id}': ${err.message}`);

        // Still release claim and advance schedule to prevent tight crash loops
        await this.autoRepo.releaseClaim(
          auto.id,
          this.workerId,
          nextRun,
          AutomationStatus.FAILED,
        );
      } finally {
        this.activeExecutionsCount = Math.max(0, this.activeExecutionsCount - 1);
      }
    })();

    return true;
  }

  /**
   * For backwards compatibility with older in-memory triggers if needed.
   */
  public async initializeScheduledAutomations(): Promise<void> {
    await this.start();
  }

  public scheduleAutomation(id: string, name: string, scheduleRaw?: string | null): void {
    const taskName = `automation_${id}`;
    if (scheduleRaw) {
      cronScheduler.schedule({
        name: taskName,
        expression: scheduleRaw,
        enabled: true,
        handler: async () => {
          logger.info(`[AutomationScheduler] Cron triggered for automation '${id}' (${name})`);
          try {
            const auto = await this.autoRepo.findById(id);
            if (!auto || auto.deletedAt || !auto.isEnabled || auto.status !== AutomationStatus.ACTIVE) {
              logger.warn(
                `[AutomationScheduler] Automation '${id}' is deleted, disabled, or inactive in database. Unscheduling task.`,
              );
              this.unscheduleAutomation(id);
              return;
            }

            await this.executionEngine.execute(
              id,
              {
                triggeredBy: 'CRON_SCHEDULER',
                schedule: scheduleRaw,
                timestamp: new Date().toISOString(),
              },
              auto.userId || undefined,
            );
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            logger.error(
              `[AutomationScheduler] Error executing scheduled automation '${id}': ${errorMessage}`,
            );
          }
        },
      });
    }

    if (!this.isRunning) {
      this.start().catch((err) => {
        logger.error(`[AutomationScheduler] Failed starting scheduler: ${err.message}`);
      });
    }
  }

  public unscheduleAutomation(id: string): void {
    const taskName = `automation_${id}`;
    cronScheduler.unschedule(taskName);
  }
}

export const automationScheduler = new AutomationScheduler(db);

