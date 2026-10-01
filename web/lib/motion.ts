export const motionTokens = {
  duration: { fast: 0.18, normal: 0.35, slow: 0.6 },
  easing: {
    smooth: [0.22, 1, 0.36, 1] as [number, number, number, number],
    sharp: [0.4, 0, 0.2, 1] as [number, number, number, number],
  },
  distance: { sm: 8, md: 16, lg: 24 },
};

export const fadeUp = {
  initial: { opacity: 0, y: motionTokens.distance.md },
  animate: { opacity: 1, y: 0 },
  transition: { duration: motionTokens.duration.normal, ease: motionTokens.easing.smooth },
};

export const staggerParent = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

export const staggerChild = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: motionTokens.easing.smooth },
  },
};
