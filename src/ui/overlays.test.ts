import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from './overlays';

describe('focus dans une fenêtre', () => {
  it('Tab avance et reboucle, Maj+Tab recule et reboucle', () => {
    expect(nextFocusIndex(3, 0, false)).toBe(1);
    expect(nextFocusIndex(3, 2, false)).toBe(0);
    expect(nextFocusIndex(3, 0, true)).toBe(2);
    expect(nextFocusIndex(3, 2, true)).toBe(1);
  });

  it('venant de l’extérieur, Tab va au premier élément et Maj+Tab au dernier', () => {
    expect(nextFocusIndex(4, -1, false)).toBe(0);
    expect(nextFocusIndex(4, -1, true)).toBe(3);
  });

  it('une fenêtre sans élément actif ne déplace rien', () => {
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
  });
});
