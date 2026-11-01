import type { ReactElement, SVGProps } from "react";

/** the props an icon takes */
export interface IconProps extends SVGProps<SVGSVGElement> {
  /** edge length, as a css length or a number of pixels */
  size?: number | string;
}

/** the square every mark is drawn in */
function Mark({ size = "1.5em", children, ...rest }: IconProps): ReactElement {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** a host rePub is allowed to read */
export function Check(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path d="M8.94 26.06 L19.5 36.62 L39.06 17.06 L36.94 14.94 L22.68 29.2 Q19.5 32.38 16.32 29.2 L11.06 23.94Z" />
    </Mark>
  );
}

/** clear a changed setting */
export function Cross(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path d="M39.2 37.08 L37.08 39.2 L27.18 29.3 Q24 26.12 20.82 29.3 L10.92 39.2 L8.8 37.08 L18.7 27.18 Q21.88 24 18.7 20.82 L8.8 10.92 L10.92 8.8 L20.82 18.7 Q24 21.88 27.18 18.7 L37.08 8.8 L39.2 10.92 L29.3 20.82 Q26.12 24 29.3 27.18Z" />
    </Mark>
  );
}

/** open a setting's explanation */
export function ChevronDown(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path d="M6.94 18.06 L24 35.12 L41.06 18.06 L38.94 15.94 L27.18 27.7 Q24 30.88 20.82 27.7 L9.06 15.94Z" />
    </Mark>
  );
}

/** close it again */
export function ChevronUp(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path d="M9.06 32.06 L20.82 20.3 Q24 17.12 27.18 20.3 L38.94 32.06 L41.06 29.94 L24 12.88 L6.94 29.94Z" />
    </Mark>
  );
}

/** leave substituted characters alone */
export function Ban(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <circle
        cx="24"
        cy="24"
        r="15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M11.94 14.06 L33.94 36.06 L36.06 33.94 L14.06 11.94Z" />
    </Mark>
  );
}

/** shrink substituted characters to fit any font */
export function Lock(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="12.5"
        y="23.5"
        width="23"
        height="17"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M17 22v-5.5a7 7 0 0 1 14 0V22"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </Mark>
  );
}

/** a host that hasn't been asked about yet */
export function Question(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path
        d="M17 18a7 7 0 1 1 7 7v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect x="22" y="34" width="4" height="4" />
    </Mark>
  );
}

/** a host that refused rePub */
export function Warning(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path
        d="M20.07 16.1 Q24 9.07 27.93 16.1 L36.7 31.8 Q40.44 38.5 32.77 38.5 L15.23 38.5 Q7.56 38.5 11.3 31.8Z M2.44 41.5 L45.56 41.5 L24 2.93Z"
        fillRule="evenodd"
      />
      <rect x="22.5" y="17" width="3" height="8" />
      <rect x="22" y="31.5" width="4" height="4" />
    </Mark>
  );
}

/** a tab rePub can convert */
export function Globe(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <circle
        cx="24"
        cy="24"
        r="15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect x="8.5" y="22.5" width="31" height="3" />
      <path
        d="M24 7.5c4.4 5.6 4.4 28.4 0 33"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M24 7.5c-4.4 5.6-4.4 28.4 0 33"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </Mark>
  );
}

/** tables at their own resolution */
export function CellsOne(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="10.5"
        y="10.5"
        width="27"
        height="27"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </Mark>
  );
}

/** tables at three times the resolution */
export function CellsFour(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="10.5"
        y="10.5"
        width="27"
        height="27"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect x="9" y="22.5" width="30" height="3" />
      <rect x="22.5" y="9" width="3" height="30" />
    </Mark>
  );
}

/** tables at nine times the resolution */
export function CellsNine(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="10.5"
        y="10.5"
        width="27"
        height="27"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <rect x="9" y="17.5" width="30" height="3" />
      <rect x="9" y="27.5" width="30" height="3" />
      <rect x="17.5" y="9" width="3" height="30" />
      <rect x="27.5" y="9" width="3" height="30" />
    </Mark>
  );
}

/** keep the first image only */
export function Image(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="9.5"
        y="12.5"
        width="29"
        height="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="16.5" cy="19.5" r="2.5" />
      <path d="M15.2 33.9 L16.71 31.88 Q20.08 27.4 23.73 31.66 L26.02 34.32 L27.18 32.93 Q30.91 28.45 34.3 33.2 L34.78 33.87 L37.22 32.13 L31.09 23.55 L29.39 25.59 Q25.98 29.68 22.52 25.63 L19.92 22.6 L12.8 32.1Z" />
    </Mark>
  );
}

/** keep every image */
export function Images(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path d="M15 7h24v21h-3V10H15Z" />
      <rect
        x="8.5"
        y="14.5"
        width="27"
        height="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle cx="15" cy="21" r="2.5" />
      <path d="M11.2 35.9 L12.71 33.88 Q16.08 29.4 19.73 33.66 L22.02 36.32 L23.18 34.93 Q26.91 30.45 30.3 35.2 L30.78 35.87 L33.22 34.13 L27.09 25.55 L25.39 27.59 Q21.98 31.68 18.52 27.63 L15.92 24.6 L8.8 34.1Z" />
    </Mark>
  );
}

