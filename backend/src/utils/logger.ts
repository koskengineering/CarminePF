export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class Logger {
  private logLevel: LogLevel;

  constructor() {
    const level = process.env.LOG_LEVEL?.toLowerCase() || 'info';
    this.logLevel = this.parseLogLevel(level);
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level) {
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private formatMessage(level: string, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  error(message: string, error?: Error | any): void {
    if (this.logLevel >= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message, error));
    }
  }

  warn(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message, meta));
    }
  }

  info(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.INFO) {
      console.log(this.formatMessage('INFO', message, meta));
    }
  }

  debug(message: string, meta?: any): void {
    if (this.logLevel >= LogLevel.DEBUG) {
      console.log(this.formatMessage('DEBUG', message, meta));
    }
  }
}

export const logger = new Logger();