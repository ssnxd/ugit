---
name: add-command
description: Scaffold a new Tauri command end-to-end — the Rust #[tauri::command] function, its registration in generate_handler!, and a typed frontend invoke wrapper. Use when adding any new backend operation callable from the React UI.
---

# Add a Tauri command

Wire up a new command that the React frontend can call into the Rust backend. Ask the user for the command name and its inputs/outputs if not given.

## Steps

1. **Rust command** in `src-tauri/src/lib.rs` (or a submodule for git logic):

   ```rust
   #[tauri::command]
   fn command_name(arg_one: String) -> Result<ReturnType, String> {
       // ... implement; map errors with .map_err(|e| e.to_string())
   }
   ```
   - Use `snake_case` for the fn and args.
   - Return `Result<T, String>` so errors reject the frontend promise. `T` must be `serde::Serialize`.
   - For git work, use the `gix` (gitoxide) crate.

2. **Register** it in the handler in `lib.rs`:

   ```rust
   .invoke_handler(tauri::generate_handler![greet, command_name])
   ```

3. **Typed frontend wrapper** (e.g. in `src/lib/commands.ts`):

   ```ts
   import { invoke } from "@tauri-apps/api/core";

   export function commandName(argOne: string): Promise<ReturnType> {
     return invoke("command_name", { argOne }); // camelCase here → snake_case in Rust
   }
   ```

   Define a matching TS type for the return value.

4. **Verify**: run `cargo build` in `src-tauri/` and `pnpm build` for the frontend type-check.

## Notes

- Arg keys are camelCase in JS, snake_case in Rust — Tauri converts automatically.
- If the command needs new permissions (fs, shell, etc.), add the capability under `src-tauri/capabilities/`.
