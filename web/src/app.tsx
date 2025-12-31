import { useState, useEffect, useCallback, useMemo } from "react";
import type { Session } from "@claude-run/shared";
import SessionList from "./components/session-list";
import SessionView from "./components/session-view";

function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((res) => res.json())
      .then(setProjects)
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);

    const eventSource = new EventSource("/api/sessions/stream");

    eventSource.addEventListener("sessions", (event) => {
      const data = JSON.parse(event.data);
      setSessions(data);
      setLoading(false);
    });

    eventSource.addEventListener("error", () => {
      setLoading(false);
    });

    return () => {
      eventSource.close();
    };
  }, []);

  const filteredSessions = useMemo(() => {
    if (!selectedProject) {
      return sessions;
    }
    return sessions.filter((s) => s.project === selectedProject);
  }, [sessions, selectedProject]);

  const handleSelectSession = useCallback((sessionId: string) => {
    setSelectedSession(sessionId);
  }, []);

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      <aside className="w-80 border-r border-zinc-800/60 flex flex-col bg-zinc-950">
        <div className="px-3 py-2 border-b border-zinc-800/60">
          <select
            value={selectedProject || ""}
            onChange={(e) => setSelectedProject(e.target.value || null)}
            className="w-full bg-transparent text-zinc-300 text-sm focus:outline-none cursor-pointer"
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
        </div>
        <SessionList
          sessions={filteredSessions}
          selectedSession={selectedSession}
          onSelectSession={handleSelectSession}
          loading={loading}
        />
      </aside>

      <main className="flex-1 overflow-hidden bg-zinc-950">
        {selectedSession ? (
          <SessionView sessionId={selectedSession} />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <div className="text-center">
              <div className="text-base mb-2 text-zinc-500">Select a session</div>
              <div className="text-sm text-zinc-600">
                Choose a session from the list to view the conversation
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
