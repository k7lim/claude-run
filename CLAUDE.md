# Claude Run

A web UI for browsing Claude Code conversation history stored in `~/.claude/`.

## Project Structure

```
src/                   # Server source (Node.js + Hono)
  index.ts             # CLI entry point (Commander)
  server.ts            # Hono server with REST API
  storage.ts           # Core logic for reading Claude data
  watcher.ts           # File system watcher for real-time updates

shared/                # Shared TypeScript types (workspace package)
  src/types.ts         # Common interfaces (Session, Message, etc.)

web/                   # React frontend (workspace package)
  src/
    app.tsx            # Main React app
    utils.ts           # Utility functions
    components/        # UI components
```

## How Claude Stores Data

Claude Code stores conversation data in `~/.claude/`:

- `history.jsonl` - Command history with session metadata. Each line is JSON with:
  - `display`: The user's prompt
  - `project`: **Actual filesystem path** (source of truth for project paths)
  - `timestamp`: Unix timestamp
  - `sessionId`: Links to session file

- `projects/` - Directory containing project folders named with encoded paths:
  - Encoding: `/` and `.` are replaced with `-`
  - Example: `/Users/foo/app.name` -> `-Users-foo-app-name`
  - Each project folder contains `.jsonl` session files

- Session files (`.jsonl`) - Each line is a conversation message with:
  - `type`: "user", "assistant", "summary", etc.
  - `cwd`: Working directory (another source of truth for project path)
  - `message`: The actual content

## Path Resolution Strategy

To get the correct project path from an encoded directory name:

1. **Primary**: Look up in `history.jsonl` by encoding the `project` field and matching
2. **Secondary**: Read `cwd` from the first line of any session file in the project
3. **Fallback**: Naive decode (replace `-` with `/`) - may be incorrect for paths with dots

The naive decode fails because `app.name` and `app/name` both encode to `app-name`.

## Development

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start both frontend and backend in dev mode
pnpm dev:server       # Start only backend (port 12001)
pnpm dev:web          # Start only frontend (port 12000)
pnpm build            # Build for production
```

## Publishing

The root package is the publishable npm package. Running `npm publish` will:
1. Build shared types, web frontend, and server
2. Publish `dist/` (server) and `web-dist/` (frontend) to npm

Users can then run `npx claude-run` to start the app.

## API Endpoints

- `GET /api/projects` - List all projects with decoded paths
- `GET /api/sessions` - Get all sessions
- `GET /api/sessions/stream` - SSE stream for real-time session updates
- `GET /api/conversation/:id` - Get conversation messages
- `GET /api/conversation/:id/stream` - SSE stream for real-time message updates
