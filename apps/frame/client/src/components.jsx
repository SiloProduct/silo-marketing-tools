import { dependsOnImage } from "../../shared/task-variables.js";
import React, { useEffect, useRef, useState, useId } from "react";
import {
  X,
  Loader2,
  Play,
  Image as ImageIcon,
  Film,
  FolderOpen,
  ArrowRight,
  Check,
  AlertCircle,
} from "lucide-react";
import { api, pretty } from "./api";

export function Button({
  children,
  icon: Icon,
  loading = false,
  variant = "secondary",
  className = "",
  ...props
}) {
  return (
    <button
      className={`button ${variant} ${className}`}
      {...props}
      disabled={props.disabled || loading}
    >
      {loading ? (
        <Loader2 className="spin" size={16} />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}
export function Field({ label, hint, children, className = "" }) {
  const generated = useId();
  const id = children.props.id || generated;
  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {React.cloneElement(children, {
        id,
        "aria-describedby": hint ? `${id}-hint` : undefined,
      })}
      {hint && (
        <span id={`${id}-hint`} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    ref.current.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <Button
          icon={X}
          variant="ghost"
          aria-label="Close dialog"
          onClick={onClose}
        />
      </div>
      {children}
    </dialog>
  );
}
const labels = {
  draft: "Draft",
  running: "Creating videos",
  pausing: "Finishing active videos",
  stopping: "Finishing active videos",
  paused: "Paused",
  stopped: "Stopped",
  complete: "Complete",
  attention: "Needs attention",
  pending: "Waiting",
  waiting: "Waiting for reference images",
  blocked: "Reference image needs attention",
  preparing_frame: "Preparing reference images",
  submitting: "Starting",
  submitted: "Generating",
  downloading: "Saving video",
  completed: "Complete",
  failed: "Needs attention",
  uncertain: "Check request",
  cancelled: "Cancelled",
};
export function Status({ value }) {
  return (
    <span className={`status ${value}`}>
      <span />
      {labels[value] || value}
    </span>
  );
}
export function Empty({
  icon: Icon = Film,
  title,
  description,
  children,
  small = false,
}) {
  return (
    <div className={`empty ${small ? "small" : ""}`}>
      <div className="empty-icon">
        <Icon size={26} strokeWidth={1.4} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Notice({ children, error = false }) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      <AlertCircle size={17} />
      <div>{children}</div>
    </div>
  );
}
export function Media({ asset, controls = false }) {
  if (!asset)
    return (
      <div className="media-placeholder">
        <Film size={32} strokeWidth={1} />
      </div>
    );
  return asset.mime.startsWith("video/") ? (
    <video
      src={`${asset.url}#t=0.1`}
      controls={controls}
      preload="metadata"
      playsInline
      onLoadedMetadata={(e) => {
        if (!asset.duration && Number.isFinite(e.currentTarget.duration))
          api(`/assets/${asset.id}/duration`, {
            duration: e.currentTarget.duration,
          }).catch(() => {});
      }}
    />
  ) : (
    <img src={asset.url} alt={asset.name} loading="lazy" />
  );
}
export function AssetCard({ asset, onClick }) {
  return (
    <button className="asset-card" onClick={() => onClick(asset)}>
      <div className="asset-preview">
        <Media asset={asset} />
        <span className="media-type">
          {asset.mime.startsWith("video/") ? (
            <Play size={12} />
          ) : (
            <ImageIcon size={12} />
          )}
        </span>
      </div>
      <div className="asset-caption">
        <strong>{asset.name}</strong>
        <span>
          {asset.kind === "sample"
            ? "Sample"
            : asset.kind === "production"
              ? `Take ${asset.metadata.take}`
              : asset.parentId
                ? "Refined version"
                : "Reference"}{" "}
          ·{" "}
          {new Date(asset.createdAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </button>
  );
}
export function AssetDetail({
  asset,
  frameAsset,
  frameAssets,
  onClose,
  onRefine,
  onRepeat,
}) {
  return (
    <Modal title={asset.name} onClose={onClose} wide>
      <div className="detail-media">
        <Media asset={asset} controls />
      </div>
      {(onRefine || onRepeat) && (
        <div className="actions">
          {onRefine && (
            <Button onClick={() => onRefine(asset)} icon={ArrowRight}>
              Refine in studio
            </Button>
          )}
          {onRepeat && asset.metadata?.jobId && (
            <Button onClick={() => onRepeat(asset)}>
              Generate another take
            </Button>
          )}
        </div>
      )}
      {(frameAssets || (frameAsset ? [frameAsset] : [])).map((asset) => (
        <div className="detail-starting-frame" key={asset.id}>
          <span className="eyebrow">GENERATED REFERENCE USED</span>
          <Media asset={asset} />
          <p className="helper">{asset.name}</p>
        </div>
      ))}
      <div className="detail-meta">
        <span className="eyebrow">Generation details</span>
        <p className="preserve">
          {asset.metadata.prompt || "Imported from your computer."}
        </p>
        {asset.metadata.values && (
          <div className="chips">
            {Object.entries(asset.metadata.values).map(([k, v]) => (
              <span className="chip" key={k}>
                {pretty(k)}: {v}
              </span>
            ))}
          </div>
        )}
        <details>
          <summary>Settings and local file</summary>
          <p className="path">{asset.file}</p>
          <pre>{JSON.stringify(asset.metadata, null, 2)}</pre>
        </details>
      </div>
    </Modal>
  );
}
export function Jobs({ jobs, refresh, notify }) {
  const [busy, setBusy] = useState(null);
  const [uncertain, setUncertain] = useState(null);
  const [interaction, setInteraction] = useState("");
  const retry = async (job, confirm = false) => {
    setBusy(job.id);
    try {
      await api(`/jobs/${job.id}/retry`, { confirmDuplicateRisk: confirm });
      await refresh();
      setUncertain(null);
    } catch (e) {
      notify(e.message, true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      {jobs
        .filter((j) => !["completed", "cancelled"].includes(j.status))
        .map((j) => (
          <div className="job" key={j.id}>
            <div className="job-icon">
              {["failed", "uncertain"].includes(j.status) ? (
                <AlertCircle size={20} />
              ) : (
                <Loader2 className="spin" size={20} />
              )}
            </div>
            <div className="job-copy">
              <strong>
                {Object.values(j.snapshot.values || {}).join(" · ") ||
                  j.snapshot.prompt.slice(0, 90)}
              </strong>
              <span>
                <Status value={j.status} /> ·{" "}
                {j.kind === "sample"
                  ? "Sample"
                  : j.kind === "frame"
                    ? "Reference image"
                    : j.kind === "studio"
                      ? "Reference"
                      : `Take ${j.take}`}
              </span>
              {j.error && <p>{j.error}</p>}
              {j.kind === "frame" &&
                jobs.some(
                  (video) =>
                    dependsOnImage(video, j.id) &&
                    ["waiting", "blocked"].includes(video.status),
                ) && (
                  <p>
                    {
                      jobs.filter(
                        (video) =>
                          dependsOnImage(video, j.id) &&
                          ["waiting", "blocked"].includes(video.status),
                      ).length
                    }{" "}
                    videos waiting for this image.
                  </p>
                )}
            </div>
            {["failed", "uncertain"].includes(j.status) && (
              <Button
                loading={busy === j.id}
                onClick={() =>
                  j.status === "uncertain" ? setUncertain(j) : retry(j)
                }
              >
                {j.status === "uncertain" ? "Resolve" : "Retry"}
              </Button>
            )}
          </div>
        ))}
      {uncertain && (
        <Modal
          title="Check the interrupted request"
          onClose={() => setUncertain(null)}
        >
          <p>
            Google may have started this generation. Find its interaction ID in
            Google AI Studio to recover it without starting another.
          </p>
          <Field label="Interaction ID">
            <input
              value={interaction}
              onChange={(e) => setInteraction(e.target.value)}
              placeholder="Paste the interaction ID"
            />
          </Field>
          <div className="actions">
            <Button
              disabled={!interaction}
              variant="primary"
              onClick={async () => {
                try {
                  await api(`/jobs/${uncertain.id}/reconcile`, {
                    providerId: interaction,
                  });
                  await refresh();
                  setUncertain(null);
                } catch (e) {
                  notify(e.message, true);
                }
              }}
            >
              Check existing generation
            </Button>
            <Button
              loading={busy === uncertain.id}
              onClick={() => retry(uncertain, true)}
            >
              Generate again (may charge twice)
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function AssetPicker({
  assets,
  onPick,
  onClose,
  title = "Choose a reference",
}) {
  const [search, setSearch] = useState("");
  return (
    <Modal title={title} onClose={onClose} wide>
      <input
        className="search-input"
        aria-label="Search assets"
        placeholder="Search your assets…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {!assets.length ? (
        <Empty
          small
          icon={ImageIcon}
          title="Your library starts here"
          description="Import an asset or create one in the reference studio."
        />
      ) : (
        <div className="asset-grid picker">
          {assets
            .filter((a) => a.name.toLowerCase().includes(search.toLowerCase()))
            .map((a) => (
              <AssetCard key={a.id} asset={a} onClick={onPick} />
            ))}
        </div>
      )}
    </Modal>
  );
}
