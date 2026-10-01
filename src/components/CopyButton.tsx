import { useState } from "react";
import { copyToClipboard } from "../ipc";
import { CheckIcon, CopyIcon } from "./icons";

/** Icon button that copies `text`; shows a check for a moment as confirmation. */
export function CopyButton({ text, tip = "Copy" }: { text: string; tip?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="copy-btn"
      data-tip={copied ? "Copied" : tip}
      aria-label={tip}
      disabled={!text}
      onClick={() => {
        void copyToClipboard(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
    </button>
  );
}
