import React, { useRef, useState } from "react";
import { Check, Plus, Upload, X, Image as ImageIcon } from "lucide-react";
import { Button, Modal, Media, Empty, Field } from "./components";
import { uploadFile } from "./api";
import { studioReferenceRoles } from "../../shared/studio-references.js";

export function StudioReferences({
  assets,
  model,
  references,
  onChange,
  parentId,
  issues,
  refresh,
  notify,
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState(""),
    [uploading, setUploading] = useState(false);
  const input = useRef();
  const choices = assets.filter(
    (a) =>
      a.id !== parentId && a.name.toLowerCase().includes(search.toLowerCase()),
  );
  const toggle = (asset) =>
    onChange((current) =>
      current.some((r) => r.assetId === asset.id)
        ? current.filter((r) => r.assetId !== asset.id)
        : [...current, { assetId: asset.id, role: "Subject appearance" }],
    );
  const importFiles = async (files) => {
    setUploading(true);
    try {
      for (const file of files) {
        const asset = await uploadFile(file);
        onChange((current) => [
          ...current,
          { assetId: asset.id, role: "Subject appearance" },
        ]);
      }
    } catch (e) {
      notify(e.message, true);
    } finally {
      await refresh();
      setUploading(false);
    }
  };
  return (
    <section className="studio-references" aria-label="Generation references">
      <div className="studio-references-heading">
        <span className="field-label">
          {parentId ? "Additional references" : "References"}
        </span>
        <span className="helper">
          {references.length ? `${references.length} selected` : "Optional"}
        </span>
      </div>
      <p className="field-hint">
        Guide the subject, look or composition of your next{" "}
        {model === "gemini-omni-1.1-flash" ? "video" : "image"}.
      </p>
      {references.length > 0 && (
        <div className="studio-reference-list">
          {references.map((ref, index) => {
            const asset = assets.find((a) => a.id === ref.assetId);
            const roles = studioReferenceRoles(model, asset);
            return (
              <div className="studio-reference" key={ref.assetId}>
                <div className="studio-reference-thumb">
                  <Media asset={asset} />
                </div>
                <div className="studio-reference-copy">
                  <strong title={asset?.name}>
                    {index + 1}. {asset?.name || "Missing reference"}
                  </strong>
                  <Field label={`Purpose of reference ${index + 1}`}>
                    <select
                      value={ref.role}
                      onChange={(e) =>
                        onChange((current) =>
                          current.map((r) =>
                            r.assetId === ref.assetId
                              ? { ...r, role: e.target.value }
                              : r,
                          ),
                        )
                      }
                    >
                      {!roles.includes(ref.role) && (
                        <option value={ref.role}>
                          {ref.role} · Change purpose
                        </option>
                      )}
                      {roles.map((role) => (
                        <option key={role}>{role}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button
                  icon={X}
                  variant="ghost"
                  aria-label={`Remove reference ${index + 1}`}
                  title="Remove from this generation; keep the file"
                  onClick={() =>
                    onChange((current) =>
                      current.filter((r) => r.assetId !== ref.assetId),
                    )
                  }
                />
                {issues
                  .filter((e) => e.assetId === ref.assetId)
                  .map((e) => (
                    <p className="inline-error" key={e.message}>
                      {e.message}
                    </p>
                  ))}
              </div>
            );
          })}
        </div>
      )}
      {issues
        .filter((e) => !e.assetId)
        .map((e) => (
          <p className="inline-error" key={e.message}>
            {e.message}
          </p>
        ))}
      <Button icon={Plus} onClick={() => setOpen(true)}>
        Choose references
      </Button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        multiple
        aria-label="Import generation references"
        accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
        onChange={(e) => {
          const files = [...e.target.files];
          e.target.value = "";
          importFiles(files);
        }}
      />
      {open && (
        <Modal
          title="Choose generation references"
          wide
          onClose={() => {
            if (!uploading) setOpen(false);
          }}
        >
          <p>
            Select assets to guide your next generation. You can mix references
            and set their purpose beside the prompt.
          </p>
          <div className="reference-picker-tools">
            <input
              aria-label="Search reference library"
              placeholder="Search your library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Button
              icon={Upload}
              loading={uploading}
              onClick={() => input.current.click()}
            >
              Import references
            </Button>
          </div>
          {choices.length ? (
            <div className="asset-grid picker studio-reference-picker">
              {choices.map((asset) => {
                const checked = references.some((r) => r.assetId === asset.id);
                return (
                  <button
                    type="button"
                    className={`asset-card reference-choice ${checked ? "is-selected" : ""}`}
                    key={asset.id}
                    aria-pressed={checked}
                    aria-label={`Use ${asset.name} as a reference`}
                    onClick={() => toggle(asset)}
                  >
                    <div className="asset-preview">
                      <Media asset={asset} />
                      <span className="reference-check">
                        {checked ? <Check size={16} /> : <Plus size={16} />}
                      </span>
                    </div>
                    <div className="asset-caption">
                      <strong>{asset.name}</strong>
                      <span>
                        {asset.mime.startsWith("video/") ? "Video" : "Image"}
                        {checked ? " · Selected" : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty
              small
              icon={ImageIcon}
              title={search ? "No matching references" : "Bring in a reference"}
              description="Import an image or video from your computer to get started."
            />
          )}
          <div className="reference-picker-footer">
            <span role="status">{references.length} selected</span>
            <Button
              variant="primary"
              disabled={uploading}
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </Modal>
      )}
    </section>
  );
}
