export function EdunexaMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="edunexa-mark-gradient-shared" x1="8" y1="5" x2="55" y2="59" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16B9E8" />
          <stop offset=".55" stopColor="#087FF5" />
          <stop offset="1" stopColor="#7139D8" />
        </linearGradient>
      </defs>
      <path d="M42 7H24C13.5 7 6 14.4 6 25v14c0 10.8 7.4 18 18 18h18l8-9H25c-5.1 0-8-2.8-8-8V25c0-5 2.9-8 8-8h17l8-10H42Z" fill="url(#edunexa-mark-gradient-shared)"/>
      <path d="M22 24h29l-7.5 9H22v-9Zm0 15h23l-7.5 9H22v-9Z" fill="url(#edunexa-mark-gradient-shared)"/>
      <path d="m46 9 8-4v10l-8 4V9Z" fill="#16B9E8"/>
      <circle cx="57" cy="24" r="3" fill="#16B9E8"/>
      <circle cx="52" cy="31" r="2" fill="#7139D8"/>
    </svg>
  );
}
