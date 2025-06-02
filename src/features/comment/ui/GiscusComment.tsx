"use client";
import { useEffect, useRef } from "react";

export const GiscusComment = () => {
  const giscusEl = useRef<HTMLDivElement | null>(null);
  const giscusLoaded = useRef(false);

  useEffect(() => {
    if (!giscusEl.current) return;

    const giscus = document.createElement("script");
    const giscusConfig: { [key: string]: string } = {
      src: "https://giscus.app/client.js",
      ["data-repo"]: "ybw903/Byoo.log",
      ["data-repo-id"]: "R_kgDOO0Z_8A",
      ["data-category"]: "Comments",
      ["data-category-id"]: "DIC_kwDOO0Z_8M4Cq7zE",
      ["data-mapping"]: "pathname",
      ["data-strict"]: "0",
      ["data-reactions-enabled"]: "1",
      ["data-emit-metadata"]: "0",
      ["data-input-position"]: "bottom",
      ["data-theme"]: "preferred_color_scheme",
      ["data-lang"]: "ko",
      ["data-loading"]: "lazy",
      crossorigin: "anonymous",
      async: "true",
    };

    Object.keys(giscusConfig).forEach((configKey) => {
      giscus.setAttribute(configKey, giscusConfig[configKey]);
    });
    giscusEl.current.appendChild(giscus);

    if (giscusLoaded.current) {
      giscusEl.current.replaceChild(
        giscus,
        giscusEl.current.firstChild as Node
      );
    } else {
      giscusLoaded.current = true;
    }
  }, [giscusEl]);

  return <div className="giscus mt-8" ref={giscusEl} />;
};
