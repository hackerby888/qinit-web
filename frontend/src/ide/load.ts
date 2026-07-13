// One shared import promise lets the project gallery start fetching Monaco/IDE code before navigation and
// lets React.lazy reuse the exact same work when the project route mounts.
let ideModulePromise: Promise<typeof import("./Ide")> | null = null;
let ideModuleLoaded = false;

export function loadIdeModule(): Promise<typeof import("./Ide")> {
  if (!ideModulePromise) {
    ideModulePromise = import("./Ide")
      .then((module) => {
        ideModuleLoaded = true;
        return module;
      })
      .catch((error) => {
        ideModulePromise = null;
        throw error;
      });
  }
  return ideModulePromise;
}

export function isIdeModuleLoaded(): boolean {
  return ideModuleLoaded;
}
