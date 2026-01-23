# Spike: Model Name Availability in JSONL

## Goal
Confirm whether the `model` field is reliably populated in Claude session JSONL files, as this is a prerequisite for both displaying model info and calculating context % filled.

## Key Questions
1. Is `message.model` present on assistant messages?
2. Is it present on all assistant messages or just some?
3. What model ID formats appear? (e.g., `claude-opus-4-5-20251101` vs `claude-3-opus`)
4. Are there sessions with no model data at all?

## Files to Investigate

### 1. TypeScript Interface
**File:** `api/storage.ts` lines 21-34

```typescript
interface ConversationMessage {
  message?: {
    model?: string;  // <-- Is this populated?
    // ...
  };
}
```

### 2. Sample Data Analysis

Run these commands to inspect real data:

```bash
# Count how many assistant messages have model field
echo "=== Messages with model field ==="
grep -rh '"role":"assistant"' ~/.claude/projects/*/sessions/*.jsonl 2>/dev/null | grep -c '"model"'

echo "=== Messages without model field ==="
grep -rh '"role":"assistant"' ~/.claude/projects/*/sessions/*.jsonl 2>/dev/null | grep -cv '"model"'

# See what model IDs appear
echo "=== Unique model IDs ==="
grep -roh '"model":"[^"]*"' ~/.claude/projects/*/sessions/*.jsonl 2>/dev/null | sort | uniq -c | sort -rn

# Check a few full message structures
echo "=== Sample assistant messages ==="
grep -rh '"role":"assistant"' ~/.claude/projects/*/sessions/*.jsonl 2>/dev/null | head -3 | jq -c '{model: .message.model, usage: .message.usage}'
```

### 3. Edge Cases to Check

```bash
# Oldest sessions (might predate model field)
ls -t ~/.claude/projects/*/sessions/*.jsonl | tail -5 | xargs -I{} sh -c 'echo "=== {} ===" && grep -o "\"model\":\"[^\"]*\"" {} | head -1'

# Newest sessions (should have model)
ls -t ~/.claude/projects/*/sessions/*.jsonl | head -5 | xargs -I{} sh -c 'echo "=== {} ===" && grep -o "\"model\":\"[^\"]*\"" {} | head -1'
```

### 4. Multiple Models in One Session?

```bash
# Check if any session has multiple different models
for f in ~/.claude/projects/*/sessions/*.jsonl; do
  models=$(grep -oh '"model":"[^"]*"' "$f" 2>/dev/null | sort -u | wc -l)
  if [ "$models" -gt 1 ]; then
    echo "Multi-model session: $f"
    grep -oh '"model":"[^"]*"' "$f" | sort -u
  fi
done
```

## Deliverables

1. **Availability %**: What fraction of assistant messages have `model` populated?
2. **Model ID list**: What distinct model IDs appear in your sessions?
3. **Consistency**: Same model throughout session, or can it vary?
4. **Gaps**: Any sessions/messages where model is missing?

## Decision Matrix

| Finding | Action |
|---------|--------|
| Model present on 100% of messages | Proceed to build display + % filled |
| Model present on most, missing on old | Build with "unknown" fallback |
| Model varies within session | Display per-message, use last for % calc |
| Model rarely present | Feature not feasible, close tickets |

## Next Steps (if feasible)

1. Create `getSessionModel()` in `api/storage.ts` (extract from first/last assistant message)
2. Add to session detail view header in `web/components/session-view.tsx`
3. Feed into context % calculation in `2lx`
