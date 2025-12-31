# Claude Run

A beautiful web UI for browsing Claude Code conversation history.

## Quick Start

```bash
npx claude-run
```

Then open http://localhost:12001 in your browser.

## Installation

```bash
npm install -g claude-run
```

## Features

- **Real-time streaming** - Watch conversations update live as Claude responds
- **Search** - Find sessions by prompt text or project name
- **Filter by project** - Focus on specific projects
- **Dark mode** - Easy on the eyes
- **Clean UI** - Familiar chat interface with collapsible tool calls

## Usage

```bash
claude-run [options]

Options:
  -V, --version        Show version number
  -p, --port <number>  Port to listen on (default: 12001)
  -d, --dir <path>     Claude directory (default: ~/.claude)
  -h, --help           Show help
```

## How It Works

Claude Code stores conversation history in `~/.claude/`. This tool reads that data and presents it in a web interface with:

1. **Session list** - All your conversations, sorted by recency
2. **Project filter** - Focus on a specific project
3. **Conversation view** - Full message history with tool calls
4. **Real-time updates** - SSE streaming for live conversations

## Requirements

- Node.js 20+
- Claude Code installed and used at least once

## Development

```bash
# Clone the repo
git clone https://github.com/kamranahmedse/claude-run.git
cd claude-run

# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Build for production
pnpm build
```

## Project Structure

```
packages/
  shared/     # Shared TypeScript types
  server/     # Node.js backend (Hono + Commander)
  web/        # React frontend (Vite + Tailwind)
```

## License

MIT
