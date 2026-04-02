import { useEffect, useMemo, useState } from 'react';
import { getTrackedMembers, type FamilyHistoryProfile, type FamilyMember } from './profile';
import { CLUSTERS, CLUSTER_ORDER, CONDITIONS_BY_ID, type ClusterId } from './taxonomy';
import { type SummaryArtifact } from './summary';

interface ClusterGraphNode {
  clusterId: ClusterId;
  counts: SummaryArtifact['clusterCounts'][ClusterId];
  total: number;
  members: FamilyMember[];
  memberIds: string[];
  conditions: string[];
}

interface ClusterGraphEdge {
  id: string;
  left: ClusterId;
  right: ClusterId;
  sharedMemberIds: string[];
  weight: number;
}

const CLUSTER_GRAPH_POSITIONS: Record<ClusterId, { x: number; y: number }> = {
  cardiovascular: { x: 620, y: 102 },
  metabolic: { x: 930, y: 202 },
  cancer: { x: 930, y: 400 },
  mental_health: { x: 620, y: 500 },
  neurologic: { x: 310, y: 400 },
  autoimmune: { x: 310, y: 202 },
};

function memberLabel(member: FamilyMember): string {
  return member.nameOptional?.trim() || member.displayLabel;
}

export function ClusterSignalBars({ artifact }: { artifact: SummaryArtifact }) {
  const totals = CLUSTER_ORDER.map((clusterId) => {
    const counts = artifact.clusterCounts[clusterId];
    return counts.first + counts.second;
  });
  const maxTotal = Math.max(1, ...totals);

  return (
    <div className="signal-bars">
      {CLUSTER_ORDER.map((clusterId) => {
        const cluster = CLUSTERS[clusterId];
        const counts = artifact.clusterCounts[clusterId];
        const total = counts.first + counts.second;
        const width = (total / maxTotal) * 100;
        const firstWidth = total === 0 ? 0 : (counts.first / total) * 100;
        return (
          <div key={clusterId} className="signal-row">
            <div className="signal-row-label">
              <span className="signal-dot" style={{ background: cluster.color }} />
              <span>{cluster.label}</span>
            </div>
            <div className="signal-row-track">
              <div className="signal-row-fill" style={{ width: `${width}%`, background: cluster.accent }}>
                <div className="signal-row-first" style={{ width: `${firstWidth}%`, background: cluster.color }} />
              </div>
            </div>
            <div className="signal-row-metrics">
              <span>{counts.first}F</span>
              <span>{counts.second}S</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ConditionClusterGraph({
  profile,
  artifact,
}: {
  profile: FamilyHistoryProfile;
  artifact: SummaryArtifact;
}) {
  const trackedMembers = useMemo(() => getTrackedMembers(profile), [profile]);

  const nodes = useMemo(() => {
    return Object.fromEntries(
      CLUSTER_ORDER.map((clusterId) => {
        const members = trackedMembers.filter((member) =>
          profile.facts.some(
            (fact) =>
              fact.memberId === member.id
              && fact.status === 'present'
              && CONDITIONS_BY_ID[fact.conditionId].cluster === clusterId,
          ),
        );
        const conditions = Array.from(
          new Set(
            profile.facts
              .filter((fact) => fact.status === 'present' && CONDITIONS_BY_ID[fact.conditionId].cluster === clusterId)
              .map((fact) => CONDITIONS_BY_ID[fact.conditionId].label),
          ),
        );
        const counts = artifact.clusterCounts[clusterId];
        return [
          clusterId,
          {
            clusterId,
            counts,
            total: counts.first + counts.second,
            members,
            memberIds: members.map((member) => member.id),
            conditions,
          } satisfies ClusterGraphNode,
        ];
      }),
    ) as Record<ClusterId, ClusterGraphNode>;
  }, [artifact, profile.facts, trackedMembers]);

  const edges = useMemo(() => {
    const results: ClusterGraphEdge[] = [];

    for (let leftIndex = 0; leftIndex < CLUSTER_ORDER.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < CLUSTER_ORDER.length; rightIndex += 1) {
        const left = CLUSTER_ORDER[leftIndex];
        const right = CLUSTER_ORDER[rightIndex];
        const sharedMemberIds = nodes[left].memberIds.filter((memberId) => nodes[right].memberIds.includes(memberId));
        if (sharedMemberIds.length === 0) {
          continue;
        }
        results.push({
          id: `${left}-${right}`,
          left,
          right,
          sharedMemberIds,
          weight: sharedMemberIds.length,
        });
      }
    }

    return results;
  }, [nodes]);

  const preferredCluster = useMemo(() => {
    const withSignals = CLUSTER_ORDER.find((clusterId) => nodes[clusterId].total > 0);
    return withSignals ?? CLUSTER_ORDER[0];
  }, [nodes]);

  const [selectedCluster, setSelectedCluster] = useState<ClusterId>(preferredCluster);

  useEffect(() => {
    if (nodes[selectedCluster].total === 0 && preferredCluster !== selectedCluster) {
      setSelectedCluster(preferredCluster);
    }
  }, [nodes, preferredCluster, selectedCluster]);

  const selectedNode = nodes[selectedCluster];
  const selectedMeta = CLUSTERS[selectedCluster];
  const selectedQuestions = artifact.missingQuestions.filter((question) => question.cluster === selectedCluster);
  const overlappingEdges = edges.filter((edge) => edge.left === selectedCluster || edge.right === selectedCluster);
  const overlappingClusters = overlappingEdges.map((edge) => {
    const otherClusterId = edge.left === selectedCluster ? edge.right : edge.left;
    return {
      clusterId: otherClusterId,
      label: CLUSTERS[otherClusterId].label,
      sharedRelativeCount: edge.sharedMemberIds.length,
    };
  });
  const activeNodeCount = CLUSTER_ORDER.filter((clusterId) => nodes[clusterId].total > 0).length;

  return (
    <div className="cluster-graph-layout">
      <article className="data-card cluster-graph-card">
        <div className="cluster-graph-header">
          <div>
            <p className="eyebrow">Cluster graph</p>
            <h3>See which condition families are strongest and where they overlap across the family history.</h3>
          </div>
          <div className="cluster-graph-meta">
            <span>{activeNodeCount} active clusters</span>
            <span>{edges.length} overlap links</span>
          </div>
        </div>

        <div className="cluster-network-canvas">
          <svg viewBox="0 0 1240 600" className="cluster-network-svg" role="img" aria-label="Condition cluster graph">
            <defs>
              <filter id="clusterGraphShadow">
                <feDropShadow dx="0" dy="10" stdDeviation="10" floodOpacity="0.12" />
              </filter>
            </defs>

            <g transform="translate(620 300)" filter="url(#clusterGraphShadow)">
              <circle r="72" className="cluster-network-hub" />
              <text y="-4" textAnchor="middle" className="cluster-network-hub-label">
                Family
              </text>
              <text y="24" textAnchor="middle" className="cluster-network-hub-subtext">
                condition map
              </text>
            </g>

            {CLUSTER_ORDER.filter((clusterId) => nodes[clusterId].total > 0).map((clusterId) => {
              const point = CLUSTER_GRAPH_POSITIONS[clusterId];
              return (
                <path
                  key={`hub-${clusterId}`}
                  d={`M 620 300 Q ${(620 + point.x) / 2} ${(300 + point.y) / 2} ${point.x} ${point.y}`}
                  className="cluster-network-link hub-link"
                  stroke={CLUSTERS[clusterId].color}
                />
              );
            })}

            {edges.map((edge) => {
              const left = CLUSTER_GRAPH_POSITIONS[edge.left];
              const right = CLUSTER_GRAPH_POSITIONS[edge.right];
              const midX = (left.x + right.x) / 2;
              const midY = (left.y + right.y) / 2;
              const curveX = midX + (midY < 300 ? 0 : 36);
              const curveY = midY < 300 ? midY - 70 : midY + 70;
              const emphasized = edge.left === selectedCluster || edge.right === selectedCluster;
              return (
                <path
                  key={edge.id}
                  d={`M ${left.x} ${left.y} Q ${curveX} ${curveY} ${right.x} ${right.y}`}
                  className={`cluster-network-link overlap-link ${emphasized ? 'emphasized' : ''}`}
                  stroke={CLUSTERS[emphasized ? selectedCluster : edge.left].color}
                  strokeWidth={1.6 + edge.weight * 1.1}
                />
              );
            })}

            {CLUSTER_ORDER.map((clusterId) => {
              const node = nodes[clusterId];
              const meta = CLUSTERS[clusterId];
              const point = CLUSTER_GRAPH_POSITIONS[clusterId];
              const selected = selectedCluster === clusterId;
              const inactive = node.total === 0;
              const width = 172 + Math.min(node.total, 6) * 10;
              const height = 74;

              return (
                <g
                  key={clusterId}
                  className={`cluster-network-node-group ${inactive ? 'inactive' : ''} ${selected ? 'selected' : ''}`}
                  transform={`translate(${point.x}, ${point.y})`}
                  onClick={() => setSelectedCluster(clusterId)}
                  filter="url(#clusterGraphShadow)"
                >
                  <rect
                    x={-width / 2}
                    y={-height / 2}
                    width={width}
                    height={height}
                    rx="28"
                    fill={selected ? meta.color : meta.accent}
                    stroke={selected ? meta.color : '#d8e2f0'}
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  <text y="-6" textAnchor="middle" className={`cluster-network-node-label ${selected ? 'selected' : ''}`}>
                    {meta.label}
                  </text>
                  <text y="20" textAnchor="middle" className={`cluster-network-node-subtext ${selected ? 'selected' : ''}`}>
                    {node.total} signal{node.total === 1 ? '' : 's'}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <p className="muted-copy">
          Click a cluster node to inspect relatives, overlap with other condition families, and the follow-up questions that still matter.
        </p>
      </article>

      <article className="data-card cluster-focus-card">
        <div className="cluster-card-top">
          <div>
            <div className="cluster-badge" style={{ background: selectedMeta.accent, color: selectedMeta.color }}>
              {selectedMeta.label}
            </div>
            <h3>{selectedMeta.description}</h3>
          </div>
          <div className="cluster-metrics">
            <span>{selectedNode.total} total signals</span>
            <span>{overlappingClusters.length} overlap links</span>
          </div>
        </div>

        <p className="muted-copy">{selectedMeta.whyItMatters}</p>

        <div className="knowledge-metric-row">
          <div className="knowledge-metric-box">
            <span>First-degree</span>
            <strong>{selectedNode.counts.first}</strong>
          </div>
          <div className="knowledge-metric-box">
            <span>Second-degree</span>
            <strong>{selectedNode.counts.second}</strong>
          </div>
          <div className="knowledge-metric-box">
            <span>Follow-ups</span>
            <strong>{selectedQuestions.length}</strong>
          </div>
        </div>

        <div className="cluster-focus-sections">
          <div className="cluster-focus-section">
            <p className="eyebrow">Relatives in this cluster</p>
            <div className="chip-row">
              {selectedNode.members.length === 0 ? (
                <span className="chip muted-chip">No reported relatives yet</span>
              ) : (
                selectedNode.members.map((member) => (
                  <span key={`${selectedCluster}-${member.id}`} className="chip">
                    {memberLabel(member)}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="cluster-focus-section">
            <p className="eyebrow">Co-occurring clusters</p>
            <div className="chip-row">
              {overlappingClusters.length === 0 ? (
                <span className="chip muted-chip">No cluster overlap detected yet</span>
              ) : (
                overlappingClusters.map((overlap) => (
                  <span key={`${selectedCluster}-${overlap.clusterId}`} className="chip">
                    {overlap.label} · {overlap.sharedRelativeCount}
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="cluster-focus-section">
            <p className="eyebrow">Reported conditions</p>
            <div className="chip-row">
              {selectedNode.conditions.length === 0 ? (
                <span className="chip muted-chip">No reported conditions yet</span>
              ) : (
                selectedNode.conditions.map((condition) => (
                  <span key={`${selectedCluster}-${condition}`} className="chip">
                    {condition}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="knowledge-detail-list">
          {selectedQuestions.length === 0 ? (
            <p className="muted-copy">No immediate follow-up prompts in this cluster right now.</p>
          ) : (
            selectedQuestions.slice(0, 3).map((question) => (
              <div key={question.id} className="knowledge-detail-item">
                <strong>{question.prompt}</strong>
                <span>{question.reason}</span>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="data-card">
        <p className="eyebrow">Cluster heatmap</p>
        <div className="heatmap-table">
          <div className="heatmap-row heatmap-head">
            <span className="heatmap-cell heatmap-cell-label">Cluster</span>
            <span className="heatmap-cell heatmap-cell-value">First-degree</span>
            <span className="heatmap-cell heatmap-cell-value">Second-degree</span>
          </div>
          {CLUSTER_ORDER.map((clusterId) => {
            const cluster = CLUSTERS[clusterId];
            const counts = artifact.clusterCounts[clusterId];
            return (
              <div key={clusterId} className="heatmap-row">
                <span className="heatmap-cell heatmap-cell-label heatmap-cluster-label">
                  <i style={{ background: cluster.color }} />
                  {cluster.label}
                </span>
                <span className="heatmap-cell heatmap-cell-value">{counts.first}</span>
                <span className="heatmap-cell heatmap-cell-value">{counts.second}</span>
              </div>
            );
          })}
        </div>
      </article>
    </div>
  );
}

export function ClusterKnowledgeWorkbench({ artifact }: { artifact: SummaryArtifact }) {
  const preferredCluster = useMemo(() => {
    const withSignals = CLUSTER_ORDER.find((clusterId) => {
      const counts = artifact.clusterCounts[clusterId];
      return counts.first + counts.second > 0;
    });
    return withSignals ?? CLUSTER_ORDER[0];
  }, [artifact]);

  const [selectedCluster, setSelectedCluster] = useState<ClusterId>(preferredCluster);

  useEffect(() => {
    const counts = artifact.clusterCounts[selectedCluster];
    if (counts.first + counts.second === 0) {
      setSelectedCluster(preferredCluster);
    }
  }, [artifact, preferredCluster, selectedCluster]);

  const selectedMeta = CLUSTERS[selectedCluster];
  const selectedCounts = artifact.clusterCounts[selectedCluster];
  const selectedQuestions = artifact.missingQuestions.filter((question) => question.cluster === selectedCluster);
  const totalSignals = selectedCounts.first + selectedCounts.second;

  return (
    <div className="knowledge-workbench">
      <div className="knowledge-canvas">
        <svg viewBox="0 0 640 360" className="knowledge-workbench-svg" role="img" aria-label="Interactive cluster knowledge graph">
          <defs>
            <filter id="knowledgeGlow">
              <feDropShadow dx="0" dy="8" stdDeviation="8" floodOpacity="0.14" />
            </filter>
          </defs>
          <g transform="translate(165 180)" filter="url(#knowledgeGlow)">
            <circle r="46" className="knowledge-hub" />
            <text y="-3" textAnchor="middle" className="knowledge-hub-label">
              Family
            </text>
            <text y="16" textAnchor="middle" className="knowledge-hub-subtext">
              context
            </text>
          </g>

          {CLUSTER_ORDER.map((clusterId, index) => {
            const cluster = CLUSTERS[clusterId];
            const counts = artifact.clusterCounts[clusterId];
            const total = counts.first + counts.second;
            const row = index % 3;
            const column = index < 3 ? 0 : 1;
            const x = column === 0 ? 380 : 520;
            const y = 92 + row * 88;
            const selected = selectedCluster === clusterId;
            const dimmed = selectedCluster !== clusterId && total === 0;
            const opacity = dimmed ? 0.36 : 1;

            return (
              <g key={clusterId} opacity={opacity}>
                <path
                  d={`M 211 180 C 282 180, 298 ${y}, ${x - 66} ${y}`}
                  className={`knowledge-edge ${selected ? 'selected' : ''}`}
                  stroke={cluster.color}
                />
                <g className="knowledge-node-group" onClick={() => setSelectedCluster(clusterId)} filter="url(#knowledgeGlow)">
                  <rect
                    x={x - 66}
                    y={y - 28}
                    width="132"
                    height="56"
                    rx="22"
                    fill={selected ? cluster.color : cluster.accent}
                    stroke={selected ? cluster.color : '#d8e2f0'}
                    strokeWidth={selected ? 2.8 : 1.4}
                  />
                  <text x={x} y={y - 4} textAnchor="middle" className={`knowledge-node-label ${selected ? 'selected' : ''}`}>
                    {cluster.label}
                  </text>
                  <text x={x} y={y + 18} textAnchor="middle" className={`knowledge-node-subtext ${selected ? 'selected' : ''}`}>
                    {total} signal{total === 1 ? '' : 's'}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="knowledge-detail-panel">
        <div className="cluster-badge" style={{ background: selectedMeta.accent, color: selectedMeta.color }}>
          {selectedMeta.label}
        </div>
        <h4>{selectedMeta.description}</h4>
        <p>{selectedMeta.whyItMatters}</p>
        <div className="knowledge-metric-row">
          <div className="knowledge-metric-box">
            <span>First-degree</span>
            <strong>{selectedCounts.first}</strong>
          </div>
          <div className="knowledge-metric-box">
            <span>Second-degree</span>
            <strong>{selectedCounts.second}</strong>
          </div>
          <div className="knowledge-metric-box">
            <span>Follow-ups</span>
            <strong>{selectedQuestions.length}</strong>
          </div>
        </div>
        <div className="knowledge-detail-list">
          {selectedQuestions.length === 0 ? (
            <p className="muted-copy">No immediate follow-up prompts in this cluster right now.</p>
          ) : (
            selectedQuestions.slice(0, 2).map((question) => (
              <div key={question.id} className="knowledge-detail-item">
                <strong>{question.prompt}</strong>
                <span>{question.reason}</span>
              </div>
            ))
          )}
        </div>
        <div className="knowledge-mini-legend">
          <span>{totalSignals > 0 ? 'Click another cluster node to inspect it.' : 'This cluster has no current signals.'}</span>
        </div>
      </div>
    </div>
  );
}
