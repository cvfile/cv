import type { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { cvHandler, type CvHandlerOptions } from './handler.js';

export interface CvFastifyOptions extends CvHandlerOptions {
  prefix?: string;
}

export const cvFastifyPlugin: FastifyPluginAsync<CvFastifyOptions> = async (
  fastify: FastifyInstance,
  opts: CvFastifyOptions,
) => {
  const handler = cvHandler(opts);
  const route = `${opts.prefix ?? ''}/*`;
  fastify.get(route, async (request: FastifyRequest, reply: FastifyReply) => {
    const { pathname } = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    if (!decodeURIComponent(pathname).toLowerCase().endsWith('.cv')) {
      reply.code(404).send('Not found');
      return;
    }
    reply.hijack();
    await handler(request.raw, reply.raw);
  });
};

export default cvFastifyPlugin;
