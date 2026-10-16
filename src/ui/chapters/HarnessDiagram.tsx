import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useMemo } from "react";
import type { HarnessConfig } from "../../agents/harness";
import type { MessageKey } from "../../i18n/catalog";
import { useI18n } from "../../i18n/I18nProvider";

export type HarnessPart = "queue" | "agent" | "gate" | "person" | "server" | "subagent" | "memory" | "till";
type PartData = { label: string; detail: string; active: boolean; off: boolean };

function PartNode({ data }: NodeProps<Node<PartData>>) {
  return (
    <div className={`harness-part${data.active ? " is-active" : ""}${data.off ? " is-off" : ""}`}>
      <Handle type="target" position={Position.Left} />
      <Handle type="target" id="top" position={Position.Top} />
      <Handle type="target" id="below" position={Position.Bottom} />
      <strong>{data.label}</strong>
      <span>{data.detail}</span>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" id="bottom" position={Position.Bottom} />
      <Handle type="source" id="up" position={Position.Top} />
    </div>
  );
}

const nodeTypes = { part: PartNode };
const layout: Record<HarnessPart, { x: number; y: number }> = {
  queue: { x: 0, y: 60 },
  agent: { x: 190, y: 60 },
  gate: { x: 380, y: 60 },
  server: { x: 570, y: 60 },
  till: { x: 760, y: 60 },
  memory: { x: 190, y: 190 },
  person: { x: 380, y: 190 },
  subagent: { x: 570, y: 190 },
};

// The harness as a drawing: parts that are switched off stay on the page, greyed, so the learner sees what's missing.
export function HarnessDiagram({ config, active, tools }: { config: HarnessConfig; active: HarnessPart | null; tools: readonly string[] }) {
  const { t } = useI18n();
  const nodes = useMemo<Node<PartData>[]>(() => {
    const off: Partial<Record<HarnessPart, boolean>> = { memory: !config.memory, subagent: !config.subagent, person: config.refundPolicy !== "ask" };
    const detail: Record<HarnessPart, string> = {
      queue: t("agents.diagram.queueDetail"),
      agent: t("agents.diagram.agentDetail"),
      gate: t(`agents.policies.${config.refundPolicy}` as MessageKey),
      server: tools.join(", "),
      till: t("agents.diagram.tillDetail"),
      memory: t(config.memory ? "agents.on" : "agents.off"),
      person: t(config.refundPolicy === "ask" ? "agents.on" : "agents.off"),
      subagent: t(config.subagent ? "agents.on" : "agents.off"),
    };
    return (Object.keys(layout) as HarnessPart[]).map((part) => ({
      id: part,
      type: "part",
      position: layout[part],
      data: { label: t(`agents.diagram.${part}` as MessageKey), detail: detail[part], active: active === part, off: off[part] ?? false },
      draggable: false,
      selectable: false,
    }));
  }, [config, active, tools, t]);

  const edges = useMemo<Edge[]>(
    () => [
      { id: "queue-agent", source: "queue", target: "agent" },
      { id: "agent-gate", source: "agent", target: "gate", animated: active === "gate" },
      { id: "gate-server", source: "gate", target: "server", animated: active === "server" },
      { id: "server-till", source: "server", target: "till" },
      { id: "gate-person", source: "gate", sourceHandle: "bottom", target: "person", targetHandle: "top", hidden: config.refundPolicy !== "ask" },
      { id: "server-subagent", source: "server", sourceHandle: "bottom", target: "subagent", targetHandle: "top", hidden: !config.subagent },
      { id: "memory-agent", source: "memory", sourceHandle: "up", target: "agent", targetHandle: "below", hidden: !config.memory },
    ],
    [config, active],
  );

  return (
    <div className="harness-diagram" data-testid="harness-diagram" aria-label={t("agents.diagram.label")} role="img">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
      />
    </div>
  );
}