/** remove every image */
export function ImageOff(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="9.5"
        y="12.5"
        width="29"
        height="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M30.36 28.24 L28.24 30.36 L27.18 29.3 Q24 26.12 20.82 29.3 L19.76 30.36 L17.64 28.24 L18.7 27.18 Q21.88 24 18.7 20.82 L17.64 19.76 L19.76 17.64 L20.82 18.7 Q24 21.88 27.18 18.7 L28.24 17.64 L30.36 19.76 L29.3 20.82 Q26.12 24 29.3 27.18Z" />
    </Mark>
  );
}

/** raise contrast where it helps */
export function Page(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path
        d="M13.5 13 Q13.5 8.5 18 8.5 L25.51 8.5 Q27.38 8.5 28.7 9.82 L33.18 14.3 Q34.5 15.62 34.5 17.49 L34.5 35 Q34.5 39.5 30 39.5 L18 39.5 Q13.5 39.5 13.5 35Z M10.5 42.5 L37.5 42.5 L37.5 14.38 L28.62 5.5 L10.5 5.5Z"
        fillRule="evenodd"
      />
    </Mark>
  );
}

/** raise contrast over the whole page */
export function PageLines(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path
        d="M13.5 13 Q13.5 8.5 18 8.5 L25.51 8.5 Q27.38 8.5 28.7 9.82 L33.18 14.3 Q34.5 15.62 34.5 17.49 L34.5 35 Q34.5 39.5 30 39.5 L18 39.5 Q13.5 39.5 13.5 35Z M10.5 42.5 L37.5 42.5 L37.5 14.38 L28.62 5.5 L10.5 5.5Z"
        fillRule="evenodd"
      />
      <rect x="17" y="21.5" width="14" height="3" />
      <rect x="17" y="27.5" width="14" height="3" />
      <rect x="17" y="33.5" width="9" height="3" />
    </Mark>
  );
}

/** leave contrast alone */
export function PageImage(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path
        d="M13.5 13 Q13.5 8.5 18 8.5 L25.51 8.5 Q27.38 8.5 28.7 9.82 L33.18 14.3 Q34.5 15.62 34.5 17.49 L34.5 35 Q34.5 39.5 30 39.5 L18 39.5 Q13.5 39.5 13.5 35Z M10.5 42.5 L37.5 42.5 L37.5 14.38 L28.62 5.5 L10.5 5.5Z"
        fillRule="evenodd"
      />
      <circle cx="19" cy="25" r="2.5" />
      <path d="M16.68 35.93 L17.56 34.81 Q21.02 30.4 24.58 34.74 L25.47 35.84 L24.92 36.48 Q28.46 32.35 31.85 36.59 L31.33 35.94 L33.67 34.06 L28.54 27.65 L29.02 27.08 Q25.53 31.16 22.12 27.01 L20.98 25.6 L14.32 34.07Z" />
    </Mark>
  );
}

/** font size */
export function Letter(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path d="M12.38 40.58 L19.85 22.77 Q24 12.88 28.15 22.77 L35.62 40.58 L38.38 39.42 L24 5.12 L9.62 39.42Z" />
      <rect x="16.5" y="29.5" width="15" height="3" />
    </Mark>
  );
}

/** ragged right */
export function AlignLeft(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect x="10" y="9.5" width="28" height="3" />
      <rect x="10" y="18.5" width="19" height="3" />
      <rect x="10" y="27.5" width="28" height="3" />
      <rect x="10" y="36.5" width="15" height="3" />
    </Mark>
  );
}

/** justified text, and the page margins */
export function AlignJustify(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect x="10" y="9.5" width="28" height="3" />
      <rect x="10" y="18.5" width="28" height="3" />
      <rect x="10" y="27.5" width="28" height="3" />
      <rect x="10" y="36.5" width="28" height="3" />
    </Mark>
  );
}

/** tight line height */
export function LinesThree(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect x="10" y="11.5" width="28" height="3" />
      <rect x="10" y="22.5" width="28" height="3" />
      <rect x="10" y="33.5" width="28" height="3" />
    </Mark>
  );
}

/** loose line height */
export function LinesTwo(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect x="10" y="15.5" width="28" height="3" />
      <rect x="10" y="29.5" width="28" height="3" />
    </Mark>
  );
}

/** paste the one-time code */
export function Clipboard(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <rect
        x="12.5"
        y="12.5"
        width="23"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path d="M18 6h12v8H18Z" />
      <rect x="17" y="23.5" width="14" height="3" />
      <rect x="17" y="31.5" width="9" height="3" />
    </Mark>
  );
}

/** a setting that is on */
export function CheckCircle(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <path
        d="M24 4a20 20 0 1 0 0 40 20 20 0 0 0 0-40Z M12.94 25.06 L21.5 33.62 L36.06 19.06 L33.94 16.94 L24.68 26.2 Q21.5 29.38 18.32 26.2 L15.06 22.94Z"
        fillRule="evenodd"
      />
    </Mark>
  );
}

/** a setting that is off */
export function Circle(props: IconProps): ReactElement {
  return (
    <Mark {...props}>
      <circle
        cx="24"
        cy="24"
        r="18.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
    </Mark>
  );
}
