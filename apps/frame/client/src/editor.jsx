import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Upload,
  Image as ImageIcon,
  FolderOpen,
  Check,
  Loader2,
  Braces,
  Sparkles,
  History,
  ChevronUp,
  ChevronDown,
  X,
  Play,
  Pause,
  Film,
  Infinity as InfinityIcon,
  Layers,
  Info,
  Search,
  RotateCcw,
} from "lucide-react";
import { api, pretty, names, total, resolved, fmt, uploadFile } from "./api";
import { FrameSettings } from "./frame-editor";
import { FrameSamples } from "./frame-samples";
import {
  taskNames,
  frameEnabled,
  frameNames,
  frameCount,
  activeVariables,
  variableStage,
  imageRecipes,
  activeImageRecipes,
  recipeFor,
  updateImageRecipe,
  promptNames,
  dependsOnImage,
} from "../../shared/task-variables.js";
import { VariableDialog } from "./variable-dialog";
import {
  Button,
  Field,
  Modal,
  Status,
  Empty,
  Notice,
  Media,
  AssetCard,
  AssetDetail,
  AssetPicker,
  Jobs,
} from "./components";

const sections = [
  "references",
  "prompt",
  "variations",
  "samples",
  "production",
];
const sectionLabels = {
  references: "References",
  prompt: "Prompt",
  variations: "Variations",
  samples: "Samples",
  production: "Production",
};
function useDraft(task, flushRef) {
  const [draft, setDraft] = useState(task),
    [saveState, setSaveState] = useState("Saved"),
    [saveError, setSaveError] = useState(null);
  const current = useRef(task),
    dirty = useRef(false),
    version = useRef(0),
    saving = useRef(null),
    lastFailure = useRef(false);
  const change = (patch) => {
    const next = { ...current.current, ...patch };
    if (
      patch.prompt !== undefined ||
      patch.startingFrame !== undefined ||
      patch.imageVariations !== undefined
    )
      next.variables = [
        ...new Set([
          ...taskNames(next),
          ...imageRecipes(next).flatMap((c) => names(c.prompt)),
        ]),
      ].map(
        (name) =>
          next.variables.find((v) => v.name === name) || {
            name,
            values: [],
            instructions: "",
            expand: false,
          },
      );
    current.current = next;
    dirty.current = true;
    lastFailure.current = false;
    version.current++;
    setDraft(next);
    setSaveState("Unsaved changes");
    setSaveError(null);
  };
  const flush = async () => {
    if (saving.current) {
      await saving.current;
      if (dirty.current) return flush();
      return current.current;
    }
    if (!dirty.current) return current.current;
    const sentVersion = version.current,
      body = structuredClone(current.current);
    setSaveState("Saving…");
    const work = (async () => {
      try {
        const saved = await api(`/tasks/${task.id}`, body, "PUT");
        if (version.current === sentVersion) {
          current.current = saved;
          dirty.current = false;
        } else
          current.current = {
            ...current.current,
            revision: saved.revision,
            versions: saved.versions,
            history: saved.history,
            imageVariations: imageRecipes(current.current).map((c) => ({
              ...c,
              versions:
                imageRecipes(saved).find(
                  (s) => s.sourceAssetId === c.sourceAssetId,
                )?.versions || [],
            })),
            startingFrame: current.current.startingFrame
              ? {
                  ...current.current.startingFrame,
                  versions: saved.startingFrame?.versions || [],
                }
              : null,
          };
        setDraft(current.current);
        setSaveState(dirty.current ? "Unsaved changes" : "Saved");
        setSaveError(null);
        return current.current;
      } catch (e) {
        lastFailure.current = true;
        setSaveState("Could not save");
        setSaveError(e.message);
        throw e;
      } finally {
        saving.current = null;
      }
    })();
    saving.current = work;
    await work;
    if (dirty.current) return flush();
    return current.current;
  };
  flushRef.current = flush;
  useEffect(() => {
    if (
      !dirty.current &&
      !saving.current &&
      task.revision >= current.current.revision
    ) {
      current.current = task;
      setDraft(task);
    }
  }, [task.revision, task.status, task.error]);
  useEffect(() => {
    if (!dirty.current || lastFailure.current) return;
    const timer = setTimeout(() => flush().catch(() => {}), 650);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    const warn = (e) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (dirty.current) flush().catch(() => {});
      flushRef.current = null;
    };
  }, []);
  return { draft, change, flush, saveState, saveError };
}
export function Editor({
  task,
  section,
  state,
  go,
  refresh,
  notify,
  flushRef,
}) {
  const {
    draft: t,
    change,
    flush,
    saveState,
    saveError,
  } = useDraft(task, flushRef);
  const [busy, setBusy] = useState(false),
    [detail, setDetail] = useState(null);
  const taskJobs = state.jobs.filter((j) => j.taskId === task.id),
    locked =
      ["running", "pausing", "stopping"].includes(task.status) ||
      taskJobs.some((j) =>
        ["submitting", "submitted", "downloading"].includes(j.status),
      );
  const assets = state.assets.filter((a) => a.taskId === task.id);
  const work = async (fn) => {
    setBusy(true);
    try {
      await flush();
      await fn();
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const navigate = async (s) => {
    if (!locked) change({ section: s === "results" ? t.section : s });
    await go(`task/${task.id}/${s}`);
  };
  const next = sections[sections.indexOf(section) + 1];
  const common = {
    task: t,
    state,
    change,
    flush,
    work,
    busy,
    locked,
    refresh,
    notify,
    go,
  };
  return (
    <div className="page editor">
      <div className="editor-breadcrumb">
        <button onClick={() => go("tasks")}>
          <ArrowLeft size={15} />
          All tasks
        </button>
        <span>/</span>
        <span>{task.name}</span>
      </div>
      <header className="editor-heading">
        <div>
          <input
            className="task-name"
            aria-label="Task name"
            value={t.name}
            disabled={locked}
            onChange={(e) => change({ name: e.target.value })}
            onBlur={() => {
              if (!t.name.trim()) change({ name: "Untitled task" });
            }}
          />
          <div className="editor-subtitle">
            <span className={`save-state ${saveError ? "danger-text" : ""}`}>
              {saveState === "Saving…" ? (
                <Loader2 className="spin" size={13} />
              ) : saveError ? (
                <Info size={13} />
              ) : (
                <Check size={13} />
              )}{" "}
              {saveState}
            </span>
            <span className="dot-separator">·</span>
            <Status value={task.status} />
          </div>
        </div>
        <div className="actions">
          <Button
            icon={FolderOpen}
            onClick={() =>
              api("/open-folder", { taskId: t.id }).catch((e) =>
                notify(e.message, true),
              )
            }
          >
            Open folder
          </Button>
          <Button
            variant={section === "results" ? "primary" : "secondary"}
            icon={Film}
            onClick={() =>
              navigate(section === "results" ? "prompt" : "results")
            }
          >
            {section === "results"
              ? "Edit task"
              : `Results${assets.filter((a) => a.kind === "production").length ? ` · ${assets.filter((a) => a.kind === "production").length}` : ""}`}
          </Button>
        </div>
      </header>
      {saveError && (
        <Notice error>
          {saveError}{" "}
          <button
            className="text-button"
            onClick={() => flush().catch((e) => notify(e.message, true))}
          >
            Retry save
          </button>
        </Notice>
      )}
      {task.error && <Notice error>{task.error}</Notice>}
      {locked && (
        <div className="running-banner">
          <Loader2 size={17} className="spin" />
          <span>
            {task.status === "pausing" || task.status === "stopping"
              ? "Finishing active images and videos. Editing will unlock when they are saved."
              : task.stats.preparingFrame
                ? "Preparing reference images. Its videos will follow automatically."
                : "Your videos are taking shape. Let active generations finish before editing."}
          </span>
          {task.status === "running" && (
            <Button
              icon={Pause}
              onClick={() =>
                work(() => api(`/tasks/${t.id}/action`, { action: "pause" }))
              }
            >
              Pause production
            </Button>
          )}
        </div>
      )}
      {section === "results" ? (
        <Results
          assets={assets}
          jobs={taskJobs}
          state={state}
          task={t}
          refresh={refresh}
          notify={notify}
          onDetail={setDetail}
        />
      ) : (
        <>
          <nav className="step-nav" aria-label="Task setup">
            {sections.map((s, i) => (
              <button
                key={s}
                aria-current={s === section ? "step" : undefined}
                className={s === section ? "active" : ""}
                onClick={() => navigate(s)}
              >
                <span className="step-number">{i + 1}</span>
                {sectionLabels[s]}
              </button>
            ))}
          </nav>
          <div className="editor-layout">
            <div className="editor-content">
              <fieldset disabled={locked || busy} className="editor-fieldset">
                {section === "references" ? (
                  <References {...common} />
                ) : section === "prompt" ? (
                  <Prompt {...common} />
                ) : section === "variations" ? (
                  <Variations {...common} />
                ) : section === "samples" ? (
                  <Samples
                    {...common}
                    assets={assets}
                    jobs={taskJobs}
                    onDetail={setDetail}
                  />
                ) : (
                  <Production {...common} />
                )}
              </fieldset>
              {next && (
                <div className="step-footer">
                  <span>
                    {section === "references"
                      ? frameEnabled(t)
                        ? "Next, write your video and image prompts."
                        : "References are optional. Start with your idea."
                      : section === "prompt"
                        ? "Your original idea stays yours."
                        : section === "variations"
                          ? "Try a few combinations before producing the full batch."
                          : "Samples are saved separately from production."}
                  </span>
                  <Button
                    variant="primary"
                    icon={ArrowRight}
                    onClick={() => navigate(next)}
                  >
                    Continue to {sectionLabels[next].toLowerCase()}
                  </Button>
                </div>
              )}
              {section === "samples" && (
                <div className="sample-results">
                  <div className="section-title">
                    <div>
                      <h2>Your sample takes</h2>
                      <p>
                        Saved here from the first experiment. Always separate
                        from production.
                      </p>
                    </div>
                    <span className="count-badge">
                      {assets.filter((a) => a.kind === "sample").length}
                    </span>
                  </div>
                  <Jobs
                    jobs={taskJobs.filter(
                      (j) =>
                        j.kind === "sample" ||
                        (j.kind === "frame" &&
                          taskJobs.some(
                            (v) =>
                              v.kind === "sample" &&
                              dependsOnImage(v, j.id) &&
                              ["waiting", "blocked"].includes(v.status),
                          )),
                    )}
                    refresh={refresh}
                    notify={notify}
                  />
                  {assets.some((a) => a.kind === "sample") ? (
                    <div className="asset-grid">
                      {assets
                        .filter((a) => a.kind === "sample")
                        .map((a) => (
                          <AssetCard key={a.id} asset={a} onClick={setDetail} />
                        ))}
                    </div>
                  ) : (
                    !taskJobs.some((j) => j.kind === "sample") && (
                      <Empty
                        small
                        title="A little experimentation goes a long way"
                        description="Your sample videos will appear here, ready to compare."
                      />
                    )
                  )}
                </div>
              )}
            </div>
            <aside className="task-summary">
              <div className="eyebrow">YOUR PRODUCTION</div>
              <h3>
                One idea,
                <br />
                many possibilities.
              </h3>
              <div className="summary-line">
                <span>Dynamic parts</span>
                <strong>{taskNames(t).length}</strong>
              </div>
              <div className="summary-line">
                <span>Combinations</span>
                <strong>{t.prompt ? fmt(total(t)) : 0}</strong>
              </div>
              <div className="summary-line">
                <span>Takes each</span>
                <strong>{t.takes}</strong>
              </div>
              <div className="summary-total">
                <span>
                  {t.mode === "continuous" ? "Starting with" : "Planned videos"}
                </span>
                <strong>
                  {t.prompt ? fmt(total(t) * t.takes) : 0}
                  <span>{t.mode === "continuous" ? "+" : ""}</span>
                </strong>
              </div>
              <p>
                {t.mode === "continuous"
                  ? "New ideas keep expanding your production until you pause or reach your limit."
                  : "Every combination gets its own takes. Samples are extra."}
              </p>
              {taskNames(t).length > 0 && (
                <div className="summary-math">
                  {activeVariables(t)
                    .map((v) => `${v.values.length} ${pretty(v.name)}`)
                    .join(" × ")}
                </div>
              )}
              {frameEnabled(t) && (
                <div className="summary-line">
                  <span>Reference images</span>
                  <strong>
                    {fmt(frameCount(t))}{" "}
                    <small>
                      ·{" "}
                      {state.tasks.find((x) => x.id === t.id)?.stats.frames
                        ?.ready || 0}{" "}
                      ready
                    </small>
                  </strong>
                </div>
              )}
              <div className="summary-format">
                <span>
                  {t.settings.aspectRatio === "16:9" ? "Landscape" : "Portrait"}
                </span>
                <span>{t.settings.resolution.toUpperCase()}</span>
              </div>
            </aside>
          </div>
        </>
      )}
      {detail && (
        <AssetDetail
          asset={detail}
          frameAssets={(
            detail.metadata?.generatedReferences || [
              { assetId: detail.metadata?.frameAssetId },
            ]
          )
            .map((r) => assets.find((a) => a.id === r.assetId))
            .filter(Boolean)}
          onRepeat={
            locked || detail.kind === "frame"
              ? undefined
              : (a) =>
                  work(async () => {
                    await api(`/jobs/${a.metadata.jobId}/repeat`, {});
                    setDetail(null);
                    notify("Another take is on its way.");
                  })
          }
          onClose={() => setDetail(null)}
          onRefine={(a) => {
            setDetail(null);
            go(`studio?task=${t.id}&asset=${a.id}`);
          }}
        />
      )}
    </div>
  );
}
function Intro({ eyebrow, title, description }) {
  return (
    <div className="editor-intro">
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
function References({
  task: t,
  state,
  change,
  flush,
  work,
  busy,
  refresh,
  notify,
  go,
}) {
  const [picker, setPicker] = useState(false),
    [drag, setDrag] = useState(false);
  const input = useRef();
  const files = (files) =>
    work(async () => {
      for (const file of files) await uploadFile(file, t.id);
    });
  const refAssets = t.references.map((r) => ({
    ...r,
    asset: state.assets.find((a) => a.id === r.assetId),
  }));
  return (
    <>
      <Intro
        eyebrow="01 / SET THE SCENE"
        title="Start with a little inspiration."
        description="Bring a subject, a look, or a starting frame. Keep references fixed, or choose which images should vary between videos."
      />
      <div
        className={`dropzone ${drag ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          files([...e.dataTransfer.files]);
        }}
      >
        <span className="upload-symbol">
          <Upload size={25} strokeWidth={1.5} />
        </span>
        <h3>Drop your images or videos here</h3>
        <p>PNG, JPEG, WebP, MP4 or WebM · Up to 100 MB each</p>
        <Button
          icon={Plus}
          loading={busy}
          onClick={() => input.current.click()}
        >
          Choose files
        </Button>
        <input
          ref={input}
          type="file"
          aria-label="Import task references"
          className="sr-only"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          multiple
          onChange={(e) => {
            files([...e.target.files]);
            e.target.value = "";
          }}
        />
      </div>
      <div className="reference-options">
        <button onClick={() => setPicker(true)}>
          <ImageIcon size={20} />
          <span>
            <strong>Choose from your library</strong>
            <small>Reuse something you’ve already made</small>
          </span>
          <ArrowRight size={17} />
        </button>
        <button onClick={() => go(`studio?task=${t.id}`)}>
          <Sparkles size={20} />
          <span>
            <strong>Create a reference</strong>
            <small>Explore an image or video in the studio</small>
          </span>
          <ArrowRight size={17} />
        </button>
      </div>
      {refAssets.length > 0 && (
        <div className="reference-list">
          {refAssets.map((r, i) => (
            <div className="reference-row" key={r.assetId}>
              <div className="reference-thumb">
                <Media asset={r.asset} />
              </div>
              <div className="reference-copy">
                <strong>{r.asset?.name || "Missing reference"}</strong>
                <span>
                  {r.asset?.mime.startsWith("video/")
                    ? `${r.asset.duration ? `${r.asset.duration.toFixed(1)} sec · ` : ""}Video`
                    : "Image"}
                </span>
                <Field label="Use this as">
                  <select
                    value={r.role}
                    onChange={(e) =>
                      change({
                        references: t.references.map((x, j) =>
                          j === i ? { ...x, role: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    {state.capabilities.roles
                      .filter((role) =>
                        r.asset?.mime.startsWith("image/")
                          ? !["Video to edit", "Video to extend"].includes(role)
                          : !["Starting frame", "Ending frame"].includes(role),
                      )
                      .map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                  </select>
                </Field>
                {r.asset?.mime.startsWith("image/") && (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={!!recipeFor(t, r.assetId)?.enabled}
                      onChange={(e) =>
                        change(
                          updateImageRecipe(t, {
                            ...(recipeFor(t, r.assetId) || {
                              prompt: "",
                              settings: {
                                model: "gemini-3.1-flash-image",
                                aspectRatio: "auto",
                                imageSize: "1K",
                              },
                              versions: [],
                            }),
                            enabled: e.target.checked,
                            sourceAssetId: r.assetId,
                          }),
                        )
                      }
                    />
                    <div>
                      <strong>Vary this image</strong>
                      <span>
                        Write its prompt in the next step, then build its lists
                        in Variations.
                      </span>
                    </div>
                  </label>
                )}
                {r.asset?.mime.startsWith("video/") &&
                  (!r.asset.duration ||
                    r.asset.duration >
                      (["Video to edit", "Video to extend"].includes(r.role)
                        ? 10
                        : 3)) && (
                    <p className="inline-error">
                      Use a clip of{" "}
                      {["Video to edit", "Video to extend"].includes(r.role)
                        ? 10
                        : 3}{" "}
                      seconds or less for this purpose.
                    </p>
                  )}
              </div>
              <Button
                icon={X}
                variant="ghost"
                aria-label={`Remove ${r.asset?.name || "reference"}`}
                onClick={() =>
                  change({ references: t.references.filter((_, j) => j !== i) })
                }
              />
            </div>
          ))}
        </div>
      )}
      {activeImageRecipes(t)
        .filter((c) => !t.references.some((r) => r.assetId === c.sourceAssetId))
        .map((config) => (
          <Notice error key={config.sourceAssetId}>
            A varied image is no longer in References. Restore it or{" "}
            <button
              className="text-button"
              onClick={() =>
                change(updateImageRecipe(t, { ...config, enabled: false }))
              }
            >
              turn off its variations
            </button>
            .
          </Notice>
        ))}
      {picker && (
        <AssetPicker
          assets={state.assets.filter(
            (a) => !t.references.some((r) => r.assetId === a.id),
          )}
          onClose={() => setPicker(false)}
          onPick={(a) =>
            work(async () => {
              await api(`/assets/${a.id}/attach`, { taskId: t.id });
              setPicker(false);
            })
          }
        />
      )}
    </>
  );
}
function Prompt(props) {
  const { task, state, change } = props;
  const [selected, setSelected] = useState("video");
  const configs = activeImageRecipes(task);
  const config = configs.find((c) => c.sourceAssetId === selected);
  const target = config ? config.sourceAssetId : "video";
  const tabs = [
    { id: "video", label: "Video prompt", count: names(task.prompt).length },
    ...configs.map((c, i) => ({
      id: c.sourceAssetId,
      label: `Image ${i + 1} · ${task.references.find((r) => r.assetId === c.sourceAssetId)?.role || "Reference"}`,
      count: names(c.prompt).length,
    })),
  ];
  return (
    <>
      <Intro
        eyebrow="02 / SHAPE YOUR IDEA"
        title={
          configs.length
            ? "Give your images and video a direction."
            : "Give your video a direction."
        }
        description={
          configs.length
            ? "Write your video and image prompts here. Select words in any prompt to make variables, then build all their lists together in Variations."
            : "Write naturally. Then select any words you’d like to change from one video to the next."
        }
      />
      {!!configs.length && (
        <>
          <div
            className="prompt-targets"
            role="tablist"
            aria-label="Prompt to edit"
          >
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                role="tab"
                id={`prompt-tab-${tab.id}`}
                aria-controls="task-prompt-panel"
                aria-selected={target === tab.id}
                tabIndex={target === tab.id ? 0 : -1}
                onClick={() => setSelected(tab.id)}
                onKeyDown={(e) => {
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)
                  ) {
                    e.preventDefault();
                    const next =
                      e.key === "Home"
                        ? 0
                        : e.key === "End"
                          ? tabs.length - 1
                          : (index +
                              (e.key === "ArrowRight" ? 1 : -1) +
                              tabs.length) %
                            tabs.length;
                    setSelected(tabs[next].id);
                    document
                      .getElementById(`prompt-tab-${tabs[next].id}`)
                      ?.focus();
                  }
                }}
              >
                {tab.id === "video" ? (
                  <Film size={17} />
                ) : (
                  <ImageIcon size={17} />
                )}
                <span>{tab.label}</span>
                <small>
                  {tab.count} {tab.count === 1 ? "variable" : "variables"}
                </small>
              </button>
            ))}
          </div>
          <p className="helper prompt-workflow-hint">
            {config
              ? "Describe what should change in this image and what should stay fixed. Each version starts from its original image."
              : "Describe the action, camera movement, and sound. Image prompts control changes to your selected references."}
          </p>
          {config && (
            <div className="prompt-source">
              <div className="reference-thumb">
                <Media
                  asset={state.assets.find(
                    (a) => a.id === config.sourceAssetId,
                  )}
                />
              </div>
              <div>
                <span className="eyebrow">ORIGINAL REFERENCE IMAGE</span>
                <p>
                  {state.assets.find((a) => a.id === config.sourceAssetId)
                    ?.name || "Select an image in References."}
                </p>
              </div>
            </div>
          )}
        </>
      )}
      <section
        id="task-prompt-panel"
        role={configs.length ? "tabpanel" : undefined}
        aria-labelledby={configs.length ? `prompt-tab-${target}` : undefined}
      >
        <PromptFields
          {...props}
          target={config ? "image" : "video"}
          config={config}
          key={target}
        />
        {config && (
          <FrameSettings task={task} config={config} change={change} />
        )}
      </section>
    </>
  );
}
function PromptFields({
  task: original,
  change: changeTask,
  flush,
  work,
  busy,
  notify,
  target,
  config,
}) {
  const image = target === "image";
  const t = image
    ? {
        ...original,
        prompt: config.prompt,
        versions: config.versions || [],
      }
    : original;
  const change = (patch) => {
    if (!image) return changeTask(patch);
    const { prompt, ...rest } = patch;
    changeTask({
      ...rest,
      ...(prompt !== undefined
        ? updateImageRecipe(original, { ...config, prompt })
        : {}),
    });
  };
  const textarea = useRef(),
    selection = useRef(null);
  const [variable, setVariable] = useState(null),
    [feedback, setFeedback] = useState(""),
    [proposal, setProposal] = useState(null),
    [history, setHistory] = useState(false),
    [cinema, setCinema] = useState({
      camera: "",
      lens: "",
      light: "",
      sound: "",
    });
  const makeVariable = () => {
    const { start, end } = selection.current || {};
    if (start === undefined || start === end) {
      notify("Select the words in your prompt that you want to vary.");
      textarea.current.focus();
      return;
    }
    const text = t.prompt.slice(start, end);
    if (
      !text.trim() ||
      [...t.prompt.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)].some(
        (m) => start < m.index + m[0].length && end > m.index,
      )
    ) {
      notify("Select ordinary prompt text, outside any existing variable.");
      return;
    }
    setVariable({
      prompt: t.prompt,
      name:
        text
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || "variation",
      text,
      start,
      end,
    });
  };
  return (
    <>
      <div className="prompt-surface">
        <div className="prompt-toolbar">
          <span>{image ? "Image edit prompt" : "Your video prompt"}</span>
          <Button
            variant="ghost"
            icon={Braces}
            onMouseDown={(e) => e.preventDefault()}
            onClick={makeVariable}
          >
            Make variable
          </Button>
        </div>
        <textarea
          ref={textarea}
          className="prompt-input"
          aria-label={image ? "Image edit prompt" : "Video prompt"}
          placeholder={
            image
              ? "Replace the container contents with fresh fruit. Preserve the containers, appliance, arrangement, lighting, and framing."
              : "A ginger cat on a sage green rug, stretching after a nap. Soft window light, a slow camera push-in…"
          }
          value={t.prompt}
          onChange={(e) => change({ prompt: e.target.value })}
          onSelect={(e) => {
            selection.current = {
              start: e.target.selectionStart,
              end: e.target.selectionEnd,
            };
          }}
        />
        <div className="prompt-bottom">
          <span>Select text → Make variable</span>
          <span>{t.prompt.length.toLocaleString()} characters</span>
        </div>
      </div>
      {frameEnabled(original) && activeVariables(original).length > 0 && (
        <Field
          label="Use an existing variable"
          hint="The same value will be used wherever this variable appears."
        >
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              const { start = t.prompt.length, end = t.prompt.length } =
                selection.current || {};
              change({
                prompt:
                  t.prompt.slice(0, start) +
                  `{${e.target.value}}` +
                  t.prompt.slice(end),
              });
            }}
          >
            <option value="">Insert at the selected position…</option>
            {activeVariables(original).map(({ name }) => (
              <option value={name} key={name}>
                {pretty(name)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {names(t.prompt).length > 0 && (
        <div className="template-preview">
          <span className="eyebrow">YOUR DYNAMIC PROMPT</span>
          <p>
            {t.prompt.split(/(\{[a-zA-Z][a-zA-Z0-9_]*\})/g).map((s, i) =>
              s.startsWith("{") ? (
                <span
                  className={`variable-chip color-${taskNames(original).indexOf(s.slice(1, -1)) % 4}`}
                  key={i}
                >
                  <Braces size={12} />
                  {pretty(s.slice(1, -1))}
                </span>
              ) : (
                <React.Fragment key={i}>{s}</React.Fragment>
              ),
            )}
          </p>
        </div>
      )}
      {!image && (
        <details className="disclosure">
          <summary>
            Creative direction <span>Optional</span>
          </summary>
          <p className="helper">
            Choose a few details. They become visible instructions in your
            prompt.
          </p>
          <div className="form-grid">
            {[
              {
                key: "camera",
                label: "Camera movement",
                options: [
                  "Locked-off camera",
                  "Slow push-in",
                  "Gentle handheld",
                  "Lateral tracking shot",
                  "Slow orbit",
                ],
              },
              {
                key: "lens",
                label: "Lens and framing",
                options: [
                  "Wide-angle environmental shot",
                  "50mm natural perspective",
                  "85mm portrait, shallow depth of field",
                  "Macro close-up",
                ],
              },
              {
                key: "light",
                label: "Lighting",
                options: [
                  "Soft window light",
                  "Golden-hour sunlight",
                  "Diffused studio lighting",
                  "Dramatic low-key lighting",
                ],
              },
              {
                key: "sound",
                label: "Sound",
                options: [
                  "Natural ambient sound. No dialogue.",
                  "No music or dialogue.",
                  "Subtle cinematic sound design.",
                ],
              },
            ].map((f) => (
              <Field label={f.label} key={f.key}>
                <select
                  value={cinema[f.key]}
                  onChange={(e) =>
                    setCinema({ ...cinema, [f.key]: e.target.value })
                  }
                >
                  <option value="">No preference</option>
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <Button
            disabled={!Object.values(cinema).some(Boolean)}
            onClick={() => {
              change({
                prompt: [
                  t.prompt,
                  ...Object.values(cinema).filter(Boolean),
                ].join("\n"),
              });
              setCinema({ camera: "", lens: "", light: "", sound: "" });
            }}
          >
            Add to prompt
          </Button>
        </details>
      )}
      <div className="prompt-assist">
        <div>
          <span className="assist-symbol">
            <Sparkles size={21} />
          </span>
          <h3>A little help with the wording?</h3>
          <p>
            Refine your direction while keeping your idea and variables intact.
          </p>
        </div>
        <Field
          label="Anything to focus on?"
          hint={
            image
              ? "Optional. For example: change only the contents and preserve the lighting."
              : "Optional. For example: keep the camera still and make the movement more natural."
          }
        >
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="What would you like to improve?"
          />
        </Field>
        <div className="actions">
          <Button
            icon={Sparkles}
            loading={busy}
            disabled={!t.prompt.trim()}
            onClick={() =>
              work(async () => {
                const r = await api(`/tasks/${t.id}/improve`, {
                  feedback,
                  target,
                  sourceAssetId: config?.sourceAssetId,
                });
                setProposal(r.prompt);
              })
            }
          >
            Improve prompt
          </Button>
          <Button
            variant="ghost"
            icon={History}
            disabled={!t.versions.length}
            onClick={() => setHistory(true)}
          >
            Previous versions
          </Button>
        </div>
      </div>
      {variable && (
        <VariableDialog
          task={original}
          target={target}
          sourceAssetId={config?.sourceAssetId}
          selection={variable}
          flush={flush}
          onClose={() => setVariable(null)}
          onCreate={({ name, instructions }) => {
            if (t.prompt !== variable.prompt)
              return "Your prompt changed. Close this dialog and select the words again.";
            if (t.variables.some((v) => v.name === name))
              return "That variable name already exists. Choose a different name for this part.";
            const variables = t.variables.concat({
              name,
              values: [variable.text],
              instructions,
              expand: false,
            });
            change({
              prompt:
                t.prompt.slice(0, variable.start) +
                `{${name}}` +
                t.prompt.slice(variable.end),
              variables,
            });
            setVariable(null);
          }}
        />
      )}
      {proposal !== null && (
        <Modal
          title="A clearer direction"
          onClose={() => setProposal(null)}
          wide
        >
          <p>
            Your variables stay in place. Review or edit the suggestion before
            using it.
          </p>
          <div className="comparison">
            <div>
              <span className="eyebrow">CURRENT PROMPT</span>
              <p className="preserve">{t.prompt}</p>
            </div>
            <Field label="Suggested prompt">
              <textarea
                rows={12}
                value={proposal}
                onChange={(e) => setProposal(e.target.value)}
              />
            </Field>
          </div>
          <div className="actions">
            <Button
              variant="primary"
              icon={Check}
              onClick={() => {
                const tokens = (s) =>
                  (s.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || [])
                    .sort()
                    .join("|");
                if (tokens(proposal) !== tokens(t.prompt)) {
                  notify(
                    "Keep the same variables in the suggested prompt.",
                    true,
                  );
                  return;
                }
                change({ prompt: proposal });
                setProposal(null);
              }}
            >
              Use this prompt
            </Button>
            <Button onClick={() => setProposal(null)}>Keep current</Button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal title="Previous prompts" onClose={() => setHistory(false)} wide>
          {[...t.versions].reverse().map((v, i) => (
            <div className="version-row" key={i}>
              <span>{new Date(v.at).toLocaleString()}</span>
              <p className="preserve">{v.prompt}</p>
              <Button
                icon={RotateCcw}
                onClick={() => {
                  change({ prompt: v.prompt });
                  setHistory(false);
                }}
              >
                Restore this version
              </Button>
            </div>
          ))}
        </Modal>
      )}
    </>
  );
}
function Variations({ task: t, change, work, busy, notify }) {
  const [selected, setSelected] = useState(t.variables[0]?.name),
    [paste, setPaste] = useState(""),
    [count, setCount] = useState(5);
  const visible = activeVariables(t);
  const variable = visible.find((v) => v.name === selected) || visible[0];
  const update = (patch) =>
    change({
      variables: t.variables.map((v) =>
        v.name === variable.name ? { ...v, ...patch } : v,
      ),
    });
  const move = (i, delta) => {
    const values = [...variable.values];
    [values[i], values[i + delta]] = [values[i + delta], values[i]];
    update({ values });
  };
  return (
    <>
      <Intro
        eyebrow="03 / EXPLORE THE POSSIBILITIES"
        title={
          frameEnabled(t)
            ? "All your variables. Every combination."
            : "One prompt. Many directions."
        }
        description="Build all your variable lists here. Each image and video combination becomes a set of takes."
      />
      {!variable ? (
        <Empty
          small
          icon={Braces}
          title="What would you like to vary?"
          description="Go back to Prompt, select a few words, and choose Make variable."
        />
      ) : (
        <>
          <div className="combination-note" aria-live="polite">
            <Layers size={18} />
            <div>
              <p>
                {visible
                  .map((v) => `${v.values.length} ${pretty(v.name)}`)
                  .join(" × ")}{" "}
                = <strong>{fmt(total(t))} combinations</strong>
              </p>
              <p>
                {fmt(total(t))} combinations × {t.takes} takes ={" "}
                <strong>{fmt(total(t) * t.takes)} videos</strong>
                {frameEnabled(t)
                  ? ` · ${fmt(frameCount(t))} reference images, reused across video variations.`
                  : ""}
              </p>
              {frameEnabled(t) && (
                <p className="helper">
                  A variable used in several prompts shares one list and counts
                  once.
                </p>
              )}
            </div>
          </div>
          <div className="variable-tabs">
            {visible.map((v, i) => (
              <button
                key={v.name}
                className={v.name === variable.name ? "selected" : ""}
                onClick={() => {
                  setSelected(v.name);
                  setPaste("");
                }}
              >
                <span className={`variable-dot color-${i % 4}`} />
                <span className="variable-tab-name">
                  {pretty(v.name)}
                  {frameEnabled(t) && <small>{variableStage(t, v.name)}</small>}
                </span>
                <span>{v.values.length}</span>
              </button>
            ))}
          </div>
          <div className="variable-header">
            <h3>
              {pretty(variable.name)}{" "}
              <span className="stage-label">
                {variableStage(t, variable.name)}
              </span>
            </h3>
            <span>
              {variable.values.length}{" "}
              {variable.values.length === 1 ? "idea" : "ideas"}
            </span>
          </div>
          <div className="values-list">
            {variable.values.map((value, i) => (
              <div className="value-row" key={`${variable.name}-${i}`}>
                <span className="value-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <input
                  aria-label={`${pretty(variable.name)} value ${i + 1}`}
                  value={value}
                  onChange={(e) =>
                    update({
                      values: variable.values.map((v, j) =>
                        j === i ? e.target.value : v,
                      ),
                    })
                  }
                />
                <Button
                  variant="ghost"
                  icon={ChevronUp}
                  aria-label={`Move value ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                />
                <Button
                  variant="ghost"
                  icon={ChevronDown}
                  aria-label={`Move value ${i + 1} down`}
                  disabled={i === variable.values.length - 1}
                  onClick={() => move(i, 1)}
                />
                <Button
                  variant="ghost"
                  icon={X}
                  aria-label={`Remove value ${i + 1}`}
                  onClick={() =>
                    update({
                      values: variable.values.filter((_, j) => j !== i),
                    })
                  }
                />
              </div>
            ))}
          </div>
          <div className="paste-values">
            <Field
              label="Add your own ideas"
              hint="One idea per line. Exact duplicates are removed when saved."
            >
              <textarea
                rows={3}
                placeholder="Type or paste a list…"
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
              />
            </Field>
            <Button
              icon={Plus}
              disabled={!paste.trim()}
              onClick={() => {
                update({
                  values: [
                    ...variable.values,
                    ...paste
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ],
                });
                setPaste("");
              }}
            >
              Add to list
            </Button>
          </div>
          <div className="idea-generator">
            <div className="section-title">
              <Sparkles size={21} />
              <div>
                <h3>Let Gemini explore</h3>
                <p>
                  New ideas that fit your prompt, with past suggestions kept in
                  mind.
                </p>
              </div>
            </div>
            <Field label={`Instructions for ${pretty(variable.name)}`}>
              <textarea
                rows={3}
                value={variable.instructions}
                onChange={(e) => update({ instructions: e.target.value })}
                placeholder="Describe the kind of ideas you want. Be specific about style, range, and things to avoid."
              />
            </Field>
            <div className="generator-footer">
              <div className="inline-count">
                <label htmlFor="idea-count">Ideas to add</label>
                <input
                  id="idea-count"
                  type="number"
                  min="1"
                  max="50"
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </div>
              <Button
                icon={Sparkles}
                loading={busy}
                onClick={() =>
                  work(async () => {
                    const result = await api(`/tasks/${t.id}/variations`, {
                      name: variable.name,
                      count,
                    });
                    update({ values: [...variable.values, ...result.values] });
                    notify(`${result.values.length} new ideas added.`);
                  })
                }
              >
                Generate ideas
              </Button>
            </div>
            <label className="check-row">
              <input
                type="checkbox"
                checked={variable.expand}
                onChange={(e) => update({ expand: e.target.checked })}
              />
              <div>
                <strong>Keep generating new ideas in continuous mode</strong>
                <span>
                  This list grows between production rounds. Previously used
                  ideas are avoided.
                </span>
              </div>
            </label>
          </div>
        </>
      )}
    </>
  );
}
function Samples({
  task: t,
  work,
  busy,
  assets,
  jobs,
  refresh,
  notify,
  onDetail,
}) {
  const [choices, setChoices] = useState({}),
    [count, setCount] = useState(1);
  const values = Object.fromEntries(
    activeVariables(t).map((v) => [
      v.name,
      v.values.includes(choices[v.name]) ? choices[v.name] : v.values[0] || "",
    ]),
  );
  return (
    <>
      <Intro
        eyebrow="04 / FIND YOUR FAVORITE DIRECTION"
        title="Try a few takes first."
        description="Pick a combination and see your idea in motion. Every sample is saved, so there’s room to experiment."
      />
      <div className="sample-form">
        {frameEnabled(t) && (
          <>
            <h3>Image variations</h3>
            <div className="form-grid">
              {frameNames(t).map((name) => {
                const v = t.variables.find((v) => v.name === name);
                return (
                  <Field
                    key={name}
                    label={pretty(name)}
                    hint={
                      variableStage(t, name) === "Both"
                        ? "Shared with the video prompt."
                        : undefined
                    }
                  >
                    <select
                      value={values[name]}
                      onChange={(e) =>
                        setChoices({ ...choices, [name]: e.target.value })
                      }
                    >
                      {!v?.values.length && (
                        <option value="">Add values in Variations first</option>
                      )}
                      {v?.values.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </Field>
                );
              })}
            </div>
            {activeImageRecipes(t).map((config, index) => (
              <FrameSamples
                key={config.sourceAssetId}
                task={t}
                config={config}
                index={index}
                values={values}
                assets={assets}
                jobs={jobs}
                work={work}
                busy={busy}
                refresh={refresh}
                notify={notify}
                onDetail={onDetail}
              />
            ))}
          </>
        )}
        {frameEnabled(t) && <h3>Video variations</h3>}
        <div className="form-grid">
          {activeVariables(t)
            .filter((v) => !frameNames(t).includes(v.name))
            .map((v) => (
              <Field label={pretty(v.name)} key={v.name}>
                <select
                  value={values[v.name]}
                  onChange={(e) =>
                    setChoices({ ...choices, [v.name]: e.target.value })
                  }
                >
                  {!v.values.length && (
                    <option value="">Add values in Variations first</option>
                  )}
                  {v.values.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </Field>
            ))}
        </div>
        <div className="resolved-prompt">
          <span className="eyebrow">THE PROMPT FOR THIS TAKE</span>
          <p>
            {resolved(t.prompt, values) ||
              "Write your video prompt to preview a take."}
          </p>
        </div>
        <div className="sample-controls">
          <Field label="Sample takes">
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "take" : "takes"}
                </option>
              ))}
            </select>
          </Field>
          <span className="helper">
            {t.settings.aspectRatio} · {t.settings.resolution.toUpperCase()}
            <br />
            Change format in Production
          </span>
          <Button
            variant="primary"
            icon={Play}
            loading={busy}
            disabled={!t.prompt.trim() || Object.values(values).some((v) => !v)}
            onClick={() =>
              work(() => api(`/tasks/${t.id}/samples`, { values, count }))
            }
          >
            Generate {count === 1 ? "sample" : `${count} samples`}
          </Button>
        </div>
      </div>
    </>
  );
}
function Production({ task: t, state, change, work, busy }) {
  const settings = (patch) => change({ settings: { ...t.settings, ...patch } });
  return (
    <>
      <Intro
        eyebrow="05 / READY WHEN YOU ARE"
        title="Let your production unfold."
        description="Choose how your ideas become videos. Review the numbers, then start creating in the background."
      />
      {frameEnabled(t) && (
        <Notice>
          <strong>
            {fmt(frameCount(t))} reference images → {fmt(total(t) * t.takes)}{" "}
            videos
          </strong>
          <br />
          {state.tasks.find((x) => x.id === t.id)?.stats.frames?.ready ||
            0}{" "}
          matching frames already saved. Each frame is reused across video
          variations and takes; missing frames are created automatically.
        </Notice>
      )}
      <div className="mode-options">
        {[
          {
            id: "batch",
            icon: Layers,
            title: "Defined batch",
            text: "Create every combination, then finish.",
          },
          {
            id: "continuous",
            icon: InfinityIcon,
            title: "Continuous",
            text: "Keep exploring new ideas as you go.",
          },
        ].map((m) => (
          <button
            key={m.id}
            className={t.mode === m.id ? "selected" : ""}
            onClick={() => change({ mode: m.id })}
          >
            <m.icon size={23} strokeWidth={1.5} />
            <strong>{m.title}</strong>
            <span>{m.text}</span>
            <span className="radio-dot" />
          </button>
        ))}
      </div>
      <div className="form-grid production-form">
        <Field label="Video model">
          <select
            value={t.settings.model}
            onChange={(e) => settings({ model: e.target.value })}
          >
            <option value="gemini-omni-1.1-flash">Gemini Omni 1.1 Flash</option>
          </select>
        </Field>
        <Field
          label="Takes per combination"
          hint="A new take uses the same prompt and references."
        >
          <input
            type="number"
            min="1"
            max="20"
            value={t.takes}
            onChange={(e) => change({ takes: Number(e.target.value) })}
          />
        </Field>
        <Field label="Aspect ratio">
          <select
            value={t.settings.aspectRatio}
            onChange={(e) => settings({ aspectRatio: e.target.value })}
          >
            <option value="16:9">Landscape · 16:9</option>
            <option value="9:16">Portrait · 9:16</option>
          </select>
        </Field>
        <Field label="Resolution">
          <select
            value={t.settings.resolution}
            onChange={(e) => settings({ resolution: e.target.value })}
          >
            <option value="360p">360p · Quick exploration</option>
            <option value="720p">720p · Standard</option>
            <option value="1080p">1080p · Upscaled</option>
            <option value="4k">4K · Upscaled</option>
          </select>
        </Field>
      </div>
      {t.mode === "continuous" && (
        <>
          <Field
            label="Stop after this many videos"
            hint="Optional. Leave empty to continue until you pause or stop this run."
          >
            <input
              type="number"
              min="1"
              placeholder="No limit"
              value={t.limit ?? ""}
              onChange={(e) =>
                change({
                  limit: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </Field>
          {!activeVariables(t).some((v) => v.expand) && (
            <Notice>
              Choose at least one variable to keep expanding in the Variations
              section.
            </Notice>
          )}
        </>
      )}
      <details className="disclosure">
        <summary>Advanced settings</summary>
        <Field
          label="Generation mode"
          hint="Automatic lets the prompt and references determine the mode. Explicit modes add model constraints."
        >
          <select
            value={t.settings.task}
            onChange={(e) => settings({ task: e.target.value })}
          >
            {[
              ["auto", "Automatic (recommended)"],
              ["text_to_video", "Text to video"],
              ["image_to_video", "Image to video"],
              ["reference_to_video", "Use references"],
              ["edit", "Edit a video"],
              ["extend", "Extend a video"],
            ].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <p className="helper">
          Omni’s documented API controls are shown here. Clip length and sound
          are directed through your prompt; exact duration is not guaranteed.
          Higher resolutions are upscaled.
        </p>
      </details>
      <div className="launch-panel">
        <div>
          <span className="eyebrow">
            {t.mode === "continuous" ? "YOUR FIRST ROUND" : "YOUR PRODUCTION"}
          </span>
          <h3>
            {fmt(total(t) * t.takes)} videos
            {t.mode === "continuous" ? " to begin" : ""}
          </h3>
          <p>
            {fmt(total(t))} combinations · {t.takes} takes each.{" "}
            {t.mode === "continuous"
              ? "Then new ideas create new combinations."
              : "Samples stay separate."}
          </p>
        </div>
        <Button
          variant="primary"
          icon={Play}
          loading={busy}
          disabled={
            !t.prompt.trim() ||
            total(t) === 0 ||
            (t.mode === "continuous" &&
              !activeVariables(t).some((v) => v.expand))
          }
          onClick={() =>
            work(() => api(`/tasks/${t.id}/action`, { action: "start" }))
          }
        >
          {t.status === "paused" ? "Resume production" : "Start production"}
        </Button>
      </div>
      <p className="helper centered-text">
        You can close this browser. Keep your computer awake and Frame running.
      </p>
    </>
  );
}
function Results({ assets, jobs, state, task, refresh, notify, onDetail }) {
  const [kind, setKind] = useState("production"),
    [run, setRun] = useState("all"),
    [search, setSearch] = useState("");
  const visible = assets.filter(
    (a) =>
      a.kind === kind &&
      (run === "all" || a.runId === run) &&
      `${a.name} ${JSON.stringify(a.metadata.values)}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <div className="results-heading">
        <div>
          <span className="eyebrow">FROM IDEA TO ASSET</span>
          <h2>Your takes, all together.</h2>
          <p>
            Browse here, or open the task folder and work in your favorite media
            tools.
          </p>
        </div>
      </div>
      <div className="results-toolbar">
        <div className="tabs">
          {[
            ["production", "Production"],
            ["sample", "Samples"],
            ["frame", "Reference images"],
          ].map(([k, l]) => (
            <button
              key={k}
              className={kind === k ? "selected" : ""}
              onClick={() => {
                setKind(k);
                setRun("all");
              }}
            >
              {l}
              <span>{assets.filter((a) => a.kind === k).length}</span>
            </button>
          ))}
        </div>
        <select
          aria-label="Filter by run"
          value={run}
          onChange={(e) => setRun(e.target.value)}
        >
          <option value="all">All runs</option>
          {state.runs
            .filter((r) => r.taskId === task.id)
            .map((r) => (
              <option value={r.id} key={r.id}>
                Run {r.number}
              </option>
            ))}
        </select>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="Search variations"
            placeholder="Find a variation…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <Jobs
        jobs={jobs.filter(
          (j) =>
            j.kind === kind ||
            (j.kind === "frame" &&
              kind !== "frame" &&
              jobs.some(
                (v) =>
                  v.kind === kind &&
                  dependsOnImage(v, j.id) &&
                  ["waiting", "blocked"].includes(v.status),
              )),
        )}
        refresh={refresh}
        notify={notify}
      />
      {visible.length ? (
        <div className="asset-grid results-grid">
          {visible.map((a) => (
            <AssetCard key={a.id} asset={a} onClick={onDetail} />
          ))}
        </div>
      ) : (
        <Empty
          title={
            kind === "sample"
              ? "Your experiments belong here"
              : "Your collection is taking shape"
          }
          description={
            kind === "sample"
              ? "Generate a sample in the task editor to try a direction."
              : "Completed videos will appear here as production progresses."
          }
        />
      )}
    </>
  );
}
