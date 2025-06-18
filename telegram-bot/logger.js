const winston = require('winston');
const path = require('path');

// Environment configuration
const isDevelopment = process.env.NODE_ENV !== 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Create logs directory if it doesn't exist
const fs = require('fs');
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Custom format for console output in development
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let metaStr = '';
    if (Object.keys(meta).length > 0) {
      metaStr = ` ${JSON.stringify(meta)}`;
    }
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

// JSON format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create the logger
const logger = winston.createLogger({
  level: logLevel,
  defaultMeta: { 
    service: 'telegram-bot-bridge',
    version: require('./package.json').version
  },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Console output
    new winston.transports.Console({
      format: isDevelopment ? consoleFormat : fileFormat
    })
  ],
  
  // Handle exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      format: fileFormat
    })
  ],
  
  // Handle rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      format: fileFormat
    })
  ]
});

// Add request ID tracking functionality
logger.child = function(meta) {
  return {
    debug: (message, additionalMeta = {}) => logger.debug(message, { ...meta, ...additionalMeta }),
    info: (message, additionalMeta = {}) => logger.info(message, { ...meta, ...additionalMeta }),
    warn: (message, additionalMeta = {}) => logger.warn(message, { ...meta, ...additionalMeta }),
    error: (message, additionalMeta = {}) => logger.error(message, { ...meta, ...additionalMeta })
  };
};

// Log startup information
logger.info('Logger initialized', {
  level: logLevel,
  environment: process.env.NODE_ENV || 'development',
  logsDirectory: logsDir
});

module.exports = logger; 