#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { loadConfig } from './config/Config.js';
import { createLogger } from './config/Logger.js';
import { createServer } from './server.js';
import { DevilgeError } from './config/errors.js';

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    process.stderr.write(
      `[devilge] startup failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  const logger = createLogger(config.logLevel);
  const server = createServer(config, logger);

  const transport = new StdioServerTransport();

  // Tighten error handling: never crash the process on a single tool error.
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', { message: err.message });
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandledRejection', {
      message: reason instanceof Error ? reason.message : String(reason),
    });
  });

  // Graceful shutdown.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info('shutdown', { signal });
    try {
      await server.close();
    } catch (closeErr) {
      logger.warn('error while closing server', {
        message: closeErr instanceof Error ? closeErr.message : String(closeErr),
      });
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await server.connect(transport);
    logger.info('devilge MCP server ready (stdio)');
  } catch (err) {
    if (err instanceof DevilgeError) {
      logger.error('failed to connect transport', { code: err.code, message: err.message });
    } else {
      logger.error('failed to connect transport', {
        message: err instanceof Error ? err.message : String(err),
      });
    }
    process.exit(1);
  }
}

void main();
