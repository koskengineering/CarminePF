import * as cron from 'node-cron';
import { KeepaService } from './keepa.service';
import { ConfigService } from './config.service';
import { logger } from '../utils/logger';

export class SchedulerService {
  private static instance: SchedulerService;
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private keepaService: KeepaService;
  private configService: ConfigService;
  private lastRun: Date | null = null;
  private nextRun: Date | null = null;

  constructor() {
    this.keepaService = new KeepaService();
    this.configService = new ConfigService();
  }

  static getInstance(): SchedulerService {
    if (!SchedulerService.instance) {
      SchedulerService.instance = new SchedulerService();
    }
    return SchedulerService.instance;
  }

  async start(): Promise<{ success: boolean; message: string }> {
    if (this.isRunning) {
      return { success: false, message: 'Scheduler is already running' };
    }

    const config = await this.configService.getConfig();
    if (!config) {
      return { success: false, message: 'No configuration found' };
    }

    // Update config to set isActive = true
    await this.configService.updateActiveStatus(true);

    this.isRunning = true;
    
    // Run immediately on start
    this.runJob();

    // Schedule to run every minute
    this.task = cron.schedule('* * * * *', () => {
      this.runJob();
    });

    logger.info('Scheduler started successfully');
    return { success: true, message: 'Scheduler started' };
  }

  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
    }
    this.isRunning = false;
    this.configService.updateActiveStatus(false);
    logger.info('Scheduler stopped');
  }

  getStatus(): {
    isRunning: boolean;
    lastRun: Date | null;
    nextRun: Date | null;
  } {
    if (this.isRunning && !this.nextRun) {
      this.nextRun = new Date(Date.now() + 60000); // Next minute
    }
    
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.isRunning ? this.nextRun : null
    };
  }

  private async runJob(): Promise<void> {
    try {
      logger.info('Running scheduled job');
      this.lastRun = new Date();
      this.nextRun = new Date(Date.now() + 60000); // Next minute

      await this.keepaService.fetchAndUpdateProducts();
      
      // Clean up old data
      await this.configService.cleanupOldData();
      
      logger.info('Scheduled job completed successfully');
    } catch (error) {
      logger.error('Error in scheduled job', error);
    }
  }
}