import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Aperture,
  LayoutGrid,
  Image as ImageIcon,
  Settings,
  Plus,
  ArrowUpRight,
  ArrowRight,
  MoreHorizontal,
  Copy,
  Trash2,
  Pause,
  Play,
  Square,
  FolderOpen,
  Search,
  Check,
  X,
  Film,
  ChevronRight,
  Loader2,
} from "lucide-react";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/500.css";
import "@fontsource/source-sans-3/600.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/newsreader/400.css";
import { api, fmt } from "./api";
import {
  Button,
  Field,
  Modal,
  Status,
  Empty,
  Notice,
  Media,
} from "./components";
import { Editor } from "./editor";
import { Studio } from "./studio";
import "./style.css";

function App() {
  const [state, setState] = useState(null),
    [route, setRoute] = useState(location.hash.slice(1) || "tasks"),
    [toast, setToast] = useState(null),
    [offline, setOffline] = useState(false);
  const flushRef = useRef(null);
  const refreshSequence = useRef(0);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [route]);
  const notify = useCallback(
    (message, error = false) => setToast({ message, error, id: Date.now() }),
    [],
  );
  const refresh = useCallback(async () => {
    try {
      const sequence = ++refreshSequence.current;
      const s = await api("/state");
      if (sequence === refreshSequence.current) setState(s);
      setOffline(false);
      return s;
    } catch (e) {
      setOffline(true);
      throw e;
    }
  }, []);
  useEffect(() => {
    refresh().catch(() => {});
    const timer = setInterval(() => refresh().catch(() => {}), 2500);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const change = () => setRoute(location.hash.slice(1) || "tasks");
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!toast || toast.error) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const go = async (path) => {
    try {
      if (flushRef.current) await flushRef.current();
      await refresh();
      location.hash = path;
    } catch (e) {
      notify(e.message, true);
    }
  };
  const create = async (example = false) => {
    try {
      const t = await api("/tasks", { example });
      await refresh();
      go(`task/${t.id}/${example ? "prompt" : "references"}`);
    } catch (e) {
      notify(e.message, true);
    }
  };
  const taskId = route.split("/")[1],
    task = state?.tasks.find((t) => t.id === taskId);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#tasks"
          onClick={(e) => {
            e.preventDefault();
            go("tasks");
          }}
        >
          <span className="brand-mark">
            <Aperture size={25} strokeWidth={1.6} />
          </span>
          frame<span className="brand-period">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          <button
            className={route.startsWith("task") ? "active" : ""}
            onClick={() => go("tasks")}
          >
            <LayoutGrid size={18} />
            Tasks
            {state?.tasks.some((t) => t.status === "running") && (
              <span className="nav-count">
                {state.tasks.filter((t) => t.status === "running").length}
              </span>
            )}
          </button>
          <button
            className={route.startsWith("studio") ? "active" : ""}
            onClick={() => go("studio")}
          >
            <ImageIcon size={18} />
            Reference studio
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`settings-nav ${route === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings size={17} />
            Settings
          </button>
          <div className="local-state">
            <span className={`connection-dot ${offline ? "off" : ""}`} />
            <div>
              <strong>{offline ? "Connection lost" : "Running locally"}</strong>
              <span>
                {offline
                  ? "Reconnecting to Frame…"
                  : "Your files. Your workspace."}
              </span>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <span>Video production studio</span>
          <span className="local-label">
            LOCAL WORKSPACE <span className="tiny-dot" />
          </span>
        </div>
        {offline && (
          <div className="offline-banner" role="alert">
            Frame’s local service is unavailable. Your saved work is safe.
            Restart the service to reconnect.
          </div>
        )}
        {!state ? (
          <Empty
            title={offline ? "Let’s reconnect" : "Opening your workspace"}
            description={
              offline
                ? "Start Frame on this computer, then this page will reconnect."
                : "Loading your tasks and local assets."
            }
          />
        ) : route === "tasks" ? (
          <Dashboard
            state={state}
            create={create}
            go={go}
            refresh={refresh}
            notify={notify}
          />
        ) : route.startsWith("task/") ? (
          task ? (
            <Editor
              key={task.id}
              task={task}
              section={route.split("/")[2] || task.section || "references"}
              state={state}
              go={go}
              refresh={refresh}
              notify={notify}
              flushRef={flushRef}
            />
          ) : (
            <Empty
              title="Task not found"
              description="This task may have been removed."
            >
              <Button onClick={() => go("tasks")}>Back to tasks</Button>
            </Empty>
          )
        ) : route.startsWith("studio") ? (
          <Studio
            state={state}
            go={go}
            refresh={refresh}
            notify={notify}
            targetTaskId={new URLSearchParams(route.split("?")[1]).get("task")}
            initialAssetId={new URLSearchParams(route.split("?")[1]).get(
              "asset",
            )}
          />
        ) : (
          <SettingsPage state={state} refresh={refresh} notify={notify} />
        )}
      </main>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <span>!</span> : <Check size={18} />}
          <p>{toast.message}</p>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function Dashboard({ state, create, go, refresh, notify }) {
  const [filter, setFilter] = useState("All tasks"),
    [search, setSearch] = useState(""),
    [remove, setRemove] = useState(null),
    [busy, setBusy] = useState(null);
  const tasks = state.tasks.filter(
    (t) =>
      (filter === "All tasks" ||
        (filter === "In progress" &&
          ["running", "pausing"].includes(t.status)) ||
        (filter === "Drafts" && t.status === "draft") ||
        (filter === "Completed" && t.status === "complete")) &&
      t.name.toLowerCase().includes(search.toLowerCase()),
  );
  const action = async (t, a) => {
    setBusy(t.id);
    try {
      const result = await api(`/tasks/${t.id}/action`, { action: a });
      await refresh();
      if (a === "duplicate") go(`task/${result.id}/references`);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="page dashboard">
      <header className="page-heading">
        <div>
          <div className="eyebrow">THE CREATIVE WORKSPACE</div>
          <h1>Your next great take.</h1>
          <p>One idea. Every possibility. Keep your productions moving.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => create()}>
          New task
        </Button>
      </header>
      {!state.connection.configured && (
        <div className="setup-strip">
          <div>
            <span className="setup-icon">
              <Aperture size={20} />
            </span>
            <div>
              <strong>Your studio is ready to explore</strong>
              <span>
                Connect Gemini when you’re ready to generate. You can build and
                save tasks now.
              </span>
            </div>
          </div>
          <button className="text-button" onClick={() => go("settings")}>
            Set up connection <ArrowUpRight size={16} />
          </button>
        </div>
      )}
      <div className="collection-bar">
        <div className="tabs">
          {["All tasks", "In progress", "Drafts", "Completed"].map((f) => (
            <button
              className={filter === f ? "selected" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {f}
              {f === "All tasks" && <span>{state.tasks.length}</span>}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Search tasks"
            placeholder="Search tasks"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      {!state.tasks.length ? (
        <div className="welcome">
          <div className="welcome-art" aria-hidden="true">
            <div className="storyboard back">
              <span />
              <span />
              <span />
            </div>
            <div className="storyboard front">
              <div className="viewfinder">
                <span className="finder-corner tl" />
                <span className="finder-corner tr" />
                <Aperture size={44} strokeWidth={1} />
                <span className="finder-corner bl" />
                <span className="finder-corner br" />
              </div>
              <div className="storyboard-caption">
                <span>YOUR FIRST PRODUCTION</span>
                <span>01</span>
              </div>
            </div>
            <div className="floating-chip">
              An idea, with possibilities <span>✳</span>
            </div>
          </div>
          <span className="eyebrow">MAKE ROOM FOR YOUR IDEAS</span>
          <h2>
            A little direction.
            <br />A world of variations.
          </h2>
          <p>
            Turn a video prompt into a collection of possibilities.
            <br />
            Explore a few takes, then let your production unfold.
          </p>
          <div className="actions centered">
            <Button variant="primary" icon={Plus} onClick={() => create()}>
              Create your first task
            </Button>
            <Button
              variant="ghost"
              icon={ArrowRight}
              onClick={() => create(true)}
            >
              Explore an example
            </Button>
          </div>
          <div className="welcome-steps">
            <span>
              <b>01</b> Shape your idea
            </span>
            <ChevronRight size={14} />
            <span>
              <b>02</b> Try a few takes
            </span>
            <ChevronRight size={14} />
            <span>
              <b>03</b> Let it run
            </span>
          </div>
        </div>
      ) : tasks.length ? (
        <div className="task-grid">
          {tasks.map((t) => {
            const media =
              state.assets.find(
                (a) => a.taskId === t.id && a.kind === "production",
              ) || state.assets.find((a) => a.taskId === t.id);
            const running = t.status === "running";
            return (
              <article className="task-card" key={t.id}>
                <button
                  className="task-preview"
                  aria-label={`Open ${t.name}`}
                  onClick={() =>
                    go(`task/${t.id}/${running ? "results" : t.section}`)
                  }
                >
                  <Media asset={media} />
                  {!media && (
                    <span className="preview-label">
                      {t.prompt ? "An idea in the making" : "A blank canvas"}
                    </span>
                  )}
                  <span className="preview-format">
                    {t.settings.aspectRatio} <span>·</span>{" "}
                    {t.mode === "continuous" ? "Continuous" : "Batch"}
                  </span>
                </button>
                <div className="task-body">
                  <div className="task-status-row">
                    <Status
                      value={
                        t.status === "running" && t.stats.preparingFrame
                          ? "preparing_frame"
                          : t.status
                      }
                    />
                    <details className="overflow-menu">
                      <summary aria-label={`Options for ${t.name}`}>
                        <MoreHorizontal size={20} />
                      </summary>
                      <div>
                        <button onClick={() => go(`task/${t.id}/prompt`)}>
                          Edit task
                        </button>
                        <button onClick={() => action(t, "duplicate")}>
                          <Copy size={14} />
                          Duplicate
                        </button>
                        <button onClick={() => action(t, "stop")}>
                          <Square size={14} />
                          Stop production
                        </button>
                        <button
                          className="danger-text"
                          onClick={() => setRemove(t)}
                        >
                          <Trash2 size={14} />
                          Delete task
                        </button>
                      </div>
                    </details>
                  </div>
                  <h3>
                    <button
                      onClick={() =>
                        go(`task/${t.id}/${running ? "results" : t.section}`)
                      }
                    >
                      {t.name}
                    </button>
                  </h3>
                  <p className="task-excerpt">
                    {t.prompt ||
                      "Add your references and bring an idea into focus."}
                  </p>
                  <div className="task-progress">
                    <span>
                      <strong>{fmt(t.stats.completed)}</strong> videos created
                    </span>
                    <span>
                      {t.mode === "continuous"
                        ? "Ongoing"
                        : `${fmt(t.stats.total)} planned`}
                    </span>
                  </div>
                  {t.mode === "batch" && (
                    <div className="progress-track">
                      <div
                        style={{
                          width: `${Math.min(100, (t.stats.completed / Math.max(1, t.stats.total)) * 100)}%`,
                        }}
                      />
                    </div>
                  )}
                  <div className="task-footer">
                    <button
                      className="text-button"
                      onClick={() => go(`task/${t.id}/results`)}
                    >
                      View results <ArrowRight size={14} />
                    </button>
                    <Button
                      icon={running ? Pause : Play}
                      loading={busy === t.id}
                      disabled={["pausing", "stopping"].includes(t.status)}
                      onClick={() =>
                        running
                          ? action(t, "pause")
                          : ["paused", "stopped", "attention"].includes(
                                t.status,
                              )
                            ? action(t, "resume")
                            : go(`task/${t.id}/production`)
                      }
                    >
                      {running
                        ? "Pause"
                        : t.status === "paused"
                          ? "Resume"
                          : "Open task"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          small
          title="No tasks here yet"
          description="Try a different filter or create a new task."
        />
      )}
      {remove && (
        <Modal
          title={`Delete “${remove.name}”?`}
          onClose={() => setRemove(null)}
        >
          <p>
            Remove this task from Frame. Choose whether to keep its local files
            for use in other tools.
          </p>
          <div className="actions">
            <Button
              onClick={async () => {
                try {
                  await api(
                    `/tasks/${remove.id}`,
                    { deleteMedia: false },
                    "DELETE",
                  );
                  setRemove(null);
                  await refresh();
                  notify("Task removed. Your local files were kept.");
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Delete task, keep files
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (
                  !window.confirm(
                    "Permanently delete this task and all of its local media? This cannot be undone.",
                  )
                )
                  return;
                try {
                  await api(
                    `/tasks/${remove.id}`,
                    { deleteMedia: true },
                    "DELETE",
                  );
                  setRemove(null);
                  await refresh();
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Delete task and files
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function SettingsPage({ state, refresh, notify }) {
  const [folder, setFolder] = useState(state.settings.outputDir),
    [busy, setBusy] = useState(false),
    [apiKey, setApiKey] = useState(""),
    [savingKey, setSavingKey] = useState(false),
    [result, setResult] = useState(null);
  return (
    <div className="page settings-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">MAKE YOURSELF AT HOME</span>
          <h1>Studio settings</h1>
          <p>
            A few essentials. Everything else belongs to your creative process.
          </p>
        </div>
      </header>
      <section className="panel">
        <div className="section-title">
          <Aperture size={22} />
          <div>
            <h2>Gemini connection</h2>
            <p>
              {state.connection.configured
                ? "Your API key is configured on this computer."
                : "Connect your Google AI Studio account to start generating."}
            </p>
          </div>
          <span
            className={`status ${state.connection.configured ? "complete" : "draft"}`}
          >
            <span />
            {state.connection.configured ? "Key configured" : "Not connected"}
          </span>
        </div>
        {!state.connection.configured && (
          <div className="setup-instructions">
            <p>
              Get an API key from Google AI Studio, then paste it below. Frame
              saves it in this app’s private <code>.env</code> file.
            </p>
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
            >
              Get a key in Google AI Studio <ArrowUpRight size={14} />
            </a>
          </div>
        )}
        <Field
          label={
            state.connection.configured ? "Replace API key" : "Gemini API key"
          }
          hint="Your saved key is never displayed. You can also configure it directly in .env."
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              state.connection.configured
                ? "Enter a new key to replace the current one"
                : "Paste your Google AI Studio key"
            }
          />
        </Field>
        <div className="actions">
          <Button
            variant="primary"
            loading={savingKey}
            disabled={!apiKey.trim()}
            onClick={async () => {
              setSavingKey(true);
              try {
                await api("/connection/key", { key: apiKey });
                setApiKey("");
                await refresh();
                notify("Connection key saved on this computer.");
              } catch (e) {
                notify(e.message, true);
              } finally {
                setSavingKey(false);
              }
            }}
          >
            Save connection
          </Button>
          <Button
            loading={busy}
            disabled={!state.connection.configured}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api("/connection/check", {});
                setResult(
                  r.videoAvailable
                    ? "Connected. Omni is available to your account."
                    : "Connected. Omni was not listed for your account; check model access in Google AI Studio.",
                );
              } catch (e) {
                notify(e.message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            Check connection
          </Button>
        </div>
        {result && <p className="helper">{result}</p>}
      </section>
      <section className="panel">
        <div className="section-title">
          <FolderOpen size={22} />
          <div>
            <h2>Your local files</h2>
            <p>Media is saved here, ready for your editing tools.</p>
          </div>
        </div>
        <Field
          label="Folder for new tasks"
          hint="Existing task folders stay where they are. Use a full path on this computer."
        >
          <input value={folder} onChange={(e) => setFolder(e.target.value)} />
        </Field>
        <div className="actions">
          <Button
            icon={FolderOpen}
            onClick={async () => {
              try {
                const result = await api("/choose-folder", {});
                if (result.folder) setFolder(result.folder);
              } catch (e) {
                notify(e.message, true);
              }
            }}
          >
            Choose folder
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              try {
                await api("/settings", { outputDir: folder }, "PUT");
                await refresh();
                notify("Output folder saved.");
              } catch (e) {
                notify(e.message, true);
              }
            }}
          >
            Save folder
          </Button>
          <Button
            icon={FolderOpen}
            onClick={() =>
              api("/open-folder", {}).catch((e) => notify(e.message, true))
            }
          >
            Open folder
          </Button>
        </div>
      </section>
      <section className="panel subtle">
        <h2>While you’re away</h2>
        <p>
          Frame keeps creating after you close the browser, as long as this
          computer is awake and the local service is running. If the computer
          restarts, reopen Frame and resume your tasks.
        </p>
      </section>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="fatal">
          <h1>Let’s reopen your workspace.</h1>
          <p>Your saved work is still on this computer.</p>
          <button onClick={() => location.reload()}>Reload Frame</button>
          <details>
            <summary>Details</summary>
            {this.state.error.message}
          </details>
        </div>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
