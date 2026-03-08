

## Problem

The `useBudget` hook loads categories from `localStorage` on startup. Since you already used the app before the change, the old categories are cached and the new defaults are never applied.

## Solution

Update `useBudget.ts` to detect when the default categories have changed and merge/reset accordingly. Specifically:

1. **In `useBudget.ts`**: When loading categories from localStorage, check if the stored categories still match the current defaults. If DEFAULT_CATEGORIES has IDs not present in the stored version, reset to defaults (or merge the new ones in).

A simple approach: always ensure all DEFAULT_CATEGORIES IDs exist in the loaded categories. If any are missing, reset to DEFAULT_CATEGORIES.

This is a small change in the `useState` initializer for `categories` in `src/hooks/useBudget.ts`.

