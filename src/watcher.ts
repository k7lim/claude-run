import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "events";
import { basename, dirname } from "path";

export interface WatcherEvents {
  historyChange: () => void;
  sessionChange: (sessionId: string) => void;
  projectChange: (projectId: string) => void;
}

export class ClaudeWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private readonly claudeDir: string;
  private readonly debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly debounceMs: number = 20;

  constructor(claudeDir: string) {
    super();
    this.claudeDir = claudeDir;
  }

  start(): void {
    if (this.watcher) {
      return;
    }

    const historyPath = `${this.claudeDir}/history.jsonl`;
    const projectsDir = `${this.claudeDir}/projects`;

    this.watcher = watch([historyPath, projectsDir], {
      persistent: true,
      ignoreInitial: true,
      usePolling: true,
      interval: 100,
      depth: 2,
    });

    this.watcher.on("change", (path) => this.handleChange(path));
    this.watcher.on("add", (path) => this.handleChange(path));
    this.watcher.on("error", (error) => {
      console.error("Watcher error:", error);
    });
  }

  private handleChange(path: string): void {
    const existing = this.debounceTimers.get(path);
    if (existing) {
      clearTimeout(existing);
    }

    const timer = setTimeout(() => {
      this.debounceTimers.delete(path);
      this.emitChange(path);
    }, this.debounceMs);

    this.debounceTimers.set(path, timer);
  }

  private emitChange(path: string): void {
    if (path.endsWith("history.jsonl")) {
      this.emit("historyChange");
    } else if (path.endsWith(".jsonl")) {
      const sessionId = basename(path, ".jsonl");
      const projectId = basename(dirname(path));
      this.emit("sessionChange", sessionId);
      this.emit("projectChange", projectId);
    }
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
