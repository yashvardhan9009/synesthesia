import { Wait } from "../components/Guide.tsx";
import type { RegionProgress } from "./regionApi.ts";

/** Honest region-loading progress, counted by grid point (shared by Listening Intelligence and the case study). */
export function LoadProgress({ progress }: { progress: RegionProgress | null }) {
  return (
    <div className="listen-progress">
      <Wait active label="Asking NASA POWER for the region's grid." slow="Still collecting the monthly record at each grid point from NASA POWER." />
      {progress && (
        <>
          <progress max={progress.total} value={progress.done} aria-label="Grid points loaded" />
          <p className="mono tiny muted">
            {progress.done} of {progress.total} grid points{progress.cached > 0 ? ` (${progress.cached} from the cache)` : ""}
            {progress.failed > 0 ? `, ${progress.failed} not answering yet` : ""}. 1981 to the last complete year, four variables each.
          </p>
        </>
      )}
    </div>
  );
}
