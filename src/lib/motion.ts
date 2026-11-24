export const PLASMA_PANEL_SPRING = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 32,
  mass: 0.85,
};

export const VIEWPORT_RECEDE_TRANSITION = {
  duration: 0.38,
  ease: [0.22, 1, 0.36, 1] as const,
};

export const PANEL_STAGGER = {
  delayChildren: 0.12,
  staggerChildren: 0.035,
};
