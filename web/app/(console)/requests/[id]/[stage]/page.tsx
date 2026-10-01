import { RequestWorkspace } from "@/components/RequestWorkspace";
import { StageRequest } from "@/components/stages/StageRequest";
import { StageStructure } from "@/components/stages/StageStructure";
import { StageEvidence } from "@/components/stages/StageEvidence";
import { StageVerify } from "@/components/stages/StageVerify";
import { StageGaps } from "@/components/stages/StageGaps";
import { StageRespond } from "@/components/stages/StageRespond";
import type { StageKey } from "@/components/RequestWorkspace";

const MAP: Record<string, () => JSX.Element> = {
  request: StageRequest,
  structure: StageStructure,
  evidence: StageEvidence,
  verify: StageVerify,
  gaps: StageGaps,
  respond: StageRespond,
};

export default function StagePage({ params }: { params: { id: string; stage: StageKey } }) {
  const Stage = MAP[params.stage] ?? StageRequest;
  return (
    <RequestWorkspace>
      <Stage />
    </RequestWorkspace>
  );
}
