import type { SVGProps } from "react";

interface TrellisLogoProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/**
 * Crisp geometric quantum-lattice emblem in Burnished Copper (#EA7A3D) & Ice Blue (#38BDF8).
 */
export function TrellisLogo({ size = 32, className, ...props }: TrellisLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <defs>
        <linearGradient
          id="trellis-lattice-grad"
          x1="4"
          y1="4"
          x2="32"
          y2="32"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#EA7A3D" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <linearGradient
          id="trellis-bg-grad"
          x1="0"
          y1="0"
          x2="36"
          y2="36"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#EA7A3D" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {/* Rounded container shield */}
      <rect
        x="1.25"
        y="1.25"
        width="33.5"
        height="33.5"
        rx="9"
        fill="url(#trellis-bg-grad)"
        stroke="url(#trellis-lattice-grad)"
        strokeOpacity="0.45"
        strokeWidth="1.25"
      />

      {/* Outer diamond lattice */}
      <path
        d="M18 6.5L29.5 18L18 29.5L6.5 18L18 6.5Z"
        stroke="url(#trellis-lattice-grad)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Inner trellis cross-struts */}
      <path
        d="M12.25 12.25L23.75 23.75M23.75 12.25L12.25 23.75"
        stroke="#38BDF8"
        strokeOpacity="0.7"
        strokeWidth="1.3"
        strokeLinecap="round"
      />

      {/* Center quantum core */}
      <rect
        x="15.2"
        y="15.2"
        width="5.6"
        height="5.6"
        rx="1.2"
        transform="rotate(45 18 18)"
        fill="#EA7A3D"
      />

      {/* Lattice corner nodes */}
      <circle cx="18" cy="6.5" r="1.75" fill="#F2945E" />
      <circle cx="29.5" cy="18" r="1.75" fill="#38BDF8" />
      <circle cx="18" cy="29.5" r="1.75" fill="#38BDF8" />
      <circle cx="6.5" cy="18" r="1.75" fill="#F2945E" />
    </svg>
  );
}
