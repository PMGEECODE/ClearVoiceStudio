"use client";

import React from "react";

type BootstrapDownloadIconProps = {
  size?: number;
  /** Animate only the downward arrow, not the cloud */
  animate?: boolean;
  className?: string;
};

/**
 * Lucide-style download-cloud split into static cloud + animated arrow group.
 */
export const BootstrapDownloadIcon: React.FC<BootstrapDownloadIconProps> = ({
  size = 28,
  animate = false,
  className = "",
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`bootstrap-download-icon ${className}`.trim()}
      aria-hidden="true"
    >
      <path
        className="bootstrap-download-cloud"
        d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"
      />
      <g className={animate ? "bootstrap-download-arrow bootstrap-download-arrow--active" : "bootstrap-download-arrow"}>
        <path d="M12 13v8l-4-4" />
        <path d="m12 21 4-4" />
      </g>
    </svg>
  );
};
