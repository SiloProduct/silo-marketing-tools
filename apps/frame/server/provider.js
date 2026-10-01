import { activeImageRecipes } from "../shared/task-variables.js";
import fs from "node:fs";
import { variableSuggestionInstruction } from "./variable-prompts.js";
import {
  studioPromptInstruction,
  taskPromptInstruction,
} from "./studio-prompts.js";
import {
  TEXT_MODEL,
  IMAGE_MODELS,
  placeholders,
  normalize,
  unique,
} from "./domain.js";

export class ProviderError extends Error {
  constructor(
    message,
    { retryable = false, uncertain = false, status = 0 } = {},
  ) {
    super(message);
    Object.assign(this, { retryable, uncertain, status });
  }
}
export function outputParts(response) {
  const parts = (response.steps || [])
    .filter((s) => s.type === "model_output")
    .flatMap((s) => s.content || []);
  if (!parts.length) parts.push(...(response.outputs || []));
  return parts;
}
export class GeminiProvider {
  constructor(key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    this.key = key;
  }
  async request(route, body) {
    if (!this.key)
      throw new ProviderError(
        "Add your Gemini API key to .env and restart Frame to generate media.",
      );
    let response;
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${route}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            "x-goog-api-key": this.key,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(180000),
        },
      );
    } catch {
      throw new ProviderError(
        body
          ? "The connection ended before Google confirmed the request. Check its status before retrying."
          : "Could not check Google’s progress. We will try again.",
        { uncertain: !!body, retryable: !body },
      );
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const friendly =
        response.status === 401 || response.status === 403
          ? "Google could not authorize this request. Check your API key, billing, and model access."
          : response.status === 429
            ? "Google’s usage limit was reached. Waiting before trying again."
            : data.error?.message ||
              `Google returned an error (${response.status}).`;
      throw new ProviderError(friendly, {
        status: response.status,
        retryable: response.status === 429 || (!body && response.status >= 500),
        uncertain: !!body && response.status >= 500,
      });
    }
    return data;
  }
  retrieve(id) {
    return this.request(`interactions/${encodeURIComponent(id)}`);
  }
  mediaInput(prompt, references) {
    let referenceNumber = 0;
    const directions = {
      "Starting frame": "Use this image as the first frame.",
      "Ending frame": "Use this image as the last frame.",
      "Asset to refine":
        "This is the source asset to edit. Keep unrequested details unchanged.",
      "Video to edit":
        "This is the source video to edit. Keep unrequested details unchanged.",
      "Video to extend":
        "This is the source video to extend. Continue from its ending.",
    };
    return [
      ...references.flatMap(({ asset, role }) => [
        {
          type: "text",
          text: `${role === "Asset to refine" ? "Source asset" : `Reference ${++referenceNumber}`}: ${asset.name}. Intended use: ${role}. ${directions[role] || "Use this as a visual reference for the stated purpose, not as a literal first frame or a source to edit."}`,
        },
        {
          type: asset.mime.startsWith("image/") ? "image" : "video",
          mime_type: asset.mime,
          data: fs.readFileSync(asset.file).toString("base64"),
        },
      ]),
      { type: "text", text: prompt },
    ];
  }
  submit(snapshot, references = []) {
    const image = IMAGE_MODELS.includes(snapshot.settings.model);
    const body = {
      model: snapshot.settings.model,
      input: this.mediaInput(snapshot.prompt, references),
      // Image models return their result synchronously. Frame's worker still
      // runs independently of the browser; Google's background flag is only
      // used for the video model that supports asynchronous interactions.
      ...(image ? {} : { background: true }),
      store: true,
      response_format: image
        ? {
            type: "image",
            // Omitting the ratio lets Gemini match the source image. "auto"
            // is a Frame setting, not a value accepted by Google's API.
            ...(snapshot.settings.aspectRatio === "auto"
              ? {}
              : { aspect_ratio: snapshot.settings.aspectRatio }),
            image_size: snapshot.settings.imageSize || "1K",
          }
        : {
            type: "video",
            aspect_ratio: snapshot.settings.aspectRatio,
            resolution: snapshot.settings.resolution,
          },
    };
    if (snapshot.previousInteractionId) {
      body.previous_interaction_id = snapshot.previousInteractionId;
      // The parent is already in the conversation; new references still need
      // to be sent with this turn instead of being silently discarded.
      const additional = references.filter(
        (r) => r.asset.id !== snapshot.parentId && r.role !== "Asset to refine",
      );
      body.input = additional.length
        ? this.mediaInput(snapshot.prompt, additional)
        : snapshot.prompt;
    }
    if (!image && snapshot.settings.task && snapshot.settings.task !== "auto")
      body.generation_config = {
        video_config: { task: snapshot.settings.task },
      };
    return this.request("interactions", body);
  }
  async text(instruction, references = []) {
    let result = await this.request("interactions", {
      model: TEXT_MODEL,
      input: references.length
        ? this.mediaInput(instruction, references)
        : instruction,
      store: false,
    });
    for (let i = 0; result.status === "in_progress" && i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      result = await this.retrieve(result.id);
    }
    const text = outputParts(result)
      .filter((p) => p.type === "text")
      .map((p) => p.text || "")
      .join("\n");
    if (!text)
      throw new ProviderError(
        "Gemini returned no text. Try adjusting your instructions.",
      );
    return text;
  }
  async optimizeStudio(input) {
    const references = [
      ...(input.parent
        ? [{ asset: input.parent, role: "Asset to refine" }]
        : []),
      ...(input.references || []),
    ];
    const prompt = (
      await this.text(studioPromptInstruction(input), references)
    ).trim();
    if (!prompt || prompt.length > 30000)
      throw new ProviderError(
        "Gemini could not produce a usable prompt. Try again or shorten your original prompt.",
      );
    return prompt;
  }
  async improve(task, feedback, references = []) {
    const answer = (
      await this.text(
        taskPromptInstruction(task, feedback, references),
        references,
      )
    ).trim();
    if (!answer || answer.length > 30000)
      throw new ProviderError(
        "Gemini could not produce a usable prompt. Your prompt was kept unchanged; try again or shorten it.",
      );
    const tokens = (s) =>
      (s.match(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g) || []).sort().join("|");
    if (tokens(answer) !== tokens(task.prompt))
      throw new ProviderError(
        "The proposed prompt changed a variable. Your prompt was kept unchanged; try again.",
      );
    return answer;
  }
  async suggestVariable(task, selection, references = []) {
    const output = await this.text(
      variableSuggestionInstruction(task, selection, references),
      references,
    );
    let suggestion;
    try {
      suggestion = JSON.parse(
        output
          .trim()
          .replace(/^```(?:json)?\s*/, "")
          .replace(/\s*```$/, ""),
      );
    } catch {}
    if (
      !suggestion ||
      typeof suggestion.name !== "string" ||
      !/^[a-z][a-z0-9_]{0,39}$/.test(suggestion.name) ||
      typeof suggestion.instructions !== "string" ||
      !suggestion.instructions.trim() ||
      suggestion.instructions.length > 2000
    )
      throw new ProviderError(
        "Gemini could not suggest a usable variable. Try again or enter your own name and directions.",
      );
    let name = suggestion.name;
    const used = new Set(task.variables.map((v) => v.name));
    for (let n = 2; used.has(name); n++) {
      const suffix = `_${n}`;
      name = suggestion.name.slice(0, 40 - suffix.length) + suffix;
    }
    return { name, instructions: suggestion.instructions.trim() };
  }
  async variations(task, name, count = 5, references = []) {
    const variable = task.variables.find((v) => v.name === name);
    if (!variable) throw new Error("Variable not found.");
    const history = unique([...(task.history[name] || []), ...variable.values]);
    const found = [];
    for (let attempt = 0; attempt < 3 && found.length < count; attempt++) {
      const text = await this.text(
        `Generate ${count - found.length} distinct values for the {${name}} placeholder in this video prompt. Return ONLY a JSON array of strings. Each value must fit naturally in the template. Avoid exact repeats, synonyms, and close paraphrases of prior ideas. No markdown.\nVideo template: ${task.prompt}\nStarting-frame edit template: ${JSON.stringify(activeImageRecipes(task).map((c) => ({ sourceAssetId: c.sourceAssetId, prompt: c.prompt, role: task.references?.find((r) => r.assetId === c.sourceAssetId)?.role })))}\nA variable in the image template controls image edits; a variable appearing in both templates uses the same value in both. Retain grammatical fit wherever this variable occurs.\nOther variables: ${JSON.stringify(task.variables.filter((v) => v.name !== name).map((v) => ({ name: v.name, values: v.values })))}\nInstructions: ${variable.instructions || "Varied, concrete, filmable ideas."}\nAlready used (do not repeat these ideas): ${JSON.stringify([...history, ...found])}`,
        references,
      );
      let values;
      try {
        values = JSON.parse(
          text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
        );
      } catch {
        continue;
      }
      if (!Array.isArray(values)) continue;
      const seen = new Set([...history, ...found].map(normalize));
      for (const value of values)
        if (
          typeof value === "string" &&
          value.trim() &&
          value.length <= 2000 &&
          !seen.has(normalize(value))
        ) {
          found.push(value.trim());
          seen.add(normalize(value));
          if (found.length === count) break;
        }
    }
    if (found.length < count)
      throw new ProviderError(
        "Gemini could not find enough new ideas. Broaden the variable instructions or add values yourself.",
      );
    return found;
  }
  async download(response, kind) {
    const part = outputParts(response).find((p) => p.type === kind);
    if (!part)
      throw new ProviderError(
        "Google returned no usable media. Review the prompt and reference inputs.",
      );
    if (part.data)
      return {
        bytes: Buffer.from(part.data, "base64"),
        mime: part.mime_type || (kind === "video" ? "video/mp4" : "image/png"),
      };
    const raw = part.uri || part.url;
    if (!raw)
      throw new ProviderError(
        "Google returned media without a downloadable file.",
      );
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      !["googleapis.com", "googleusercontent.com"].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    )
      throw new ProviderError("Google returned an unexpected media location.");
    const headers =
      url.hostname === "generativelanguage.googleapis.com"
        ? { "x-goog-api-key": this.key }
        : {};
    const result = await fetch(url, {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(180000),
    });
    if (!result.ok)
      throw new ProviderError(
        "The media could not be downloaded. Its generation ID was kept so the download can be retried.",
        { retryable: true },
      );
    return {
      bytes: Buffer.from(await result.arrayBuffer()),
      mime:
        part.mime_type ||
        result.headers.get("content-type")?.split(";")[0] ||
        (kind === "video" ? "video/mp4" : "image/png"),
    };
  }
}
