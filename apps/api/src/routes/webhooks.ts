import { parseTwilioWebhookBody, InvalidTwilioWebhookPayloadError } from "../webhook/twilio-payload.js";
import {
  mapTwilioMessageStatus,
  parseTwilioStatusWebhookBody,
  InvalidTwilioStatusWebhookPayloadError,
} from "../webhook/twilio-status-payload.js";
import {
  handleInboundMessage,
  InvalidWebhookSignatureError,
} from "@conversational-sms/core/use-cases/handle-inbound-message";
import { handleDeliveryReceipt } from "@conversational-sms/core/use-cases/handle-delivery-receipt";
import type { FastifyInstance } from "fastify";
import type { AppDeps } from "../deps.js";
import { isQueueUnavailableError } from "../queue-errors.js";

export async function registerWebhookRoutes(app: FastifyInstance, deps: AppDeps): Promise<void> {
  app.post("/webhooks/sms", async (request, reply) => {
    const body = typeof request.body === "string" ? request.body : "";
    const headers = request.headers as Record<string, string | string[] | undefined>;

    try {
      const payload = parseTwilioWebhookBody(body);
      const result = await handleInboundMessage(
        {
          smsProvider: deps.smsProvider,
          conversationRepository: deps.conversationRepository,
          messageRepository: deps.messageRepository,
          jobQueue: deps.jobQueue,
        },
        { headers, body, payload },
      );
      return reply.status(200).send({ duplicate: result.duplicate });
    } catch (error) {
      if (error instanceof InvalidWebhookSignatureError) {
        return reply.status(403).send({ error: "invalid signature" });
      }
      if (error instanceof InvalidTwilioWebhookPayloadError) {
        return reply.status(400).send({ error: "invalid payload" });
      }
      if (isQueueUnavailableError(error)) {
        return reply.status(503).send({ error: "queue unavailable" });
      }
      throw error;
    }
  });

  app.post("/webhooks/status", async (request, reply) => {
    const body = typeof request.body === "string" ? request.body : "";
    const headers = request.headers as Record<string, string | string[] | undefined>;

    if (!deps.smsProvider.verifySignature(headers, body)) {
      return reply.status(403).send({ error: "invalid signature" });
    }

    try {
      const parsed = parseTwilioStatusWebhookBody(body);
      const mappedStatus = mapTwilioMessageStatus(parsed.messageStatus);
      if (mappedStatus === "ignored") {
        return reply.status(200).send({ ignored: true });
      }

      await handleDeliveryReceipt(
        {
          smsProvider: deps.smsProvider,
          messageRepository: deps.messageRepository,
          log: request.log,
        },
        {
          payload: {
            providerMessageSid: parsed.providerMessageSid,
            messageStatus: mappedStatus,
            errorCode: parsed.errorCode,
          },
        },
      );
      return reply.status(200).send({ ok: true });
    } catch (error) {
      if (error instanceof InvalidTwilioStatusWebhookPayloadError) {
        return reply.status(400).send({ error: "invalid payload" });
      }
      throw error;
    }
  });
}
