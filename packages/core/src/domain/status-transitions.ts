import type { InboundStatus, MessageDirection, OutboundStatus } from "./types.js";

export const INBOUND_TRANSITIONS: Record<InboundStatus, readonly InboundStatus[]> = {
  received: ["processing"],
  processing: ["processed", "failed"],
  processed: [],
  failed: [],
};

export const OUTBOUND_TRANSITIONS: Record<OutboundStatus, readonly OutboundStatus[]> = {
  queued: ["sent", "failed"],
  sent: ["delivered", "undelivered", "failed"],
  delivered: [],
  undelivered: [],
  failed: [],
};

const INBOUND_STATUSES = new Set<string>(Object.keys(INBOUND_TRANSITIONS));
const OUTBOUND_STATUSES = new Set<string>(Object.keys(OUTBOUND_TRANSITIONS));

export function isInboundStatus(status: string): status is InboundStatus {
  return INBOUND_STATUSES.has(status);
}

export function isOutboundStatus(status: string): status is OutboundStatus {
  return OUTBOUND_STATUSES.has(status);
}

export function statusMatchesDirection(
  direction: MessageDirection,
  status: string,
): boolean {
  return direction === "inbound" ? isInboundStatus(status) : isOutboundStatus(status);
}

export function isLegalTransition(
  direction: MessageDirection,
  fromStatus: string,
  toStatus: string,
): boolean {
  if (!statusMatchesDirection(direction, fromStatus) || !statusMatchesDirection(direction, toStatus)) {
    return false;
  }

  if (direction === "inbound") {
    return INBOUND_TRANSITIONS[fromStatus as InboundStatus].includes(toStatus as InboundStatus);
  }

  return OUTBOUND_TRANSITIONS[fromStatus as OutboundStatus].includes(toStatus as OutboundStatus);
}

export class IllegalStatusTransitionError extends Error {
  constructor(
    readonly messageId: string,
    readonly fromStatus: string,
    readonly toStatus: string,
  ) {
    super(`Illegal status transition for message ${messageId}: ${fromStatus} → ${toStatus}`);
    this.name = "IllegalStatusTransitionError";
  }
}
