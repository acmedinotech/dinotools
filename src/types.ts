/**
 * Taken verbatim from https://dev.to/maxime1992/implement-a-generic-oneof-type-with-typescript-22em
 */
export type OneOnly<Obj, Key extends keyof Obj> = { [key in Exclude<keyof Obj, Key>]: null } & Pick<Obj, Key>;
