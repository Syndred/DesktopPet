export const CORE_EVENTS = {
  PET_WINDOW_INTERACT: "pet_window_interact",
  LBS_CAPTURE_ATTEMPT: "lbs_capture_attempt",
  LBS_CAPTURE_SUCCESS: "lbs_capture_success",
  BATTLE_ROOM_CREATED: "battle_room_created",
  BATTLE_ROUND_SYNCED: "battle_round_synced",
  BATTLE_FINISHED: "battle_finished",
  TERRITORY_INVADE: "territory_invade",
  TERRITORY_OCCUPIED: "territory_occupied",
  EMOTION_FEEDBACK_TRIGGERED: "emotion_feedback_triggered",
  CLIENT_CRASH: "client_crash"
} as const;

export type CoreEventName = (typeof CORE_EVENTS)[keyof typeof CORE_EVENTS];

export interface TrackingEvent<TPayload = Record<string, unknown>> {
  name: CoreEventName;
  occurredAt: string;
  payload: TPayload;
}

