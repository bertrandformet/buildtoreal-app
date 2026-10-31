import { describe, expect, it } from 'vitest';
import { t } from '../i18n/fr';
import { MISSIONS } from './guideMissions';

describe('écran d’accueil', () => {
  it('annonce le nombre de missions du guide, sans les lister', () => {
    expect(MISSIONS.length).toBeGreaterThan(0);
    expect(t('welcome.missions', { n: MISSIONS.length })).toContain(String(MISSIONS.length));
  });
});
