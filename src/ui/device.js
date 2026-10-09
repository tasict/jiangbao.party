// What the player is holding. iPadOS reports itself as a Mac, so count touch points as well.
const ua = navigator.userAgent;
export const isAndroid = /Android/.test(ua);
export const isIOS = !isAndroid && (/iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export const isIOSChrome = isIOS && /CriOS/.test(ua);
export const isMobile = isIOS || isAndroid || matchMedia('(pointer: coarse)').matches;

// Opened from the home screen rather than in a browser tab.
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
