import type { CompanyInfo } from "../server";
import { FactsList } from "./FactsList";
import { LinksList } from "./LinksList";

export function CompanyPanel({
  company,
  connected,
  onRefresh
}: {
  company: CompanyInfo;
  connected: boolean;
  onRefresh: () => void;
}) {
  if (!company.name) return null;

  return (
    <div className="panel company-panel">
      <div className="panel-head panel-head-row">
        <span>company</span>
        <button
          className="panel-action"
          disabled={!connected}
          onClick={onRefresh}
          aria-label="Refresh company enrichment"
        >
          ↻ refresh
        </button>
      </div>
      <div className="panel-body scroll">
        <div className="person-name">{company.name}</div>
        <div className="hr" />
        <div className="person-bio">
          {company.summary || "-- no enrichment data yet --"}
        </div>
        <FactsList items={company.culture} />
        <LinksList links={company.links} />
      </div>
    </div>
  );
}
