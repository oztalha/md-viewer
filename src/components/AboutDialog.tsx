import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../store";
import { REPO_URL } from "../links";
import appIcon from "../../src-tauri/icons/128x128@2x.png";

/**
 * About window. Replaces macOS's native About panel, whose credits are plain
 * text, so the project link can be a real, clickable link.
 */
export function AboutDialog() {
  const open = useStore((s) => s.aboutOpen);
  return open ? <About /> : null;
}

function About() {
  const close = () => useStore.getState().setAboutOpen(false);
  const [version, setVersion] = useState("");

  useEffect(() => {
    void getVersion().then(setVersion);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      useStore.getState().setAboutOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const link = (href: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    void openUrl(href);
  };

  return (
    <div className="settings-backdrop" onClick={close}>
      <div className="remote-prompt about-dialog" onClick={(event) => event.stopPropagation()}>
        <img className="about-icon" src={appIcon} alt="" />
        <h2 className="about-name">Markdown</h2>
        <p className="about-version">{version ? `Version ${version}` : " "}</p>
        <p className="about-tagline">
          A fast markdown editor and viewer for your Mac and any machine you can ssh to.
        </p>
        <p className="about-links">
          <a href={REPO_URL} onClick={link(REPO_URL)}>
            github.com/oztalha/md-viewer
          </a>
          <span aria-hidden="true"> · </span>
          <a href={`${REPO_URL}/issues/new`} onClick={link(`${REPO_URL}/issues/new`)}>
            Report an issue
          </a>
        </p>
        <p className="about-credit">Based on md-viewer by Max Leiter. MIT License.</p>
      </div>
    </div>
  );
}
