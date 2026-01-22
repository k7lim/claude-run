# Spike: Context % Filled Indicator

## Goal
Determine if we can show a "context % filled" indicator for sessions, helping users decide whether to resume (plenty of headroom) or reboot with compaction.

## Key Questions
1. What is the max context window for each model?
2. Is the model name reliably stored per session/message?
3. Can we compute current context usage from existing token data?

## Files to Investigate

### 1. JSONL Message Structure
**File:** `api/storage.ts` lines 21-53

Check the `ConversationMessage` interface:
- `message.model` — Does this field exist and is it populated?
- `message.usage` — Contains `input_tokens`, `output_tokens`, `cache_*` fields

### 2. Current Token Calculation
**File:** `api/storage.ts` lines 433-449

`getSessionTokens()` currently returns:
```typescript
{ inputTokens: number, outputTokens: number }
```
- `inputTokens` = last message's usage.input_tokens (current context size)
- `outputTokens` = sum of all output tokens

Question: Is `inputTokens` the right denominator numerator for "% filled"?

### 3. Model-to-Context-Limit Mapping
Need to create a mapping like:
```typescript
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-opus-4-5-20251101': 200000,
  'claude-sonnet-4-20250514': 200000,
  // etc.
};
```

Research: Where can we find authoritative context limits per model?

### 4. Sample JSONL Data
Run this to inspect a real session file:
```bash
head -20 ~/.claude/projects/*/sessions/*.jsonl | grep -E '"model"|"usage"'
```

Check:
- Is `model` field present on assistant messages?
- Is it consistent across the session or only on some messages?

## Deliverables
1. Confirm model field availability (yes/no/partial)
2. Confirm context limit can be determined (hardcoded map vs API)
3. Propose calculation: `(inputTokens / MODEL_CONTEXT_LIMITS[model]) * 100`
4. Note any edge cases (missing model, multiple models in one session)

## Implementation Location (if feasible)
- Add to `api/storage.ts` `getSessionTokens()` to also return `contextPercentFilled`
- Display in `web/components/session-list.tsx` line 161 alongside token count
