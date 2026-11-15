/** The mark: a planet on its orbit line, with the line becoming a waveform as it crosses. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M1 16h7.2l1.6-4.6 2.2 9.6 2.3-12.4 2.3 13.6 2.2-10.4 1.9 6.6 1.3-2.4H31"
        fill="none"
        stroke="var(--signal)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
