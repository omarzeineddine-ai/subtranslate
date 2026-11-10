"use client";

import { useEffect, useState } from "react";
import { readStoredApiKey, writeStoredApiKey } from "@/lib/api-key";

const browserStorage = () => (typeof localStorage === "undefined" ? undefined : localStorage);

/** The visitor's own OpenAI key and whether to keep it in this browser.
 * Held by the page rather than the form: the form is unmounted after every
 * finished run, and a key typed once should last for the files that follow
 * even when it is not being remembered between visits. */
export function useApiKey() {
  const [value, setValue] = useState("");
  const [remember, setRemember] = useState(false);

  // A remembered key comes back after mount: storage is browser-only, and
  // reading it during render would make the server and client disagree.
  // Having one stored is what "remember" being on means.
  useEffect(() => {
    const stored = readStoredApiKey(browserStorage());
    if (!stored) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off sync from external storage
    setValue(stored);
    setRemember(true);
  }, []);

  return {
    value,
    remember,
    change(next: string) {
      setValue(next);
      if (remember) writeStoredApiKey(browserStorage(), next);
    },
    changeRemember(next: boolean) {
      setRemember(next);
      // Switching it off forgets the stored key at once, not at the next edit.
      writeStoredApiKey(browserStorage(), next ? value : undefined);
    },
  };
}
