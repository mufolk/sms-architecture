import type { Message, ReplyDraft } from "../domain/types.js";

export type MessageProcessor = {
  process(inbound: Message, history: Message[]): Promise<ReplyDraft>;
};
