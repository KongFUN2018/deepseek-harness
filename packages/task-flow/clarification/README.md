# @deepseek-ai/dsh-clarification

English | [中文](README.zh.md)

Persistent clarification service (`ctx.clarifications`): idempotent question/answer requests over one phase run, each linked to a `kind='clarification'` attention item. When every required question is answered, the service injects the answer summary as a model-visible user message into the phase session, records the persisted session event id, marks the request injected, resolves the linked attention item, appends the journal fact, and resumes the parked phase run out of `awaiting-input`.

## Configuration

The service has no tunables. It requires the storage domain, the workbench journal, the task service, the session store, and the attention service; a bundle lists them plus this package.

```yaml
- id: storage-domain
  name: '@deepseek-ai/dsh-storage-domain'
- id: workbench-journal
  name: '@deepseek-ai/dsh-workbench-journal'
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: session
  name: '@deepseek-ai/dsh-session'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: clarification
  name: '@deepseek-ai/dsh-clarification'
```

## Service contract

- `createRequest(phaseRunId, questions, actor, idempotencyKey)` — create one request over a phase run; `questions` is a non-empty list of `{ phaseId, required, order, text }`. The service assigns the request and question ids and, in the same write chain, creates the linked attention item (`itemId='clarification:<requestId>'`, `options=['satisfied']`). Replaying a caller key with the same questions returns the stored request; different questions fail with `conflict`.
- `answerPartial(questionId, expectedRevision, answer, actor, idempotencyKey)` — record one answer at the question's current revision. Replaying the same revision with the same value returns the stored answer; a different value fails with `conflict`, as does a mismatched `expectedRevision`. When the answer completes every required question, the service injects the summary, resolves the linked attention item with `optionId='satisfied'`, and resumes the run.
- `getRequest(requestId)` — read one request, or `undefined` when unknown.
- `listOpen(phaseRunId)` — the open requests of one phase run, in creation order.

Entities live in the `clarification` domain: `ClarificationRequest` (`requestId`, `phaseRunId`, `taskId`, `questionIds`, `injectedEventId?`, `state`: open/injected/closed, `revision`, `createdAt`), `Question` (adds the assigned `questionId`/`requestId` and a `revision` to the question input), and `Answer` (`questionId`, `actor`, `value`, `submittedAt`, `revision`).

## Recovery

Injection commits through the journal fact `clarification/injected` whose idempotency key is one per request. A restart replays that fact instead of trusting a process-local promise: an open request whose injected fact exists re-applies the recorded `injectedEventId` and resumes without appending a second session message, while one without the fact runs the full inject path.

## Invariant

The `./invariant` companion checks reference integrity on the `domain/changed` stream: a question must name a stored request, an answer must name a stored question, and a request-key entry must name a stored request.

## Model Experience

### The injected clarification summary

#### What the model sees

One `user/message` session event containing the answered summary lines (`<question>: <answer>`, required and optional, in request order). The message is appended to the phase session only once the required questions are all answered.

#### Token effect

One extra user turn per completed clarification request, sized by the summed question and answer text.

#### KV Cache effect

The injected message extends the phase session's log with one new user message; earlier turns are unchanged.

## Known Limitations and Deferred Work

- **System-resolved item only.** The linked clarification item carries the single internal option `satisfied`; users answer questions, they never pick a decision option, and the item resolves automatically once every required question is answered.
- **Sequential phase chain only.** Clarification resumes the parked phase run; it introduces no phase DAG or parallel scheduling.
- **Injected summary is a single user message.** Per-question granularity and answer editing beyond the idempotent partial answer are not modeled.
