// A callback prop that takes nothing. Handed straight to onClick it would get the click event;
// typed (arg?: never) it can't, so a call site has to write () => onDone().
export type NoArgCallback = (arg?: never) => void
