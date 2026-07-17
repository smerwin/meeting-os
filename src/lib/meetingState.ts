import type { MeetingState } from "../server";

export const EMPTY_STATE: MeetingState = {
  status: "setup",
  person: {
    name: "",
    role: "",
    company: "",
    email: "",
    bio: "",
    facts: [],
    links: []
  },
  company: { name: "", summary: "", culture: [], links: [] },
  context: [],
  prep: { talkingPoints: [], questions: [] },
  transcript: [],
  notes: []
};

// A DO's persisted state can predate fields added later (a running session's
// stored `person`/`company` may lack keys this client now expects). Merge
// whatever the server sends over these defaults so the rest of the app can
// assume the full shape.
export function normalizeState(partial: Partial<MeetingState>): MeetingState {
  return {
    status: partial.status ?? EMPTY_STATE.status,
    person: { ...EMPTY_STATE.person, ...partial.person },
    company: { ...EMPTY_STATE.company, ...partial.company },
    context: partial.context ?? [],
    prep: { ...EMPTY_STATE.prep, ...partial.prep },
    transcript: partial.transcript ?? [],
    notes: partial.notes ?? []
  };
}
