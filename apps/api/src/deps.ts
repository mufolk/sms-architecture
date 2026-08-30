import type { ConversationRepository } from "@conversational-sms/core/ports/conversation-repository";
import type { JobQueue } from "@conversational-sms/core/ports/job-queue";
import type { MessageRepository } from "@conversational-sms/core/ports/message-repository";
import type { SmsProvider } from "@conversational-sms/core/ports/sms-provider";
import type { FakeSmsProvider } from "@conversational-sms/core/adapters/fake-sms-provider";

export type AppDeps = {
  smsProvider: SmsProvider;
  conversationRepository: ConversationRepository;
  messageRepository: MessageRepository;
  jobQueue: JobQueue;
};

export type TestAppDeps = AppDeps & {
  smsProvider: FakeSmsProvider;
};
