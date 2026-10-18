/**
 * Inline scripts that run in <head> before first paint. They live in a plain module on purpose: a constant exported
 * from a "use client" file reaches a server component as a client reference, not as a string.
 */
export const themeStorageKey = "ib-theme";
export const sideStorageKey = "ib-side";

/** A stored theme choice never flashes the other theme. */
export const themeScript = `try{var t=localStorage.getItem("${themeStorageKey}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

/** A stored sidebar choice ("full" or "rail") never jumps. Nothing stored means the breakpoint decides. */
export const sideScript = `try{var v=localStorage.getItem("${sideStorageKey}");if(v==="full"||v==="rail")document.documentElement.dataset.side=v}catch(e){}`;
