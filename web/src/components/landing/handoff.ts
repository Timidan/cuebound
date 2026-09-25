import { motionValue } from "motion/react";

// Where the hero's character hands over to the level: the page scroll at which the level's own sprite takes over
// (the level's top reaching the top of the screen) and the page position of the level's first drop point.
// JumpStory measures these; the hero sprite steers towards them.
export const handoff = { showAt: motionValue(Number.NaN), x: motionValue(0), y: motionValue(0) };
