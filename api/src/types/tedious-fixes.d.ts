// src/types/tedious-fixes.d.ts

// Minimal definition for AggregateError
declare class AggregateError extends Error {
    errors: Error[];
    constructor(errors: Error[], message?: string);
}

// Minimal definition for ErrorOptions
interface ErrorOptions {}
