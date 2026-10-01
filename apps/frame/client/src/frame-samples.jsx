import React from "react";
import { Image as ImageIcon, RotateCcw, Check } from "lucide-react";
import { Button, Media, Jobs, AssetCard } from "./components";
import { api, resolved } from "./api";
import { promptNames } from "../../shared/task-variables";

export function FrameSamples({
  task,
  config,
  index = 0,
  values,
  assets,
  jobs,
  work,
  busy,
  refresh,
  notify,
  onDetail,
}) {
  const variables = promptNames(config.prompt)
    .map((n) => task.variables.find((v) => v.name === n))
    .filter(Boolean);
  const matching = jobs.filter(
    (j) =>
      j.kind === "frame" &&
      j.status !== "cancelled" &&
      j.snapshot.parentId === config.sourceAssetId &&
      j.snapshot.prompt === resolved(config.prompt, values) &&
      ["model", "aspectRatio", "imageSize"].every(
        (k) => j.snapshot.settings[k] === config.settings[k],
      ),
  );
  const versions = matching
    .filter((j) => j.status === "completed")
    .map((j) => assets.find((a) => a.id === j.assetId))
    .filter(Boolean);
  const current = versions[0];
  const preparing = matching.some((j) =>
    ["pending", "submitting", "submitted", "downloading"].includes(j.status),
  );
  const incomplete =
    !config.prompt.trim() || variables.some((v) => !values[v.name]);
  return (
    <section
      className="frame-samples"
      aria-label={`Image ${index + 1} preview`}
    >
      <div className="section-title">
        <div>
          <h3>
            Image {index + 1} ·{" "}
            {
              task.references.find((r) => r.assetId === config.sourceAssetId)
                ?.role
            }
          </h3>
          <p>One image is shared across camera movements and takes.</p>
        </div>
      </div>
      <div className="frame-preview-layout">
        <div className="frame-preview-media">
          {current ? (
            <button
              onClick={() => onDetail(current)}
              aria-label={`View reference image ${index + 1}`}
            >
              <Media asset={current} />
            </button>
          ) : (
            <div className="empty small">
              <ImageIcon size={30} />
              <p>
                {preparing
                  ? "Preparing your reference image…"
                  : "Preview this image before generating videos."}
              </p>
            </div>
          )}
        </div>
        <div>
          <span className="eyebrow">IMAGE EDIT FOR THIS COMBINATION</span>
          <p className="preserve">
            {resolved(config.prompt, values) ||
              "Describe the changes in Prompt."}
          </p>
          <div className="actions">
            {!current && (
              <Button
                icon={ImageIcon}
                loading={busy}
                disabled={incomplete || preparing}
                onClick={() =>
                  work(() =>
                    api(`/tasks/${task.id}/frame-preview`, {
                      values,
                      sourceAssetId: config.sourceAssetId,
                    }),
                  )
                }
              >
                Preview image
              </Button>
            )}
            {current && (
              <span className="frame-ready">
                <Check size={16} /> Image ready
              </span>
            )}
            {current && (
              <Button
                icon={RotateCcw}
                disabled={busy || preparing || incomplete}
                onClick={() =>
                  work(() =>
                    api(`/tasks/${task.id}/frame-preview`, {
                      values,
                      regenerate: true,
                      sourceAssetId: config.sourceAssetId,
                    }),
                  )
                }
              >
                Regenerate image
              </Button>
            )}
          </div>
          <p className="helper">
            You can also generate a sample directly. Frame prepares any missing
            image first. Regeneration only changes future work; existing videos
            keep their original image.
          </p>
        </div>
      </div>
      <Jobs jobs={matching} refresh={refresh} notify={notify} />
      {versions.length > 1 && (
        <details className="disclosure">
          <summary>Previous image versions ({versions.length - 1})</summary>
          <div className="asset-grid">
            {versions.slice(1).map((a) => (
              <AssetCard key={a.id} asset={a} onClick={onDetail} />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
