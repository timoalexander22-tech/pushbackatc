<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Architecture
- The pure crew engine owns the opening radio log, combined clearance/brake transition and post-brake automatic disconnect; providers only execute its speech/timer effects to keep training and live dialogue consistent.
- Ground-crew dialogue logic lives in pure TS (`src/lib/crew/engine.ts`) with no browser APIs, so a future Windows/SimConnect build can reuse it; React state wraps it in `store.tsx`.
- iPad build is fully local (no backend, no accounts); settings persist in localStorage only, by product requirement.
- PWA is manifest-only (no service worker) until offline support is explicitly requested.
- PTT input arbitration lives in `src/lib/ptt.ts`; recognition stays in `speech.ts` and ends on last release or cancels on focus loss, so overlapping keyboard/touch holds cannot leave the microphone active.
- SimBrief OFP reads use a validated public server function and local flight storage; import airport/callsign only, never infer live position or pushback direction from a planned runway.
