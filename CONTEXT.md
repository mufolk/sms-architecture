# Conversational SMS

A conversational SMS system: it receives messages through a Twilio webhook, processes them
asynchronously, and replies over the same channel. An admin browses the history through a web
interface.

## Language

**Conversation**:
The thread of messages exchanged between one Inbound Number and one User Number. Its identity is
that pair, permanently — there is no session window.
_Avoid_: Thread, chat, session

**Inbound Number**:
A phone number we control and receive SMS on. The system may have several.
_Avoid_: Our number, from number, sender

**User Number**:
The phone number of the person on the other side of a Conversation.
_Avoid_: Customer, client, recipient, account

**Message**:
A single SMS belonging to a Conversation. It has a direction, which determines which set of
statuses applies to it.
_Avoid_: SMS, text, event

**Inbound Message**:
A Message sent by a User Number to an Inbound Number. Moves through
`received → processing → processed | failed`.

**Outbound Message**:
A Message we send to a User Number. Moves through
`queued → sent → delivered | undelivered | failed`. When produced by processing, it points at
the Inbound Message that caused it.
_Avoid_: Response, answer

**Provider Message SID**:
The identifier Twilio assigns to a Message. It is the deduplication key: two webhook deliveries
carrying the same SID are the same Message.
_Avoid_: Message ID, external ID

**Delivery Receipt**:
An asynchronous notification from Twilio, arriving after the send, stating whether the carrier
delivered the Outbound Message. It is what moves `sent` to `delivered` or `undelivered`.
_Avoid_: Status callback, ACK, confirmation

**Sent**:
Twilio accepted the Outbound Message for delivery. It does not mean the message reached the
handset — _delivered_ means that.

**Failure Notice**:
An Outbound Message sent to the User Number when processing of an Inbound Message fails for
good. It does not answer the content; it says no answer is coming.
_Avoid_: Apology, error message, bounce

**Needs Attention**:
A mark on a Conversation that has at least one Inbound Message in `failed`, telling the operator
that thread stalled and needs human intervention.
_Avoid_: Flagged, error state, alert
