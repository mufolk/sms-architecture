# QA — manual battery

A Postman collection and environment that drive the system through its seam: in through
`POST /webhooks/sms`, observed through the admin REST (ADR-0011).

## Running it

1. `docker compose up -d --build` at the repo root.
2. Postman → Import → `postman-collection.json` and `postman-environment.json`; select the
   **Conversational SMS — Local** environment.
3. Fire folder by folder, or the whole collection in the Runner with a ~400ms delay.

From the command line:

```
npx newman run .scratch/conversational-sms/qa/postman-collection.json \
  -e .scratch/conversational-sms/qa/postman-environment.json --delay-request 400
```

## What each folder covers

| Folder | Covers | Needs the worker |
|---|---|---|
| 1. Health | `/health`, `/ready` | no |
| 2. Webhook — happy path | valid payload, unicode, empty Body, 2000-char Body | no |
| 3. Webhook — invalid payload | missing fields, empty body, wrong content type, wrong verb | no |
| 4. Redelivery | the same `MessageSid` twice, and with a tampered body (ADR-0004) | no |
| 5. Admin REST | list, thread, unknown id, malformed id, quote injection | no |
| 6. End to end | post → poll until the reply is out, asserting the outbound Message | **yes** |
| 7. Degraded — Redis down | webhook fails fast, admin reads keep serving, `/ready` reports it | no |
| 8. Web | the skeleton page on :3001 | no |

With the stack up, every folder is green. Folder 7 is written to pass in both states, so a full run
stays green whether or not you stopped Redis; to actually exercise the degraded path run
`docker compose stop redis`, fire the folder, then `docker compose start redis`.

## Known gaps this battery does not cover

- A Message persisted just before a `503 queue unavailable` stays in `received` forever: the Twilio
  redelivery is absorbed by the dedupe (ADR-0004) and nothing re-enqueues it. The reaper in ticket 05
  is what closes this.
- `GET /conversations` comes back ascending by `lastMessageAt` and unbounded. Ticket 03 wants most
  recent first.

Reset the test data with `docker compose down -v`.
