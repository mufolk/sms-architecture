import type { MessageProcessor } from "@conversational-sms/core/ports/message-processor";
import type { Message, ReplyDraft } from "@conversational-sms/core/domain/types";

export type RuleBasedMessageProcessorOptions = {
  delayMs: number;
};

export function createRuleBasedMessageProcessor(
  options: RuleBasedMessageProcessorOptions,
): MessageProcessor {
  return {
    async process(inbound: Message, _history: Message[]): Promise<ReplyDraft> {
      if (options.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      return {
        body: `Reply: ${inbound.body}`,
      };
    },
  };
}
