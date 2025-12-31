import { readdir, readFile, stat } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import type {
  HistoryEntry,
  Session,
  ConversationMessage,
  StreamResult,
} from "@claude-run/shared";

export class ClaudeStorage {
  private readonly claudeDir: string;
  private readonly projectsDir: string;
  private readonly fileIndex: Map<string, string> = new Map();

  constructor(claudeDir?: string) {
    this.claudeDir = claudeDir ?? join(homedir(), ".claude");
    this.projectsDir = join(this.claudeDir, "projects");
  }

  private encodeProjectPath(path: string): string {
    return path.replace(/[/.]/g, "-");
  }

  private getProjectName(projectPath: string): string {
    const parts = projectPath.split("/").filter(Boolean);
    return parts[parts.length - 1] || projectPath;
  }

  async getSessions(): Promise<Session[]> {
    const sessions: Session[] = [];
    const seenIds = new Set<string>();

    try {
      const historyPath = join(this.claudeDir, "history.jsonl");
      const content = await readFile(historyPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry: HistoryEntry = JSON.parse(line);

          let sessionId = entry.sessionId;
          if (!sessionId) {
            const encodedProject = this.encodeProjectPath(entry.project);
            sessionId = await this.findSessionByTimestamp(
              encodedProject,
              entry.timestamp
            );
          }

          if (!sessionId || seenIds.has(sessionId)) {
            continue;
          }

          seenIds.add(sessionId);
          sessions.push({
            id: sessionId,
            display: entry.display,
            timestamp: entry.timestamp,
            project: entry.project,
            projectName: this.getProjectName(entry.project),
          });
        } catch {
          continue;
        }
      }
    } catch (err) {
      console.error("Error reading history:", err);
    }

    return sessions.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getProjects(): Promise<string[]> {
    const projects = new Set<string>();

    try {
      const historyPath = join(this.claudeDir, "history.jsonl");
      const content = await readFile(historyPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const entry: HistoryEntry = JSON.parse(line);
          if (entry.project) {
            projects.add(entry.project);
          }
        } catch {
          continue;
        }
      }
    } catch {
      // Ignore errors
    }

    return [...projects].sort();
  }

  private async findSessionByTimestamp(
    encodedProject: string,
    timestamp: number
  ): Promise<string | null> {
    try {
      const projectPath = join(this.projectsDir, encodedProject);
      const files = await readdir(projectPath);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      let closestFile: string | null = null;
      let closestTimeDiff = Infinity;

      for (const file of jsonlFiles) {
        const filePath = join(projectPath, file);
        const fileStat = await stat(filePath);
        const fileTime = fileStat.mtimeMs;
        const timeDiff = Math.abs(fileTime - timestamp);

        if (timeDiff < closestTimeDiff) {
          closestTimeDiff = timeDiff;
          closestFile = file;
        }
      }

      if (closestFile) {
        return basename(closestFile, ".jsonl");
      }
    } catch {
      // Project directory doesn't exist
    }

    return null;
  }

  async findSessionFile(sessionId: string): Promise<string | null> {
    if (this.fileIndex.has(sessionId)) {
      return this.fileIndex.get(sessionId)!;
    }

    try {
      const projectDirs = await readdir(this.projectsDir, {
        withFileTypes: true,
      });

      for (const dir of projectDirs) {
        if (!dir.isDirectory()) {
          continue;
        }

        const projectPath = join(this.projectsDir, dir.name);
        const files = await readdir(projectPath);

        for (const file of files) {
          if (file === `${sessionId}.jsonl`) {
            const filePath = join(projectPath, file);
            this.fileIndex.set(sessionId, filePath);
            return filePath;
          }
        }
      }
    } catch (err) {
      console.error("Error finding session file:", err);
    }

    return null;
  }

  async getConversation(sessionId: string): Promise<ConversationMessage[]> {
    const filePath = await this.findSessionFile(sessionId);

    if (!filePath) {
      return [];
    }

    const messages: ConversationMessage[] = [];

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const msg: ConversationMessage = JSON.parse(line);
          if (msg.type === "user" || msg.type === "assistant") {
            messages.push(msg);
          } else if (msg.type === "summary") {
            messages.unshift(msg);
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch (err) {
      console.error("Error reading conversation:", err);
    }

    return messages;
  }

  async getConversationStream(
    sessionId: string,
    fromOffset: number = 0
  ): Promise<StreamResult> {
    const filePath = await this.findSessionFile(sessionId);

    if (!filePath) {
      return { messages: [], nextOffset: 0 };
    }

    const messages: ConversationMessage[] = [];

    try {
      const fileStat = await stat(filePath);
      const fileSize = fileStat.size;

      if (fromOffset >= fileSize) {
        return { messages: [], nextOffset: fromOffset };
      }

      const content = await readFile(filePath, "utf-8");
      const slicedContent = content.slice(fromOffset);

      if (!slicedContent) {
        return { messages: [], nextOffset: fromOffset };
      }

      const lines = slicedContent.split("\n");
      let bytesConsumed = 0;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineBytes =
          Buffer.byteLength(line, "utf-8") + (i < lines.length - 1 ? 1 : 0);

        if (line.trim()) {
          try {
            const msg: ConversationMessage = JSON.parse(line);
            if (msg.type === "user" || msg.type === "assistant") {
              messages.push(msg);
            }
            bytesConsumed += lineBytes;
          } catch {
            break;
          }
        } else {
          bytesConsumed += lineBytes;
        }
      }

      return {
        messages,
        nextOffset: fromOffset + bytesConsumed,
      };
    } catch (err) {
      console.error("Error reading conversation stream:", err);
      return { messages: [], nextOffset: fromOffset };
    }
  }

  getClaudeDir(): string {
    return this.claudeDir;
  }

  getProjectsDir(): string {
    return this.projectsDir;
  }
}
