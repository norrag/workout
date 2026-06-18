-- 20260618000002 — allow admins to discard an inactive engine-params version
-- (MCP tooling review §5.8: no delete/undo for propose_engine_params).
--
-- The tuning loop (propose → replay → simulate → activate) leaves inactive
-- proposals behind, and there was no way to remove a mistaken one — the second
-- review's QA left an undeletable inactive v7. `engine_params` had select /
-- admin-insert / admin-update policies but no delete policy, so RLS denied
-- every delete by default.
--
-- This adds an admin-only delete policy. The application layer
-- (`deleteEngineParamsVersion` + the `discard_engine_params` tool) refuses to
-- delete the ACTIVE version or any version referenced by a recorded
-- engine_decision, so an admin can only ever discard an unused proposal — the
-- active engine and the historical decisions' params provenance are preserved.

create policy "engine_params_admin_delete" on public.engine_params
  for delete using (public.is_admin());
