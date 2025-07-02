import { Request, Response } from 'express';
import { SchedulerService } from '../services/scheduler.service';
import { logger } from '../utils/logger';

export class StatusController {
  private schedulerService: SchedulerService;

  constructor() {
    this.schedulerService = SchedulerService.getInstance();
  }

  start = async (_: Request, res: Response): Promise<void> => {
    try {
      const result = await this.schedulerService.start();
      if (result.success) {
        res.json({ message: 'Monitoring started successfully', status: 'running' });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error) {
      logger.error('Error starting monitoring', error);
      res.status(500).json({ error: 'Failed to start monitoring' });
    }
  };

  stop = async (_: Request, res: Response): Promise<void> => {
    try {
      this.schedulerService.stop();
      res.json({ message: 'Monitoring stopped successfully', status: 'stopped' });
    } catch (error) {
      logger.error('Error stopping monitoring', error);
      res.status(500).json({ error: 'Failed to stop monitoring' });
    }
  };

  getStatus = async (_: Request, res: Response): Promise<void> => {
    try {
      const status = this.schedulerService.getStatus();
      res.json(status);
    } catch (error) {
      logger.error('Error getting status', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  };
}