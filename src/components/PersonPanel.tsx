import type { PersonInfo } from "../server";
import { FactsList } from "./FactsList";
import { LinksList } from "./LinksList";

export function PersonPanel({
  person,
  connected,
  onRefresh
}: {
  person: PersonInfo;
  connected: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="panel person-panel">
      <div className="panel-head panel-head-row">
        <span>participant</span>
        <button
          className="panel-action"
          disabled={!connected || !person.name}
          onClick={onRefresh}
          aria-label="Refresh enrichment"
        >
          ↻ refresh
        </button>
      </div>
      <div className="panel-body scroll">
        <div className="person-name">{person.name || "—"}</div>
        <div className="person-role">{person.role}</div>
        <div className="person-company">{person.company}</div>
        <div className="hr" />
        <div className="person-bio">
          {person.bio || "-- no enrichment data yet --"}
        </div>
        <FactsList items={person.facts} />
        <LinksList links={person.links} />
      </div>
    </div>
  );
}
