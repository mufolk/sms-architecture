# Full Stack Staff Engineer — Technical Assessment

## Overview

This assessment is designed to evaluate how you design, architect, and implement scalable systems.

We are less interested in pixel-perfect UI or production-grade polish.  
We are interested in how you think, structure your code, and make architectural decisions under realistic constraints.

Please assume this system will eventually operate in production at scale.

⏱ Suggested time: 4–6 hours  
📦 Submission: GitHub repository or compressed project  
📄 Include a short architecture/design document (required)

---

# Scenario

You are building a conversational SMS system.

## User Journey

1. A user sends an SMS message.
2. The system processes the message (processing takes 3–15 seconds).
3. The user receives a response via SMS.

The system integrates with Twilio.

Additionally:

An Admin can navigate to a web interface and view conversation histories.

Authentication is not required for this exercise.

---

# Requirements

## 1. Twilio Integration

For this exercise, assume Twilio provides:

- A webhook endpoint that posts incoming SMS messages.
- An API endpoint to send outbound SMS messages.

Constraints:

- The Twilio webhook has a 5-second timeout.
- Your message processing takes 3–15 seconds.
- Duplicate webhook deliveries may occur.
- Message ordering is not guaranteed.
- The system must not lose messages.

You may mock Twilio if preferred.

---

## 2. Backend API

Build a backend service that:

- Receives incoming SMS webhook events
- Stores conversations and messages
- Processes the message (3–15 seconds simulated delay is fine)
- Sends outbound SMS responses
- Tracks message status (received, processing, sent, failed)

You are free to choose architectural patterns and structure.

Use TypeScript.

You may use SQL, MongoDB, Redis, or a combination.

---

## 3. Admin Frontend

Build a minimal frontend that allows:

- Viewing a list of conversations
- Clicking into a conversation
- Viewing all inbound and outbound messages
- Seeing message status

No authentication required.

UI polish is not important. Structure and clarity are.

---

# Architecture & Design Document (Required)

Include a short document (Markdown is fine) explaining:

- Your system architecture
- How you handle the 5-second webhook timeout
- How you decouple message processing
- How you prevent duplicate processing (idempotency)
- How you ensure messages are not lost
- Data modeling decisions
- Tradeoffs you made
- What you would change for production scale

Clarity of reasoning is more important than length.

---

# Technical Expectations

We are evaluating:

- API design quality
- System architecture decisions
- Asynchronous processing strategy
- Data modeling
- Code organization
- Scalability awareness
- Clean, maintainable TypeScript
- Testing strategy (brief explanation is sufficient)

---

# Optional (If Time Allows)

- Containerization (Docker)
- Basic automated tests
- Deployment notes
- Monitoring/logging considerations

These are optional and should not compromise core implementation quality.

---

# What Matters Most

We value:

- Thoughtful architectural decisions
- Clear reasoning
- Clean code
- Practical tradeoffs
- Product mindset
- Ownership and autonomy

We do not expect perfection.  
We want to understand how you think.

---

We look forward to reviewing your submission.