import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@datainova/database';
import { z } from 'zod';

const stripeWebhookSchema = z.object({
  headers: z.object({
    'stripe-signature': z.string().optional()
  }),
  body: z.object({
    id: z.string(),
    type: z.string(),
    data: z
      .object({
        object: z.record(z.any())
      })
      .optional()
  })
});

const hubspotWebhookSchema = z.object({
  body: z.union([z.array(z.record(z.any())), z.record(z.any())])
});

export const registerBillingRoutes = (app: FastifyInstance) => {
  app.post(
    '/webhooks/stripe',
    {
      schema: {
        headers: stripeWebhookSchema.shape.headers,
        body: stripeWebhookSchema.shape.body
      }
    },
    async (request, reply) => {
      const envSecret = app.env.STRIPE_WEBHOOK_SECRET ?? process.env.STRIPE_WEBHOOK_SECRET;
      const signatureHeader = request.headers['stripe-signature'];

      if (envSecret) {
        if (!signatureHeader) {
          throw app.httpErrors.unauthorized('missing stripe signature');
        }
        verifyStripeSignature({
          app,
          payload: JSON.stringify(request.body ?? {}),
          signatureHeader: signatureHeader as string,
          secret: envSecret
        });
      } else {
        app.log.warn('STRIPE_WEBHOOK_SECRET not set; webhook signature not verified');
      }

      const event = request.body as z.infer<typeof stripeWebhookSchema>['body'];

      await prisma.telemetryEvent.create({
        data: {
          name: `stripe.${event.type}`,
          metadata: {
            eventId: event.id,
            payload: event.data?.object ?? null
          }
        }
      });

      const subscriptionPayload = event.data?.object ?? {};
      const stripeSubscriptionId =
        typeof subscriptionPayload === 'object' && subscriptionPayload !== null
          ? (subscriptionPayload as Record<string, unknown>).id
          : undefined;

      if (typeof stripeSubscriptionId === 'string') {
        const subscription = await prisma.subscription.findFirst({
          where: { stripeSubscriptionId }
        });

        if (subscription) {
          const status =
            typeof (subscriptionPayload as Record<string, unknown>).status === 'string'
              ? (subscriptionPayload as Record<string, string>).status
              : subscription.status;
          const currentPeriodEnd =
            typeof (subscriptionPayload as Record<string, unknown>).current_period_end === 'number'
              ? new Date((subscriptionPayload as Record<string, number>).current_period_end * 1000)
              : subscription.currentPeriodEnd;

          await prisma.subscription.update({
            where: { id: subscription.id },
            data: {
              status,
              currentPeriodEnd
            }
          });
        }
      }

      reply.code(202).send({ received: true });
    }
  );

  app.post(
    '/webhooks/hubspot',
    {
      schema: {
        body: hubspotWebhookSchema.shape.body
      }
    },
    async (request, reply) => {
      const payload = request.body as z.infer<typeof hubspotWebhookSchema>['body'];

      const envSecret = app.env.HUBSPOT_WEBHOOK_SECRET ?? process.env.HUBSPOT_WEBHOOK_SECRET;
      const signatureHeader =
        (request.headers['x-hubspot-signature-v3'] as string | undefined) ??
        (request.headers['x-hubspot-signature'] as string | undefined);

      if (envSecret) {
        if (!signatureHeader) {
          throw app.httpErrors.unauthorized('missing hubspot signature');
        }
        verifyHubspotSignature({
          app,
          payload: JSON.stringify(payload ?? {}),
          signature: signatureHeader,
          secret: envSecret
        });
      } else {
        app.log.warn('HUBSPOT_WEBHOOK_SECRET not set; webhook signature not verified');
      }

      await prisma.telemetryEvent.create({
        data: {
          name: 'hubspot.webhook',
          metadata: {
            payload
          }
        }
      });

      if (Array.isArray(payload)) {
        for (const event of payload) {
          const email = typeof event?.email === 'string' ? event.email : undefined;
          if (email) {
            await prisma.lead.create({
              data: {
                email,
                source: 'hubspot',
                lifecycle: typeof event?.lifecycle === 'string' ? event.lifecycle : 'lead',
                metadata: event
              }
            });
          }
        }
      }

      reply.code(202).send({ received: true });
    }
  );
};

const verifyStripeSignature = ({
  app,
  payload,
  signatureHeader,
  secret,
  toleranceMs = 5 * 60 * 1000
}: {
  app: FastifyInstance;
  payload: string;
  signatureHeader: string;
  secret: string;
  toleranceMs?: number;
}) => {
  const parts = Object.fromEntries(
    signatureHeader.split(',').map((segment) => {
      const [key, value] = segment.split('=');
      return [key.trim(), value];
    })
  );

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !signature) {
    throw app.httpErrors.unauthorized('malformed stripe signature header');
  }

  const timestampMs = Number(timestamp) * 1000;
  if (Number.isFinite(timestampMs)) {
    const age = Math.abs(Date.now() - timestampMs);
    if (age > toleranceMs) {
      throw app.httpErrors.unauthorized('stripe signature expired');
    }
  }

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  if (!safeCompare(expected, signature)) {
    throw app.httpErrors.unauthorized('invalid stripe signature');
  }
};

const verifyHubspotSignature = ({
  app,
  payload,
  signature,
  secret
}: {
  app: FastifyInstance;
  payload: string;
  signature: string;
  secret: string;
}) => {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (!safeCompare(expected, signature)) {
    throw app.httpErrors.unauthorized('invalid hubspot signature');
  }
};

const safeCompare = (a: string, b: string) => {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
};
