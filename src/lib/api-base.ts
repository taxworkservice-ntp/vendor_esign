// Single place that resolves the client/vendor API base.
//
// Vercel PREVIEW deployments run fully in demo (mock) mode: they must never
// reach the production backend. `__VERCEL_ENV__` is injected by vite.config.ts
// from Vercel's build env ('' locally and in tests). Local dev already defaults
// to mock because the base is empty.
declare const __VERCEL_ENV__: string

const rawApi = (import.meta.env.VITE_API_BASE ?? '') as string
const rawAdmin = (import.meta.env.VITE_ADMIN_API_BASE ?? '') as string

/** True on a Vercel preview deployment (forces mock mode everywhere). */
export const IS_PREVIEW = typeof __VERCEL_ENV__ !== 'undefined' && __VERCEL_ENV__ === 'preview'

/** Client/vendor API base. Empty ⇒ mock mode. */
export const API_BASE = IS_PREVIEW ? '' : rawApi

/** Admin API base. Falls back to the client base; empty ⇒ mock mode. */
export const ADMIN_API_BASE = IS_PREVIEW ? '' : rawAdmin || rawApi

/** Whether a distinct admin base was configured (drives the mount prefix). */
export const HAS_ADMIN_BASE = !!rawAdmin
