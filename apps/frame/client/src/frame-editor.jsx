import { updateImageRecipe } from "../../shared/task-variables.js";
import React from "react";
import { Field } from "./components";

export function FrameSettings({ task, config, change }) {
  const update = (patch) =>
    change(updateImageRecipe(task, { ...config, ...patch }));
  return (
    <details className="disclosure">
      <summary>Image settings</summary>
      <div className="form-grid">
        <Field label="Image model">
          <select
            value={config.settings.model}
            onChange={(e) =>
              update({
                settings: { ...config.settings, model: e.target.value },
              })
            }
          >
            <option value="gemini-3.1-flash-image">
              Gemini Flash Image · Fast
            </option>
            <option value="gemini-3-pro-image">Gemini Pro Image</option>
          </select>
        </Field>
        <Field label="Image format">
          <select
            value={config.settings.aspectRatio}
            onChange={(e) =>
              update({
                settings: { ...config.settings, aspectRatio: e.target.value },
              })
            }
          >
            {[
              "auto",
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
            ].map((v) => (
              <option key={v} value={v}>
                {v === "auto" ? "Auto · Match original" : v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Image resolution">
          <select
            value={config.settings.imageSize}
            onChange={(e) =>
              update({
                settings: { ...config.settings, imageSize: e.target.value },
              })
            }
          >
            {["1K", "2K", "4K"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
      </div>
    </details>
  );
}
