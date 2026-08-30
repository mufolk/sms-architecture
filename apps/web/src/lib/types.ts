export type ConversationSummary = {
  id: string;
  inboundNumber: string;
  userNumber: string;
  lastMessageAt: string;
  needsAttention: boolean;
  createdAt: string;
};

export type ThreadMessage = {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  status: string;
  body: string;
  provider: string;
  providerMessageSid: string;
  correlationId: string;
  inReplyTo: string | null;
  createdAt: string;
  updatedAt: string;
};
