import { readdir, readFile, writeFile, stat, open } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { createInterface } from "readline";

export interface HistoryEntry {
  display: string;
  timestamp: number;
  project: string;
  sessionId?: string;
}

export interface Session {
  id: string;
  display: string;
  timestamp: number;
  firstTimestamp?: number;
  project: string;
  projectName: string;
  archived?: boolean;
}

export interface ConversationMessage {
  type: "user" | "assistant" | "summary" | "file-history-snapshot";
  uuid?: string;
  parentUuid?: string;
  timestamp?: string;
  sessionId?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    usage?: TokenUsage;
  };
  summary?: string;
}

export interface ContentBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string | ContentBlock[];
  is_error?: boolean;
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export interface SessionTokens {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface StreamResult {
  messages: ConversationMessage[];
  nextOffset: number;
}

export interface SearchMatch {
  text: string;
  role: "user" | "assistant";
}

export interface SearchResult {
  sessionId: string;
  display: string;
  projectName: string;
  project: string;
  timestamp: number;
  matches: SearchMatch[];
}

let claudeDir = join(homedir(), ".claude");
let projectsDir = join(claudeDir, "projects");
const fileIndex = new Map<string, string>();
let historyCache: HistoryEntry[] | null = null;
let historyCacheTime = 0;
const HISTORY_CACHE_TTL_MS = 5000;
const pendingRequests = new Map<string, Promise<unknown>>();
const tokenCache = new Map<string, { tokens: SessionTokens; size: number; mtime: number }>();
const firstTimestampCache = new Map<string, number>();
const archivedSessions = new Set<string>();

function getArchivedPath(): string {
  return join(claudeDir, "claude-run-archived.json");
}

async function loadArchivedSessions(): Promise<void> {
  try {
    const content = await readFile(getArchivedPath(), "utf-8");
    const ids: string[] = JSON.parse(content);
    archivedSessions.clear();
    for (const id of ids) archivedSessions.add(id);
  } catch {
    // File doesn't exist yet
  }
}

async function saveArchivedSessions(): Promise<void> {
  await writeFile(
    getArchivedPath(),
    JSON.stringify([...archivedSessions]),
    "utf-8"
  );
}

export async function archiveSession(sessionId: string): Promise<void> {
  archivedSessions.add(sessionId);
  await saveArchivedSessions();
}

export async function unarchiveSession(sessionId: string): Promise<void> {
  archivedSessions.delete(sessionId);
  await saveArchivedSessions();
}

export function isArchived(sessionId: string): boolean {
  return archivedSessions.has(sessionId);
}

export function initStorage(dir?: string): void {
  claudeDir = dir ?? join(homedir(), ".claude");
  projectsDir = join(claudeDir, "projects");
}

export function getClaudeDir(): string {
  return claudeDir;
}

export function invalidateHistoryCache(): void {
  historyCache = null;
  historyCacheTime = 0;
}

export function invalidateTokenCache(sessionId?: string): void {
  if (sessionId) {
    tokenCache.delete(sessionId);
  } else {
    tokenCache.clear();
  }
}

export function addToFileIndex(sessionId: string, filePath: string): void {
  fileIndex.set(sessionId, filePath);
}

function encodeProjectPath(path: string): string {
  return path.replace(/[/.]/g, "-");
}

function getProjectName(projectPath: string): string {
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}

async function buildFileIndex(): Promise<void> {
  try {
    const projectDirs = await readdir(projectsDir, { withFileTypes: true });
    const directories = projectDirs.filter((d) => d.isDirectory());

    await Promise.all(
      directories.map(async (dir) => {
        try {
          const projectPath = join(projectsDir, dir.name);
          const files = await readdir(projectPath);
          for (const file of files) {
            if (file.endsWith(".jsonl")) {
              const sessionId = basename(file, ".jsonl");
              fileIndex.set(sessionId, join(projectPath, file));
            }
          }
        } catch {
          // Ignore errors for individual directories
        }
      })
    );
  } catch {
    // Projects directory may not exist yet
  }
}

async function loadHistoryCache(): Promise<HistoryEntry[]> {
  try {
    const historyPath = join(claudeDir, "history.jsonl");
    const content = await readFile(historyPath, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);
    const entries: HistoryEntry[] = [];

    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    historyCache = entries;
    historyCacheTime = Date.now();
    return entries;
  } catch {
    historyCache = [];
    historyCacheTime = Date.now();
    return [];
  }
}

async function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = pendingRequests.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
}

