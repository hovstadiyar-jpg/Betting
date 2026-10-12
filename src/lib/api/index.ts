// Server-side only: import from Server Components / route handlers, never from "use client" files.

import { mockProvider } from "./mock-provider";
import type { DataProvider } from "./provider";

/**
 * Single entry point for data access from server components.
 *
 * Phase 1: always the synthetic mock provider.
 * Phase 2+: switch on NEXT_PUBLIC_DATA_SOURCE (or similar) to an HTTP provider
 * that talks to the FastAPI backend, e.g.
 *
 *   export const api: DataProvider =
 *     process.env.DATA_SOURCE === "api" ? createHttpProvider(process.env.API_BASE_URL!) : mockProvider;
 */
export const api: DataProvider = mockProvider;

export type { DataProvider, ReferenceData } from "./provider";
