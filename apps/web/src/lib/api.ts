import type { ConversationSummary, ThreadMessage } from "./types";

function apiUrl(): string {
  const url = process.env.API_URL;
  if (!url) {
    throw new Error("API_URL is not configured");
  }
  return url;
}

export async function fetchConversations(): Promise<ConversationSummary[]> {
  const response = await fetch(`${apiUrl()}/conversations`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load conversations (${response.status})`);
  }

  const data = (await response.json()) as { conversations: ConversationSummary[] };
  return data.conversations;
}

export async function fetchConversation(conversationId: string): Promise<ConversationSummary> {
  const response = await fetch(`${apiUrl()}/conversations/${conversationId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load conversation (${response.status})`);
  }

  const data = (await response.json()) as { conversation: ConversationSummary };
  return data.conversation;
}

export async function fetchThreadMessages(conversationId: string): Promise<ThreadMessage[]> {
  const response = await fetch(`${apiUrl()}/conversations/${conversationId}/messages`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to load messages (${response.status})`);
  }

  const data = (await response.json()) as { messages: ThreadMessage[] };
  return data.messages;
}
