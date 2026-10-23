/** the slice of a whole job that one step covers */
export interface Step {
  /** how far along the job is when the step starts */
  from: number;
  /** how far along it is once the step is done */
  to: number;
}

/** how far along a job is, and how far the step it's in can take it */
export interface Spot {
  /** how far along the whole job is */
  progress: number;
  /** how far along it will be when the current step is done */
  upto: number;
}

/**
 * cut a job into steps, each sized by how long it tends to take
 *
 * The weights are relative, so `{ capture: 1, render: 3 }` gives capture the
 * first quarter of the job and render the rest.
 */
export function steps<Name extends string>(
  weights: Record<Name, number>,
): Record<Name, Step> {
  const named = Object.entries(weights) as [Name, number][];
  const total = named.reduce((sum, [, weight]) => sum + weight, 0);
  const cut = {} as Record<Name, Step>;
  let before = 0;
  for (const [name, weight] of named) {
    // the ends divide the running total, so the last step ends at exactly one
    cut[name] = { from: before / total, to: (before + weight) / total };
    before += weight;
  }
  return cut;
}

// a drift stops short of the step's end, so a step that drags on doesn't leave
// the ring looking done
const CREEP = 0.85;

/** how far along the job a step's ring gets while nothing more is reported */
export function reach({ progress, upto }: Spot): number {
  return progress + Math.max(upto - progress, 0) * CREEP;
}

/** how far along the job `portion` of the way through `step` is */
export function within(step: Step, portion: number): Spot {
  const { from, to } = step;
  const part = Math.min(Math.max(portion, 0), 1);
  return { progress: from + (to - from) * part, upto: to };
}
