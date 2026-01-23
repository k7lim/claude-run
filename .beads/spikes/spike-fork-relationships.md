# Spike: Fork Relationships in Sessions

## Goal
Determine if Claude Code's JSONL format encodes fork/branch relationships, enabling a "view forks of session" feature.

## Key Questions
1. Does `parentUuid` link messages across sessions (forks) or just within a session?
2. Is there a `sessionId` reference that could link forked sessions?
3. How does Claude Code handle forking internally?

## Files to Investigate

### 1. Message UUID Fields
**File:** `api/storage.ts` lines 21-34

```typescript
interface ConversationMessage {
  uuid?: string;        // Message unique ID
  parentUuid?: string;  // Parent message reference
  sessionId?: string;   // Session ID
}
```

Questions:
- Does `parentUuid` ever reference a UUID from a *different* session file?
- Is `sessionId` stored in messages, and could it reference a parent session?

### 2. Sample Data Analysis
Run these to understand the structure:

```bash
# Check if parentUuid exists and what it looks like
grep -h '"parentUuid"' ~/.claude/projects/*/sessions/*.jsonl | head -10

# Check if sessionId is stored in messages
grep -h '"sessionId"' ~/.claude/projects/*/sessions/*.jsonl | head -10

# Compare UUIDs across different session files in same project
for f in ~/.claude/projects/*/sessions/*.jsonl; do
  echo "=== $f ==="
  grep -o '"uuid":"[^"]*"' "$f" | head -3
done | head -40
```

### 3. History Entry Structure
**File:** `api/storage.ts` lines 6-11

```typescript
interface HistoryEntry {
  sessionId?: string;
  // ... no parent reference here
}
```

The history.jsonl doesn't seem to track parent-child relationships.

### 4. Claude Code Source (External)
If fork data isn't in the JSONL, check if Claude Code stores it elsewhere:
- `~/.claude/` directory structure
- Any metadata files alongside sessions

```bash
ls -la ~/.claude/
find ~/.claude -name "*.json" -not -name "*.jsonl" | head -10
```

## Possible Outcomes

### A. Fork data exists
- `parentUuid` crosses session boundaries, OR
- There's a separate metadata file tracking forks
- → Build UI to show fork tree

### B. Fork data is implicit
- Sessions share common message UUIDs at the fork point
- → Could reconstruct by comparing UUID sets across sessions
- → More complex, potentially expensive

### C. Fork data doesn't exist
- Claude Code doesn't persist fork relationships
- → Feature not feasible without upstream changes
- → Close ticket, note limitation

## Deliverables
1. Document what fork-related data exists (or doesn't)
2. If exists: propose data model for fork tree
3. If implicit: estimate complexity of reconstruction
4. Recommend: build, defer, or close the ticket
