// Shared by the picker and API so incompatible selections never reach generation.
// Google model guidance checked 2026-09-27; see README model capabilities.
export function studioReferenceRoles(model, asset) {
  const general = ["Subject appearance", "Visual style", "Composition"];
  return model === "gemini-omni-1.1-flash" && asset?.mime.startsWith("image/")
    ? [...general, "Starting frame", "Ending frame"]
    : general;
}

export function studioReferenceIssues(
  model,
  references,
  assets,
  parent = null,
) {
  const issues = [];
  if (!Array.isArray(references))
    return [{ message: "Choose references from your library." }];
  if (references.length > 14)
    issues.push({ message: "Use up to 14 references in the studio." });
  const seen = new Set();
  const resolved = references.map((ref) => ({
    ...ref,
    asset: assets.find((a) => a.id === ref?.assetId),
  }));
  for (const ref of resolved) {
    const { asset, assetId, role } = ref;
    const issue = (message) => issues.push({ assetId, message });
    if (!asset) {
      issue("A selected reference is missing. Remove it or import it again.");
      continue;
    }
    if (seen.has(assetId))
      issue(`${asset.name}: this reference is selected twice.`);
    seen.add(assetId);
    if (parent?.id === assetId)
      issue(
        `${asset.name} is already the asset being refined. Remove it from the extra references.`,
      );
    if (!studioReferenceRoles(model, asset).includes(role))
      issue(
        `${asset.name}: choose a compatible reference purpose for this model.`,
      );
    if (asset.mime.startsWith("video/")) {
      if (model === "gemini-3-pro-image")
        issue(
          `${asset.name}: Pro Image accepts image references. Choose Flash Image to use a video.`,
        );
      if (
        model === "gemini-omni-1.1-flash" &&
        (!asset.duration || asset.duration > 3.05)
      )
        issue(
          `${asset.name}: use a clip of 3 seconds or less as an Omni reference. To edit a longer video, choose Refine instead.`,
        );
    }
  }
  const videos = resolved.filter((r) => r.asset?.mime.startsWith("video/"));
  if (model === "gemini-omni-1.1-flash") {
    if (videos.length > 3)
      issues.push({ message: "Use at most three short video references." });
    if (parent?.mime.startsWith("video/") && videos.length)
      issues.push({
        message: "When refining a video, add image references only.",
      });
    for (const role of ["Starting frame", "Ending frame"])
      if (resolved.filter((r) => r.role === role).length > 1)
        issues.push({ message: `Use only one ${role.toLowerCase()}.` });
    if (
      resolved.some((r) => r.role === "Ending frame") &&
      !resolved.some((r) => r.role === "Starting frame")
    )
      issues.push({
        message: "Add a starting frame alongside the ending frame.",
      });
  } else if (
    resolved.filter((r) => r.asset?.mime.startsWith("image/")).length +
      (parent?.mime.startsWith("image/") ? 1 : 0) >
    14
  ) {
    issues.push({
      message: "Use at most 14 images, including the image being refined.",
    });
  }
  return issues;
}
