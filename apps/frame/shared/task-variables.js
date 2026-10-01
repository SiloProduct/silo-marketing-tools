export const promptNames = (prompt = "") => [
  ...new Set(
    [...prompt.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]),
  ),
];
// Older tasks keep working until their next save migrates the single recipe.
export const imageRecipes = (task) =>
  Array.isArray(task.imageVariations)
    ? task.imageVariations
    : task.startingFrame
      ? [task.startingFrame]
      : [];
export const activeImageRecipes = (task) =>
  imageRecipes(task).filter((c) => c.enabled);
export const recipeFor = (task, sourceAssetId) =>
  imageRecipes(task).find((c) => c.sourceAssetId === sourceAssetId);
export const frameEnabled = (task) => activeImageRecipes(task).length > 0;
export const frameNames = (task) => [
  ...new Set(activeImageRecipes(task).flatMap((c) => promptNames(c.prompt))),
];
export const taskNames = (task) => [
  ...new Set([...frameNames(task), ...promptNames(task.prompt)]),
];
export const variableStage = (task, name) =>
  frameNames(task).includes(name)
    ? promptNames(task.prompt).includes(name)
      ? "Both"
      : "Image"
    : "Video";
export const frameCount = (task) =>
  activeImageRecipes(task).reduce(
    (sum, config) =>
      sum +
      promptNames(config.prompt).reduce(
        (n, name) =>
          n * (task.variables.find((v) => v.name === name)?.values.length || 0),
        1,
      ),
    0,
  );
export const activeVariables = (task) =>
  task.variables.filter((v) => taskNames(task).includes(v.name));
export const updateImageRecipe = (task, config) => ({
  imageVariations: imageRecipes(task).some(
    (c) => c.sourceAssetId === config.sourceAssetId,
  )
    ? imageRecipes(task).map((c) =>
        c.sourceAssetId === config.sourceAssetId ? config : c,
      )
    : [...imageRecipes(task), config],
});
export const dependsOnImage = (job, id) =>
  job.snapshot.frameDependencies?.some((d) => d.jobId === id) ||
  job.snapshot.frameJobId === id;
