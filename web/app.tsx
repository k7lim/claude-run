import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Session, SessionTokens, ConversationMessage } from "@claude-run/api";
import { PanelLeft, Copy, Check, FileText, Archive, ArchiveRestore } from "lucide-react";
import { formatTime } from "./utils";
import { conversationToMarkdown } from "./utils/conversation-to-markdown";
import SessionList from "./components/session-list";
import SessionView from "./components/session-view";
import { useEventSource } from "./hooks/use-event-source";

interface SessionHeaderProps {
  session: Session;
  copied: boolean;
  markdownCopied: boolean;
  onCopyResumeCommand: (sessionId: string, projectPath: string) => void;
  onCopyMarkdown: () => void;
  onArchiveToggle: (sessionId: string, archived: boolean) => void;
}

function SessionHeader(props: SessionHeaderProps) {
  const { session, copied, markdownCopied, onCopyResumeCommand, onCopyMarkdown, onArchiveToggle } = props;

  return (
    <>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span className="text-sm text-zinc-300 truncate max-w-xs">
          {session.display}
        </span>
        <span className="text-xs text-zinc-600 shrink-0">
          {session.projectName}
        </span>
        <span className="text-xs text-zinc-600 shrink-0">
          {formatTime(session.timestamp)}
        </span>
      </div>
      <button
        onClick={onCopyMarkdown}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer shrink-0"
        title="Copy conversation as markdown"
      >
        {markdownCopied ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-500" />
            <span className="text-green-500">Copied!</span>
          </>
        ) : (
          <>
            <FileText className="w-3.5 h-3.5" />
            <span>Copy Markdown</span>
          </>
        )}
      </button>
      <button
        onClick={() => onArchiveToggle(session.id, !session.archived)}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer shrink-0"
        title={session.archived ? "Unarchive session" : "Archive session"}
      >
        {session.archived ? (
          <>
            <ArchiveRestore className="w-3.5 h-3.5" />
            <span>Unarchive</span>
          </>
        ) : (
          <>
            <Archive className="w-3.5 h-3.5" />
            <span>Archive</span>
          </>
        )}
      </button>
      <button
        onClick={() => onCopyResumeCommand(session.id, session.project)}
        className="flex items-center gap-2 px-2.5 py-1.5 text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors cursor-pointer shrink-0"
        title="Copy resume command to clipboard"
      >
        {copied ? (
          <>
            <Check className="w-3.5 h-3.5 text-green-500" />
            <span className="text-green-500">Copied!</span>
          </>
        ) : (
          <>
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Resume Command</span>
          </>
        )}
      </button>
    </>
  );
}

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const [sessionTokens, setSessionTokens] = useState<Record<string, SessionTokens>>({});
  const currentMessagesRef = useRef<ConversationMessage[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  const handleCopyResumeCommand = useCallback(
    (sessionId: string, projectPath: string) => {
      const command = `cd ${projectPath} && claude --resume ${sessionId}`;
      navigator.clipboard.writeText(command).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    },
    [],
  );

  const handleCopyMarkdown = useCallback(() => {
    const markdown = conversationToMarkdown(currentMessagesRef.current);
    navigator.clipboard.writeText(markdown).then(() => {
      setMarkdownCopied(true);
      setTimeout(() => setMarkdownCopied(false), 2000);
    });
  }, []);

  const handleMessagesChange = useCallback((messages: ConversationMessage[]) => {
    currentMessagesRef.current = messages;
  }, []);

  const selectedSessionData = useMemo(() => {
    if (!selectedSession) {
      return null;
    }

    return sessions.find((s) => s.id === selectedSession) || null;
  }, [sessions, selectedSession]);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setProjects)
      .catch(console.error);
  }, []);

  const handleSessionsFull = useCallback((event: MessageEvent) => {
    const data: Session[] = JSON.parse(event.data);
    setSessions(data);
    setLoading(false);
  }, []);

  const handleSessionsUpdate = useCallback((event: MessageEvent) => {
    const updates: Session[] = JSON.parse(event.data);
    setSessions((prev) => {
      const sessionMap = new Map(prev.map((s) => [s.id, s]));
      for (const update of updates) {
        sessionMap.set(update.id, update);
      }
      return Array.from(sessionMap.values()).sort(
        (a, b) => b.timestamp - a.timestamp,
      );
    });
  }, []);

  const handleArchiveToggle = useCallback(
    (sessionId: string, archive: boolean) => {
      const method = archive ? "POST" : "DELETE";
      fetch(`/api/sessions/${sessionId}/archive`, { method }).then(() => {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        setSelectedSession((prev) => (prev === sessionId ? null : prev));
      });
    },
    [],
  );

  const handleSessionsError = useCallback(() => {
    setLoading(false);
  }, []);

  const streamUrl = showArchived
    ? "/api/sessions/stream?archived=true"
    : "/api/sessions/stream";

  useEventSource(streamUrl, {
    events: [
      { eventName: "sessions", onMessage: handleSessionsFull },
      { eventName: "sessionsUpdate", onMessage: handleSessionsUpdate },
    ],
    onError: handleSessionsError,
  });

  const filteredSessions = useMemo(() => {
    if (!selectedProject) {
      return sessions;
    }
    return sessions.filter((s) => s.project === selectedProject);
  }, [sessions, selectedProject]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSession(sessionId);
  }, []);

  const handleVisibleSessionsChange = useCallback((visibleIds: string[]) => {
    const idsToFetch = visibleIds.filter((id) => !(id in sessionTokens));
    if (idsToFetch.length === 0) return;

    for (const id of idsToFetch) {
      fetch(`/api/sessions/${id}/tokens`)
        .then((res) => (res.ok ? res.json() : null))
        .then((tokens) => {
          if (tokens) {
            setSessionTokens((prev) => ({ ...prev, [id]: tokens }));
          }
        })
        .catch(() => {});
    }
  }, [sessionTokens]);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {!sidebarCollapsed && (
        <aside className="w-80 border-r border-zinc-800/60 flex flex-col bg-zinc-950">
          <div className="border-b border-zinc-800/60">
            <label htmlFor={"select-project"} className="block w-full px-1">
              <select
                id={"select-project"}
                value={selectedProject || ""}
                onChange={(e) => setSelectedProject(e.target.value || null)}
                className="w-full h-[50px] bg-transparent text-zinc-300 text-sm focus:outline-none cursor-pointer px-5 py-4"
              >
                <option value="">All Projects</option>
                {projects.map((project) => {
                  const name = project.split("/").pop() || project;
                  return (
                    <option key={project} value={project}>
                      {name}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="flex items-center gap-2 px-5 pb-3 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="accent-cyan-600"
              />
              <span className="text-[11px] text-zinc-500">Show archived</span>
            </label>
          </div>
          <SessionList
            sessions={filteredSessions}
            selectedSession={selectedSession}
            onSelectSession={handleSelectSession}
            loading={loading}
            tokens={sessionTokens}
            onVisibleSessionsChange={handleVisibleSessionsChange}
          />
        </aside>
      )}

      <main className="flex-1 overflow-hidden bg-zinc-950 flex flex-col">
        <div className="h-[50px] border-b border-zinc-800/60 flex items-center px-4 gap-4">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <PanelLeft className="w-4 h-4 text-zinc-400" />
          </button>
          {selectedSessionData && (
            <SessionHeader
              session={selectedSessionData}
              copied={copied}
              markdownCopied={markdownCopied}
              onCopyResumeCommand={handleCopyResumeCommand}
              onCopyMarkdown={handleCopyMarkdown}
              onArchiveToggle={handleArchiveToggle}
            />
          )}
        </div>
        <div className="flex-1 overflow-hidden">
          {selectedSession ? (
            <SessionView sessionId={selectedSession} onMessagesChange={handleMessagesChange} />
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-600">
              <div className="text-center">
                <div className="text-base mb-2 text-zinc-500">
                  Select a session
                </div>
                <div className="text-sm text-zinc-600">
                  Choose a session from the list to view the conversation
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
