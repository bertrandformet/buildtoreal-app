import { describe, expect, it } from 'vitest';
import { installMode, isIos, type InstallEnvironment } from './installInfo';

const base: InstallEnvironment = { userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130', platform: 'Linux x86_64', maxTouchPoints: 0, standalone: false, displayStandalone: false, hasPrompt: false };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';

describe('installation de l’application', () => {
  it('détecte un iPhone, un iPad et un iPad qui se présente comme un Mac', () => {
    expect(isIos({ ...base, userAgent: IPHONE, platform: 'iPhone' })).toBe(true);
    expect(isIos({ ...base, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad' })).toBe(true);
    expect(isIos({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
    expect(isIos({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIos(base)).toBe(false);
  });

  it('une application déjà installée passe avant tout le reste', () => {
    expect(installMode({ ...base, userAgent: IPHONE, platform: 'iPhone', standalone: true })).toBe('installed');
    expect(installMode({ ...base, displayStandalone: true, hasPrompt: true })).toBe('installed');
  });

  it('le bouton du navigateur, quand il existe, passe avant les gestes à la main', () => {
    expect(installMode({ ...base, hasPrompt: true })).toBe('prompt');
  });

  it('iPhone sans bouton : les trois gestes de Safari ; ailleurs : le menu du navigateur', () => {
    expect(installMode({ ...base, userAgent: IPHONE, platform: 'iPhone' })).toBe('ios');
    expect(installMode(base)).toBe('other');
  });
});
