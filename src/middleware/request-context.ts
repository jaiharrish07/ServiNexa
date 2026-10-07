import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';

/**
 * Structured request logging with a per-request id. In dev it pretty-prints; in
 * test it is silent; in prod it emits JSON for log aggregators.
 */
export const requestContext = pinoHttp({
  level: env.LOG_LEVEL === 'silent' ? 'silent' : env.LOG_LEVEL,
  genReqId: (req, res) => {
    const existing = req.headers['x-request-id'];
    const id = (Array.isArray(existing) ? existing[0] : existing) || randomUUID();
    res.setHeader('x-request-id', id);
    return id;
  },
  autoLogging: env.NODE_ENV !== 'test',
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
      : undefined,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url, id: req.id }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
