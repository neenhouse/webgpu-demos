/**
 * Lightweight structured logger for the model pipeline.
 * Enable debug output by setting `window.__PIPELINE_DEBUG = true` in the console.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

const LOG_HISTORY: LogEntry[] = [];
const MAX_HISTORY = 200;

function shouldLog(level: LogLevel): boolean {
  if (level === 'error' || level === 'warn') return true;
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>).__PIPELINE_DEBUG) return true;
  return false;
}

function log(level: LogLevel, module: string, message: string, data?: Record<string, unknown>) {
  const entry: LogEntry = { level, module, message, data, timestamp: Date.now() };

  LOG_HISTORY.push(entry);
  if (LOG_HISTORY.length > MAX_HISTORY) LOG_HISTORY.shift();

  if (!shouldLog(level)) return;

  const prefix = `[pipeline:${module}]`;
  const args = data ? [prefix, message, data] : [prefix, message];

  switch (level) {
    case 'debug': console.debug(...args); break;
    case 'info': console.info(...args); break;
    case 'warn': console.warn(...args); break;
    case 'error': console.error(...args); break;
  }
}

export const pipelineLog = {
  debug: (module: string, message: string, data?: Record<string, unknown>) => log('debug', module, message, data),
  info: (module: string, message: string, data?: Record<string, unknown>) => log('info', module, message, data),
  warn: (module: string, message: string, data?: Record<string, unknown>) => log('warn', module, message, data),
  error: (module: string, message: string, data?: Record<string, unknown>) => log('error', module, message, data),
  getHistory: () => [...LOG_HISTORY],
};
