import { describe, expect, it } from 'vitest';
import { resolveAnimationMotionPolicy } from './animationMotionPolicy';

describe('Animation resolved motion policy', () => {
  it('uses verification over project over system preference', () => {
    expect(
      resolveAnimationMotionPolicy({
        system: 'reduced',
        project: 'full',
        verification: 'reduced',
      })
    ).toEqual({ mode: 'reduced', source: 'verification' });
    expect(
      resolveAnimationMotionPolicy({
        system: 'reduced',
        project: 'full',
        verification: 'inherit',
      })
    ).toEqual({ mode: 'full', source: 'project' });
    expect(
      resolveAnimationMotionPolicy({
        system: 'reduced',
        project: 'follow-system',
      })
    ).toEqual({ mode: 'reduced', source: 'system' });
  });
});
