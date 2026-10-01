import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Film,
  X,
  Check,
  Trash2,
  Undo2,
} from "lucide-react";
import { api, uploadFile } from "./api";
import { StudioReferences } from "./studio-references";
import { studioReferenceIssues } from "../../shared/studio-references.js";
import {
  Button,
  Field,
  Modal,
  Empty,
  Media,
  AssetCard,
  Jobs,
  Notice,
} from "./components";

export function Studio({
  state,
  go,
  refresh,
  notify,
  targetTaskId,
  initialAssetId,
}) {
  const [prompt, setPrompt] = useState(
      () => sessionStorage.getItem("frame-studio-prompt") || "",
    ),
    [type, setType] = useState(() =>
      sessionStorage.getItem("frame-studio-model") === "gemini-omni-1.1-flash"
        ? "video"
        : "image",
    ),
    [model, setModel] = useState(
      () =>
        sessionStorage.getItem("frame-studio-model") ||
        "gemini-3.1-flash-image",
    ),
    [ratio, setRatio] = useState("16:9"),
    [size, setSize] = useState("1K"),
    [resolution, setResolution] = useState("720p"),
    [selected, setSelected] = useState(initialAssetId || null),
    [refining, setRefining] = useState(false),
    [busy, setBusy] = useState(false),
    [chooseTask, setChooseTask] = useState(false),
    [taskId, setTaskId] = useState(targetTaskId || ""),
    [filter, setFilter] = useState("all"),
    [deleting, setDeleting] = useState(null),
    [deleteBusy, setDeleteBusy] = useState(false),
    [deleteError, setDeleteError] = useState(""),
    [optimizing, setOptimizing] = useState(false),
    [suggestion, setSuggestion] = useState(null),
    [previousPrompt, setPreviousPrompt] = useState(null),
    [references, setReferences] = useState(() => {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem("frame-studio-references") || "[]",
        );
        return Array.isArray(saved)
          ? saved.filter(
              (r) =>
                r &&
                typeof r.assetId === "string" &&
                typeof r.role === "string",
            )
          : [];
      } catch {
        return [];
      }
    });
  const file = useRef();
  const optimizationRequest = useRef(0);
  useEffect(
    () => () => {
      optimizationRequest.current++;
    },
    [],
  );
  useEffect(() => {
    sessionStorage.setItem("frame-studio-prompt", prompt);
  }, [prompt]);
  useEffect(() => {
    sessionStorage.setItem(
      "frame-studio-references",
      JSON.stringify(references),
    );
  }, [references]);
  useEffect(() => {
    sessionStorage.setItem("frame-studio-model", model);
  }, [model]);
  useEffect(() => {
    if (initialAssetId) setSelected(initialAssetId);
  }, [initialAssetId]);
  const assets = state.assets.filter(
      (a) => !a.taskId || a.id === initialAssetId,
    ),
    asset = state.assets.find((a) => a.id === selected);
  const jobs = state.jobs.filter((j) => j.kind === "studio");
  const parentId = refining ? asset?.id || null : null;
  const referenceIssues = studioReferenceIssues(
    model,
    references,
    state.assets,
    refining ? asset : null,
  );
  const referenceSignature = JSON.stringify(references);
  const staleSuggestion =
    suggestion &&
    (suggestion.original !== prompt ||
      suggestion.model !== model ||
      suggestion.parentId !== parentId ||
      suggestion.referenceSignature !== referenceSignature);
  const optimize = async () => {
    const request = ++optimizationRequest.current;
    const original = prompt;
    setOptimizing(true);
    try {
      const result = await api("/studio/optimize", {
        prompt: original,
        model,
        parentId,
        references,
      });
      if (request === optimizationRequest.current)
        setSuggestion({
          original,
          model,
          parentId,
          referenceSignature,
          prompt: result.prompt,
        });
    } catch (e) {
      if (request === optimizationRequest.current) notify(e.message, true);
    } finally {
      if (request === optimizationRequest.current) setOptimizing(false);
    }
  };
  const askDelete = (a) => {
    setDeleteError("");
    setDeleting(a);
  };
  const removeAsset = async () => {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await api(`/assets/${deleting.id}`, { confirmDelete: true }, "DELETE");
      setReferences((current) =>
        current.filter((r) => r.assetId !== deleting.id),
      );
      if (selected === deleting.id) {
        setSelected(null);
        setRefining(false);
      }
      setDeleting(null);
      await refresh();
      notify("Asset and local file deleted.");
    } catch (e) {
      setDeleteError(e.message);
    } finally {
      setDeleteBusy(false);
    }
  };
  const perform = async (fn) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(false);
    }
  };
  const attach = (id) =>
    perform(async () => {
      await api(`/assets/${asset.id}/attach`, { taskId: id });
      setChooseTask(false);
      notify("Reference added to your task.");
      if (targetTaskId) go(`task/${id}/references`);
    });
  return (
    <div className="page studio">
      {targetTaskId && (
        <div className="editor-breadcrumb">
          <button onClick={() => go(`task/${targetTaskId}/references`)}>
            <ArrowLeft size={15} />
            Back to your task
          </button>
        </div>
      )}
      <header className="page-heading">
        <div>
          <span className="eyebrow">A PLACE TO EXPLORE</span>
          <h1>Reference studio</h1>
          <p>
            Find the look. Shape the subject. Give your next video a starting
            point.
          </p>
        </div>
        <Button
          icon={Upload}
          loading={busy}
          onClick={() => file.current.click()}
        >
          Import assets
        </Button>
        <input
          ref={file}
          className="sr-only"
          type="file"
          aria-label="Import studio assets"
          accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
          multiple
          onChange={(e) => {
            const files = [...e.target.files];
            e.target.value = "";
            perform(async () => {
              for (const f of files) {
                const a = await uploadFile(f);
                setSelected(a.id);
              }
            });
          }}
        />
      </header>
      <div className="studio-workbench">
        <div className="studio-controls">
          <div className="segmented">
            <button
              className={type === "image" ? "active" : ""}
              onClick={() => {
                setType("image");
                setModel("gemini-3.1-flash-image");
              }}
            >
              <ImageIcon size={16} />
              Image
            </button>
            <button
              className={type === "video" ? "active" : ""}
              onClick={() => {
                setType("video");
                setModel("gemini-omni-1.1-flash");
                if (!["16:9", "9:16"].includes(ratio)) setRatio("16:9");
              }}
            >
              <Film size={16} />
              Video
            </button>
          </div>
          {refining && asset && (
            <div className="refining-note">
              <Sparkles size={16} />
              <span>Refining: {asset.name}</span>
              <Button
                icon={X}
                variant="ghost"
                aria-label="Stop refining"
                onClick={() => setRefining(false)}
              />
            </div>
          )}
          <StudioReferences
            assets={state.assets}
            model={model}
            references={references}
            onChange={setReferences}
            parentId={parentId}
            issues={referenceIssues}
            refresh={refresh}
            notify={notify}
          />
          <div className="studio-prompt">
            <Field
              label={
                refining
                  ? "What would you like to change?"
                  : "What do you have in mind?"
              }
            >
              <textarea
                rows={7}
                dir="auto"
                maxLength={30000}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={
                  refining
                    ? "Describe the change. Everything else should stay the same."
                    : "A sculptural ceramic vase on a warm stone surface. Soft side lighting, earthy tones, an editorial still life…"
                }
              />
            </Field>
            <div className="prompt-tools">
              <Button
                icon={Sparkles}
                variant="ghost"
                loading={optimizing}
                disabled={!prompt.trim() || busy || referenceIssues.length > 0}
                onClick={optimize}
              >
                {optimizing ? "Optimizing…" : "Optimize prompt"}
              </Button>
              {previousPrompt !== null && (
                <Button
                  icon={Undo2}
                  variant="ghost"
                  aria-label="Restore original prompt"
                  title="Restore original prompt"
                  onClick={() => {
                    setPrompt(previousPrompt);
                    setPreviousPrompt(null);
                  }}
                />
              )}
            </div>
            <p className="field-hint">
              Keeps your intent. Translates directions into English.
            </p>
          </div>
          <Field label="Model">
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              {type === "image" ? (
                <>
                  <option value="gemini-3.1-flash-image">
                    Gemini Flash Image · Fast
                  </option>
                  <option value="gemini-3-pro-image">
                    Gemini Pro Image · Detailed
                  </option>
                </>
              ) : (
                <option value="gemini-omni-1.1-flash">
                  Gemini Omni 1.1 Flash
                </option>
              )}
            </select>
          </Field>
          <div className="form-grid">
            <Field
              label="Format"
              hint={
                type === "image" && ratio === "auto"
                  ? refining
                    ? "Uses the original image’s proportions. Resolution is set separately."
                    : "Matches an input image when available; otherwise Gemini chooses the format."
                  : undefined
              }
            >
              <select value={ratio} onChange={(e) => setRatio(e.target.value)}>
                {type === "image" && (
                  <option value="auto">
                    {refining
                      ? "Auto · Match original"
                      : "Auto · From reference"}
                  </option>
                )}
                {(type === "image"
                  ? [
                      "16:9",
                      "9:16",
                      "1:1",
                      "4:3",
                      "3:4",
                      "3:2",
                      "2:3",
                      "4:5",
                      "5:4",
                      "21:9",
                    ]
                  : ["16:9", "9:16"]
                ).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Resolution">
              <select
                value={type === "image" ? size : resolution}
                onChange={(e) =>
                  type === "image"
                    ? setSize(e.target.value)
                    : setResolution(e.target.value)
                }
              >
                {(type === "image"
                  ? ["1K", "2K", "4K"]
                  : ["360p", "720p", "1080p", "4k"]
                ).map((r) => (
                  <option value={r} key={r}>
                    {r.toUpperCase()}
                    {["1080p", "4k"].includes(r) ? " · Upscaled" : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Button
            variant="primary"
            icon={Sparkles}
            loading={busy}
            disabled={!prompt.trim() || referenceIssues.length > 0}
            onClick={() =>
              perform(async () => {
                await api("/studio/generate", {
                  prompt,
                  model,
                  aspectRatio: ratio,
                  imageSize: size,
                  resolution,
                  parentId: refining ? asset?.id : null,
                  references,
                });
                notify(
                  "Your reference is being created. It will appear in the library below.",
                );
              })
            }
          >
            {refining ? "Create refined version" : `Generate ${type}`}
          </Button>
          <p className="helper">
            Every version is saved locally. Explore freely; your originals stay
            intact.
          </p>
        </div>
        <div className="studio-stage">
          {asset ? (
            <>
              <div className="studio-media">
                <Media asset={asset} controls />
              </div>
              <div className="stage-caption">
                <div>
                  <strong>{asset.name}</strong>
                  <span>
                    {asset.parentId ? "Refined version" : "Original"} ·{" "}
                    {asset.mime.startsWith("video/") ? "Video" : "Image"}
                  </span>
                </div>
                <div className="actions">
                  <Button
                    icon={ImageIcon}
                    disabled={
                      references.some((r) => r.assetId === asset.id) ||
                      parentId === asset.id
                    }
                    onClick={() => {
                      setReferences((current) => [
                        ...current,
                        { assetId: asset.id, role: "Subject appearance" },
                      ]);
                      notify(
                        "Reference selected. Set its purpose beside the prompt.",
                      );
                    }}
                  >
                    {references.some((r) => r.assetId === asset.id)
                      ? "Reference selected"
                      : "Use as reference"}
                  </Button>
                  {!asset.taskId && (
                    <Button
                      icon={Trash2}
                      aria-label="Delete selected asset"
                      title="Delete asset and local file"
                      onClick={() => askDelete(asset)}
                    />
                  )}
                  <Button
                    icon={Sparkles}
                    onClick={() => {
                      setRefining(true);
                      setReferences((current) =>
                        current.filter((r) => r.assetId !== asset.id),
                      );
                      setPrompt("");
                      const video = asset.mime.startsWith("video/");
                      if (!video) setRatio("auto");
                      setType(video ? "video" : "image");
                      setModel(
                        video
                          ? "gemini-omni-1.1-flash"
                          : asset.metadata?.settings?.model ||
                              "gemini-3.1-flash-image",
                      );
                      if (video && !["16:9", "9:16"].includes(ratio))
                        setRatio("16:9");
                    }}
                  >
                    Refine
                  </Button>
                  <Button
                    icon={Plus}
                    onClick={() =>
                      targetTaskId ? attach(targetTaskId) : setChooseTask(true)
                    }
                  >
                    Add to task
                  </Button>
                </div>
              </div>
              {asset.parentId &&
                state.assets.find((a) => a.id === asset.parentId) && (
                  <div className="version-compare">
                    <span>Previous version</span>
                    <button
                      onClick={() => {
                        setSelected(asset.parentId);
                        setRefining(false);
                      }}
                    >
                      <Media
                        asset={state.assets.find(
                          (a) => a.id === asset.parentId,
                        )}
                      />
                      <span>View previous</span>
                    </button>
                  </div>
                )}
            </>
          ) : (
            <div className="studio-empty">
              <div className="stage-frame">
                <ImageIcon size={38} strokeWidth={1} />
              </div>
              <span className="eyebrow">YOUR NEXT REFERENCE</span>
              <h2>
                It starts with a picture
                <br />
                in your mind.
              </h2>
              <p>
                Describe it on the left.
                <br />
                Your image or video will find its home here.
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="studio-library">
        <div className="collection-bar">
          <div>
            <h2>Your reference library</h2>
            <p className="helper">
              Originals, refinements, and things worth keeping.
            </p>
          </div>
          <div className="tabs">
            {[
              ["all", "All assets"],
              ["image", "Images"],
              ["video", "Videos"],
            ].map(([v, l]) => (
              <button
                key={v}
                className={filter === v ? "selected" : ""}
                onClick={() => setFilter(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Jobs jobs={jobs} refresh={refresh} notify={notify} />
        {assets.length ? (
          <div className="asset-grid studio-grid">
            {assets
              .filter(
                (a) => filter === "all" || a.mime.startsWith(filter + "/"),
              )
              .map((a) => (
                <div
                  key={a.id}
                  className={`studio-asset ${selected === a.id ? "selected-asset" : ""}`}
                >
                  <AssetCard
                    asset={a}
                    onClick={(a) => {
                      setSelected(a.id);
                      setRefining(false);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                  {!a.taskId && (
                    <Button
                      className="asset-delete"
                      icon={Trash2}
                      aria-label={`Delete ${a.name}`}
                      title="Delete asset and local file"
                      onClick={() => askDelete(a)}
                    />
                  )}
                </div>
              ))}
          </div>
        ) : (
          <Empty
            small
            icon={ImageIcon}
            title="A library of possibilities"
            description="Generated and imported references will collect here."
          />
        )}
      </div>
      {deleting && (
        <Modal
          title="Delete this asset?"
          onClose={() => {
            if (!deleteBusy) setDeleting(null);
          }}
        >
          <div className="delete-asset-summary">
            <Media asset={deleting} />
            <strong>{deleting.name}</strong>
          </div>
          <p>
            This permanently removes the asset from your reference library and
            deletes its local media file and saved generation details. This
            cannot be undone.
          </p>
          <p className="helper">
            Copies already added to tasks, other versions, and the original file
            you imported stay intact.
          </p>
          {deleteError && <Notice error>{deleteError}</Notice>}
          <div className="actions">
            <Button disabled={deleteBusy} onClick={() => setDeleting(null)}>
              Keep asset
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              loading={deleteBusy}
              onClick={removeAsset}
            >
              Delete asset and file
            </Button>
          </div>
        </Modal>
      )}
      {suggestion && (
        <Modal
          title="Review optimized prompt"
          onClose={() => setSuggestion(null)}
          wide
        >
          <p>
            A clearer prompt for{" "}
            {suggestion.model === "gemini-omni-1.1-flash"
              ? "Gemini Omni"
              : suggestion.model === "gemini-3-pro-image"
                ? "Gemini Pro Image"
                : "Gemini Flash Image"}
            . Review or edit it before using it.
          </p>
          <div className="prompt-comparison">
            <div>
              <span className="field-label">Your original</span>
              <p className="original-prompt" dir="auto">
                {suggestion.original}
              </p>
            </div>
            <Field label="Optimized prompt">
              <textarea
                rows={9}
                maxLength={30000}
                value={suggestion.prompt}
                onChange={(e) =>
                  setSuggestion({ ...suggestion, prompt: e.target.value })
                }
              />
            </Field>
          </div>
          {staleSuggestion && (
            <Notice>
              Your prompt, model or reference changed while optimizing. Keep
              your current prompt and optimize again.
            </Notice>
          )}
          <div className="actions">
            <Button onClick={() => setSuggestion(null)}>Keep original</Button>
            <Button
              variant="primary"
              icon={Check}
              disabled={staleSuggestion || !suggestion.prompt.trim()}
              onClick={() => {
                setPreviousPrompt(prompt);
                setPrompt(suggestion.prompt.trim());
                setSuggestion(null);
                notify(
                  "Optimized prompt applied. You can restore the original beside the prompt.",
                );
              }}
            >
              Use optimized prompt
            </Button>
          </div>
        </Modal>
      )}
      {chooseTask && (
        <Modal
          title="Add reference to a task"
          onClose={() => setChooseTask(false)}
        >
          <Field label="Choose a task">
            <select value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Select a task…</option>
              {state.tasks
                .filter(
                  (t) => !["running", "pausing", "stopping"].includes(t.status),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
          </Field>
          {!state.tasks.length && (
            <p>
              Create a task first, then add this reference from its library.
            </p>
          )}
          <div className="actions">
            <Button
              variant="primary"
              icon={Plus}
              loading={busy}
              disabled={!taskId}
              onClick={() => attach(taskId)}
            >
              Add reference
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
