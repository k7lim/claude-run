# Spike: Agent Wait Times in Markdown Export

## Goal
Identify where agents waited for human approval, so users can analyze across chats which tool calls cause delays and refine their allow-lists.

## Key Questions
1. Do JSONL messages have timestamps?
2. Can we infer wait time from gaps between messages?
3. Is there explicit "blocked on permission" data?

## Files to Investigate

### 1. Message Timestamp Field
**File:** `api/storage.ts` lines 21-34

Check `ConversationMessage` interface:
```typescript
timestamp?: string;  // ISO timestamp (optional)
```

Question: Is this reliably populated? Run:
```bash
head -50 ~/.claude/projects/*/sessions/*.jsonl | grep '"timestamp"'
```

### 2. Message Sequence for Wait Detection
A "wait" would appear as:
1. Assistant message with `tool_use` content block (agent requests tool)
2. Gap in time
3. User message with `tool_result` content block (human approved)

The gap between (1) and (3) = wait time.

**File:** `api/storage.ts` lines 308-329 (`getConversation()`)
- Messages are returned in order
- Each has `type: "user" | "assistant"`

### 3. Tool Use Content Structure
**File:** `web/components/message-block.tsx` lines 43-94

Content blocks have types:
- `tool_use` — agent requested a tool (has `name`, `input`)
- `tool_result` — result returned (has `tool_use_id`)

Check if `tool_use` blocks include the tool name:
```bash
grep -o '"type":"tool_use"[^}]*' ~/.claude/projects/*/sessions/*.jsonl | head -20
```

### 4. Sample Wait Time Calculation
Pseudocode:
```typescript
for (let i = 0; i < messages.length - 1; i++) {
  const current = messages[i];
  const next = messages[i + 1];

  if (current.type === 'assistant' && hasToolUse(current)) {
    if (next.type === 'user' && hasToolResult(next)) {
      const waitMs = new Date(next.timestamp) - new Date(current.timestamp);
      if (waitMs > THRESHOLD_MS) {
        // This was a significant wait
        recordWait(current.toolName, waitMs);
      }
    }
  }
}
```

## Deliverables
1. Confirm timestamps exist and are reliable
2. Confirm tool_use blocks include tool name
3. Propose threshold for "significant wait" (e.g., >5 seconds)
4. Design markdown output format:
   ```markdown
   ## Agent Wait Analysis
   | Tool | Wait Time | Context |
   |------|-----------|---------|
   | Bash | 45s | `rm -rf node_modules` |
   | Edit | 12s | `/src/index.ts` |
   ```

## Edge Cases
- Multiple tool_use in single assistant message
- Tool calls that don't require approval (already allowed)
- Sessions without timestamps (older format?)

## Implementation Location (if feasible)
- Add `analyzeWaitTimes()` to `api/storage.ts`
- Include in markdown export via new endpoint or option
