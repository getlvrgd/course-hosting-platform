"use client";

import { useState } from "react";

import { copyLink } from "./CourseEditor";
import { BTN } from "./ui";

/** Puts a path on the clipboard as a full URL, and says so for a moment. */
export function CopyLinkButton({
  path,
  label = "Copy link",
}: {
  path: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        setCopied(await copyLink(path));
        setTimeout(() => setCopied(false), 1800);
      }}
      className={BTN}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
