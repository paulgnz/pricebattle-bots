import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} [${level}]: ${message}${metaStr}`;
});

export function createLogger(level: string = 'info'): winston.Logger {
  return winston.createLogger({
    level,
    format: combine(
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      logFormat
    ),
    transports: [
      new winston.transports.Console({
        format: combine(
          colorize(),
          timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          logFormat
        ),
      }),
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error',
      }),
      new winston.transports.File({
        filename: 'logs/combined.log',
      }),
    ],
  });
}

// Default logger instance
let logger: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (!logger) {
    logger = createLogger();
  }
  return logger;
}

export function setLogLevel(level: string): void {
  if (logger) {
    logger.level = level;
  }
}

export type Logger = winston.Logger;
