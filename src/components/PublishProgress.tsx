import { useEffect } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { CopyButton } from "./CopyButton";

/** Corner indicator for a publish that goes on with the Publish dialog closed. */
export function PublishProgress() {
  const dialogOpen = useStore((s) => s.publishOpen);
  const job = useStore((s) => s.publishJob);
  const st = job?.status;
  const problems = st?.kind === "done" && (st.skipped.length > 0 || !!st.indexError);
  // A clean finish fades out by itself; problems and errors wait to be read.
  const settled = st?.kind === "done" && !problems && (job?.live === "live" || job?.live === null);
  const jobId = job?.id;
  useEffect(() => {
    if (!settled || dialogOpen) return;
    const timer = setTimeout(() => {
      if (useStore.getState().publishJob?.id === jobId) useStore.getState().setPublishJob(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [settled, dialogOpen, jobId]);

  if (dialogOpen || !job || !st) return null;
  const dismiss = () => useStore.getState().setPublishJob(null);
  const waiting = st.kind === "busy" || job.live === "waiting";

  return (
    <div className="publish-progress" role="status">
      <div className="publish-progress-main">
        {waiting && <span className="publish-progress-spin" />}
        <span className="publish-progress-text">
          {st.kind === "busy"
            ? `Publishing “${job.title}” to ${job.label}…`
            : st.kind === "error"
              ? `Couldn't publish “${job.title}”: ${st.message}`
              : job.live === "waiting"
                ? `“${job.title}” is up; GitHub Pages is getting it ready…`
                : `${st.updated ? "Updated" : "Published"} “${job.title}” on ${job.label}.`}
        </span>
        {st.kind === "done" && job.live !== "waiting" && (
          <button className="rb-github-btn" onClick={() => void openUrl(st.url)}>
            Open ↗
          </button>
        )}
        {st.kind === "done" && <CopyButton text={st.url} tip="Copy link" />}
        {st.kind !== "busy" && (
          <button className="publish-progress-close" onClick={dismiss} aria-label="Dismiss">
            ×
          </button>
        )}
      </div>
      {st.kind === "busy" && st.detail && <div className="publish-progress-sub">{st.detail}</div>}
      {st.kind === "done" && (
        <div className="publish-progress-sub">
          {job.live === "slow"
            ? "GitHub Pages is taking longer than usual; the link works once its build finishes."
            : st.locked
              ? "Link copied. Send the password separately."
              : "Link copied."}
        </div>
      )}
      {st.kind === "done" && st.skipped.length > 0 && (
        <div className="publish-progress-sub rb-error">
          Couldn't publish (links to these stay as they were):{"\n"}
          {st.skipped.join("\n")}
        </div>
      )}
      {st.kind === "done" && st.indexError && (
        <div className="publish-progress-sub rb-error">
          Your index page couldn't be updated: {st.indexError}
        </div>
      )}
    </div>
  );
}
