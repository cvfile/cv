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
    if (!request.url.toLowerCase().includes('.cv')) {
      reply.code(404).send('Not found');
      return;
    }
    await handler(request.raw, reply.raw);
  });
};

export default cvFastifyPlugin;