async function findSessionByTimestamp(
  encodedProject: string,
  timestamp: number
): Promise<string | undefined> {
  try {
    const projectPath = join(projectsDir, encodedProject);
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    const fileStats = await Promise.all(
      jsonlFiles.map(async (file) => {
        const filePath = join(projectPath, file);
        const fileStat = await stat(filePath);
        return { file, mtime: fileStat.mtimeMs };
      })
    );

    let closestFile: string | null = null;
    let closestTimeDiff = Infinity;

    for (const { file, mtime } of fileStats) {
      const timeDiff = Math.abs(mtime - timestamp);
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

  return undefined;
}

async function findSessionFile(sessionId: string): Promise<string | null> {
  if (fileIndex.has(sessionId)) {
    return fileIndex.get(sessionId)!;
  }

  const targetFile = `${sessionId}.jsonl`;

  try {
    const projectDirs = await readdir(projectsDir, { withFileTypes: true });
    const directories = projectDirs.filter((d) => d.isDirectory());

    const results = await Promise.all(
      directories.map(async (dir) => {
        try {
          const projectPath = join(projectsDir, dir.name);
          const files = await readdir(projectPath);
          if (files.includes(targetFile)) {
            return join(projectPath, targetFile);
          }
        } catch {
          // Ignore errors for individual directories
        }
        return null;
      })
    );

    const filePath = results.find((r) => r !== null);
    if (filePath) {
      fileIndex.set(sessionId, filePath);
      return filePath;
    }
  } catch (err) {
    console.error("Error finding session file:", err);
  }

  return null;
}

async function getFirstTimestamp(sessionId: string): Promise<number | undefined> {
  if (firstTimestampCache.has(sessionId)) {
    return firstTimestampCache.get(sessionId);
  }
  const filePath = fileIndex.get(sessionId);
  if (!filePath) return undefined;
  try {
    const content = await readFile(filePath, "utf-8");
    const firstNewline = content.indexOf("\n");
    const firstLine = firstNewline > 0 ? content.slice(0, firstNewline) : content;
    if (!firstLine.trim()) return undefined;
    const msg: ConversationMessage = JSON.parse(firstLine);
    if (msg.timestamp) {
      const ts = new Date(msg.timestamp).getTime();
      firstTimestampCache.set(sessionId, ts);
      return ts;
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function loadStorage(): Promise<void> {
  await Promise.all([buildFileIndex(), loadHistoryCache(), loadArchivedSessions()]);
}

function isHistoryCacheStale(): boolean {
  return !historyCache || (Date.now() - historyCacheTime > HISTORY_CACHE_TTL_MS);
}

export async function getSessions(includeArchived = false): Promise<Session[]> {
  return dedupe(`getSessions:${includeArchived}`, async () => {
    const entries = isHistoryCacheStale() ? await loadHistoryCache() : historyCache!;
    const sessions: Session[] = [];
    const seenIds = new Set<string>();

    for (const entry of entries) {
      let sessionId = entry.sessionId;
      if (!sessionId) {
        const encodedProject = encodeProjectPath(entry.project);
        sessionId = await findSessionByTimestamp(encodedProject, entry.timestamp);
      }

      if (!sessionId || seenIds.has(sessionId)) {
        continue;
      }

      const archived = archivedSessions.has(sessionId);
      if (archived && !includeArchived) {
        continue;
      }

      seenIds.add(sessionId);
      sessions.push({
        id: sessionId,
        display: entry.display,
        timestamp: entry.timestamp,
        project: entry.project,
        projectName: getProjectName(entry.project),
        archived,
      });
    }

    await Promise.all(
      sessions.map(async (s) => {
        s.firstTimestamp = await getFirstTimestamp(s.id);
      })
    );

    return sessions.sort((a, b) => b.timestamp - a.timestamp);
  });
}

export async function getProjects(): Promise<string[]> {
  const entries = isHistoryCacheStale() ? await loadHistoryCache() : historyCache!;
  const projects = new Set<string>();

  for (const entry of entries) {
    if (entry.project) {
      projects.add(entry.project);
    }
  }

  return [...projects].sort();
}

export async function getConversation(
  sessionId: string
): Promise<ConversationMessage[]> {
  return dedupe(`getConversation:${sessionId}`, async () => {
    const filePath = await findSessionFile(sessionId);

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
  });
}

export async function getConversationStream(
  sessionId: string,
  fromOffset: number = 0
): Promise<StreamResult> {
  const filePath = await findSessionFile(sessionId);

  if (!filePath) {
    return { messages: [], nextOffset: 0 };
  }

  const messages: ConversationMessage[] = [];

  let fileHandle;
  try {
    const fileStat = await stat(filePath);
    const fileSize = fileStat.size;

    if (fromOffset >= fileSize) {
      return { messages: [], nextOffset: fromOffset };
    }

    fileHandle = await open(filePath, "r");
    const stream = fileHandle.createReadStream({
      start: fromOffset,
      encoding: "utf-8",
    });

    const rl = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    let bytesConsumed = 0;

    for await (const line of rl) {
      const lineBytes = Buffer.byteLength(line, "utf-8") + 1;

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

    const actualOffset = fromOffset + bytesConsumed;
    const nextOffset = actualOffset > fileSize ? fileSize : actualOffset;

    return { messages, nextOffset };
  } catch (err) {
    console.error("Error reading conversation stream:", err);
    return { messages: [], nextOffset: fromOffset };
  } finally {
    if (fileHandle) {
      await fileHandle.close();
    }
  }
}

export async function getSessionTokens(
  sessionId: string
): Promise<SessionTokens | null> {
  return dedupe(`getSessionTokens:${sessionId}`, async () => {
    const filePath = await findSessionFile(sessionId);

    if (!filePath) {
      return null;
    }

    let fileHandle;
    try {
      const fileStat = await stat(filePath);
      const fileSize = fileStat.size;
      const mtime = fileStat.mtimeMs;

      const cached = tokenCache.get(sessionId);
      if (cached && cached.size === fileSize && cached.mtime === mtime) {
        return cached.tokens;
      }

      fileHandle = await open(filePath, "r");
      const stream = fileHandle.createReadStream({
        encoding: "utf-8",
      });

      const rl = createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      let lastUsage: { input: number; cacheCreation: number; cacheRead: number } | null = null;
      let totalOutputTokens = 0;

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          const usage = msg?.message?.usage;
          if (usage) {
            lastUsage = {
              input: usage.input_tokens || 0,
              cacheCreation: usage.cache_creation_input_tokens || 0,
              cacheRead: usage.cache_read_input_tokens || 0,
            };
            totalOutputTokens += usage.output_tokens || 0;
          }
        } catch {
          // Skip malformed lines
        }
      }

      const tokens: SessionTokens = {
        inputTokens: lastUsage ? lastUsage.input + lastUsage.cacheCreation + lastUsage.cacheRead : 0,
        outputTokens: totalOutputTokens,
        cacheCreationTokens: lastUsage?.cacheCreation || 0,
        cacheReadTokens: lastUsage?.cacheRead || 0,
      };

      tokenCache.set(sessionId, { tokens, size: fileSize, mtime });
      return tokens;
    } catch {
      return null;
    } finally {
      if (fileHandle) {
        await fileHandle.close();
      }
    }
  });
}

function extractTextContent(msg: ConversationMessage): string {
  const content = msg.message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join(" ");
}

function extractSnippet(text: string, query: string, maxLen: number = 120): string {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet = snippet + "...";
  return snippet;
}

export async function searchSessions(
  query: string,
  maxResults: number = 20
): Promise<SearchResult[]> {
  if (!query || query.length < 2) return [];

  const sessions = await getSessions();
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const lowerQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  for (const [sessionId, filePath] of fileIndex.entries()) {
    if (results.length >= maxResults) break;

    const session = sessionMap.get(sessionId);
    if (!session) continue;

    try {
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      const matches: SearchMatch[] = [];

      for (const line of lines) {
        if (matches.length >= 3) break;
        try {
          const msg: ConversationMessage = JSON.parse(line);
          if (msg.type !== "user" && msg.type !== "assistant") continue;
          const text = extractTextContent(msg);
          if (text.toLowerCase().includes(lowerQuery)) {
            matches.push({
              text: extractSnippet(text, query),
              role: msg.type,
            });
          }
        } catch {
          continue;
        }
      }

      if (matches.length > 0) {
        results.push({
          sessionId,
          display: session.display,
          projectName: session.projectName,
          project: session.project,
          timestamp: session.timestamp,
          matches,
        });
      }
    } catch {
      continue;
    }
  }

  return results.sort((a, b) => b.timestamp - a.timestamp);
}
