-- Cover live foreign keys reported by the real project advisor.
-- Private comparisontext archives retain their original schema and indexes.
-- These indexes change neither RLS, receipts nor account/domain data.
CREATE INDEX IF NOT EXISTS discovery_game_actions_permit_fk ON lingjing_discovery.game_actions(permit_id);
CREATE INDEX IF NOT EXISTS discovery_location_nonces_device_fk ON lingjing_discovery.location_nonces(auth_uid,device_id);
CREATE INDEX IF NOT EXISTS lingjing_legacy_claims_auth_fk ON lingjing_private.legacy_account_claims(linked_auth_user_id);
CREATE INDEX IF NOT EXISTS lingjing_revoked_sessions_auth_fk ON lingjing_private.revoked_auth_sessions(auth_user_id);
CREATE INDEX IF NOT EXISTS lingjing_battle_invites_room_fk ON public.lingjing_battle_invites(room_id);
CREATE INDEX IF NOT EXISTS lingjing_battle_settlements_room_fk ON public.lingjing_battle_settlements(room_id);
CREATE INDEX IF NOT EXISTS lingjing_battle_training_auth_fk ON public.lingjing_battle_training(actor_auth_uid);
CREATE INDEX IF NOT EXISTS lingjing_battle_training_commands_session_fk ON public.lingjing_battle_training_commands(session_id);
CREATE INDEX IF NOT EXISTS lingjing_battle_training_settlements_session_fk ON public.lingjing_battle_training_settlements(session_id);
CREATE INDEX IF NOT EXISTS lingjing_resource_references_package_fk ON public.lingjing_resource_references(auth_user_id,resource_id,manifest_sha256);
CREATE INDEX IF NOT EXISTS lingjing_resource_references_action_fk ON public.lingjing_resource_references(owner_account_id,authority_action_id);
CREATE INDEX IF NOT EXISTS runtime_territory_logs_session_fk ON public.runtime_territory_logs(session_id);
CREATE INDEX IF NOT EXISTS runtime_territory_views_region_fk ON public.runtime_territory_views(territory_id);
