const paths = {
  cube: [
    'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z',
    'm4 7.5 8 4.5 8-4.5M12 12v9M8 5.25l8 4.5',
  ],
  rotate: ['M20 7v5h-5', 'M19.4 12a7.5 7.5 0 1 0-1.7 5'],
  zoomIn: [
    'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM14.5 14.5 21 21M7 10h6M10 7v6',
  ],
  zoomOut: ['M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0ZM14.5 14.5 21 21M7 10h6'],
  reset: ['M4 10a8 8 0 1 1 2 8M4 4v6h6'],
  pose: ['M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 10l7-2 7 2M12 8v7m-4 6 4-6 4 6'],
  flex: [
    'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM12 8v7m-4 6 4-6 4 6M12 10l-6 2-2-5m8 3 6 2 2-5',
  ],
  celebrate: [
    'M14 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 5l7 6 7-6M12 11v5m-5 5 5-5 5 5M3 2v1m18-1v1',
  ],
  arrow: ['M5 12h14m-6-6 6 6-6 6'],
  refresh: [
    'M20 4v5h-5M4 20v-5h5',
    'M4.7 9a7.5 7.5 0 0 1 12.4-4.1L20 9M4 15l2.9 4.1A7.5 7.5 0 0 0 19.3 15',
  ],
  activity: ['M3 12h4l3-8 4 16 3-8h4'],
}

export default function Icon({ name, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]?.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  )
}
