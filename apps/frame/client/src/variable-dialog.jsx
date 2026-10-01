import { recipeFor } from "../../shared/task-variables.js";
import React, { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "./api";
import { Button, Field, Modal, Notice } from "./components";

export function VariableDialog({
  task,
  selection,
  flush,
  onCreate,
  onClose,
  target = "video",
  sourceAssetId,
}) {
  const [name, setName] = useState(selection.name);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [suggested, setSuggested] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const suggest = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await flush();
      if (!active.current) return;
      if (
        (target !== "video"
          ? sourceAssetId
            ? recipeFor(saved, sourceAssetId)?.prompt
            : saved.startingFrame?.prompt
          : saved.prompt) !== selection.prompt
      )
        throw new Error(
          "Your prompt changed. Close this dialog and select the words again.",
        );
      const result = await api(`/tasks/${task.id}/suggest-variable`, {
        start: selection.start,
        end: selection.end,
        text: selection.text,
        revision: saved.revision,
        target,
        sourceAssetId,
      });
      if (!active.current) return;
      setName(result.name);
      setInstructions(result.instructions);
      setSuggested(true);
    } catch (e) {
      if (active.current) setError(e.message);
    } finally {
      if (active.current) setBusy(false);
    }
  };
  return (
    <Modal title="Make this part dynamic" onClose={onClose}>
      <p>
        The selected words become your first value. Give this variable a name
        and choose what kinds of ideas Gemini should explore.
      </p>
      <div className="variable-selection">
        <span className="eyebrow">SELECTED WORDS</span>
        <p dir="auto">{selection.text}</p>
      </div>
      <div className="variable-suggestion">
        <Button icon={Sparkles} loading={busy} onClick={suggest}>
          {busy
            ? "Finding a direction…"
            : suggested
              ? "Suggest again"
              : "Suggest with Gemini"}
        </Button>
        <span className="helper" role="status">
          {suggested
            ? "Suggestion ready. Review or edit it below."
            : "Uses your full prompt and references."}
        </span>
      </div>
      {error && <Notice error>{error}</Notice>}
      <Field
        label="Variable name"
        hint="Use a short name, such as animal, color, or food items."
      >
        <input
          autoFocus
          value={name}
          maxLength={40}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <Field
        label="Directions for new values"
        hint="Optional. Saved with this variable and used when you generate ideas in Variations."
      >
        <textarea
          rows={3}
          value={instructions}
          maxLength={2000}
          disabled={busy}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder="For example: Photogenic foods suitable for a food container. Suggest distinct, visually appealing combinations."
        />
      </Field>
      <div className="actions">
        <Button
          variant="primary"
          disabled={busy || !name.trim()}
          onClick={() => {
            const normalized = name.trim().toLowerCase().replace(/\s+/g, "_");
            if (!/^[a-z][a-z0-9_]{0,39}$/.test(normalized)) {
              setError(
                "Start the name with a letter and use up to 40 letters, numbers or underscores.",
              );
              return;
            }
            const issue = onCreate({
              name: normalized,
              instructions: instructions.trim(),
            });
            if (issue) setError(issue);
          }}
        >
          Create variable
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
