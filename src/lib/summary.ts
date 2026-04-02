import { CLUSTERS, CLUSTER_ORDER, CONDITIONS_BY_ID, type ClusterId, type ConditionId } from './taxonomy';
import { getFact, getTrackedMembers, type FamilyHistoryProfile, type FamilyMember } from './profile';

export interface MissingQuestion {
  id: string;
  prompt: string;
  reason: string;
  priority: 'high' | 'medium';
  cluster: ClusterId;
}

export interface SummaryArtifact {
  plainLanguageSummary: string;
  firstDegreeFlags: ConditionId[];
  secondDegreeFlags: ConditionId[];
  keyPatterns: string[];
  clusterCounts: Record<ClusterId, { first: number; second: number }>;
  missingQuestions: MissingQuestion[];
  doctorVisitNotes: string[];
  incompletenessNotes: string[];
}

function joinLabels(labels: string[]): string {
  if (labels.length === 0) {
    return '';
  }

  if (labels.length === 1) {
    return labels[0];
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function memberName(member: FamilyMember): string {
  return member.nameOptional?.trim() || member.displayLabel;
}

export function buildSummaryArtifact(profile: FamilyHistoryProfile): SummaryArtifact {
  const members = getTrackedMembers(profile);
  const firstDegreeMembers = members.filter((member) => member.degree === 'first');
  const secondDegreeMembers = members.filter((member) => member.degree === 'second');

  const firstDegreeFlags = new Set<ConditionId>();
  const secondDegreeFlags = new Set<ConditionId>();
  const missingQuestions: MissingQuestion[] = [];
  const keyPatterns: string[] = [];
  const doctorVisitNotes: string[] = [];
  const incompletenessNotes: string[] = [];
  const clusterCounts = Object.fromEntries(
    CLUSTER_ORDER.map((cluster) => [cluster, { first: 0, second: 0 }]),
  ) as Record<ClusterId, { first: number; second: number }>;

  const repeatedClusterTracker = new Map<ClusterId, Set<string>>();

  for (const member of members) {
    for (const conditionId of Object.keys(CONDITIONS_BY_ID) as ConditionId[]) {
      const fact = getFact(profile, member.id, conditionId);
      if (!fact || fact.status !== 'present') {
        continue;
      }

      const condition = CONDITIONS_BY_ID[conditionId];
      if (member.degree === 'first') {
        firstDegreeFlags.add(conditionId);
        clusterCounts[condition.cluster].first += 1;
      }
      if (member.degree === 'second') {
        secondDegreeFlags.add(conditionId);
        clusterCounts[condition.cluster].second += 1;
      }

      if (!repeatedClusterTracker.has(condition.cluster)) {
        repeatedClusterTracker.set(condition.cluster, new Set());
      }
      repeatedClusterTracker.get(condition.cluster)!.add(member.id);

      if (condition.askAgeAtDiagnosis && !fact.ageAtOnset?.trim()) {
        missingQuestions.push({
          id: `age-${member.id}-${conditionId}`,
          prompt: `If you can, ask when ${memberName(member)} was diagnosed with ${condition.label.toLowerCase()}.`,
          reason: 'Age at diagnosis often makes family history much more useful in later care conversations.',
          priority: 'high',
          cluster: condition.cluster,
        });
      }
    }
  }

  for (const [clusterId, relatedMembers] of repeatedClusterTracker.entries()) {
    if (relatedMembers.size >= 2) {
      keyPatterns.push(`Multiple ${CLUSTERS[clusterId].label.toLowerCase()} conditions are reported across your family graph.`);
    }
  }

  const firstLabels = [...firstDegreeFlags].map((conditionId) => CONDITIONS_BY_ID[conditionId].label);
  const secondLabels = [...secondDegreeFlags].map((conditionId) => CONDITIONS_BY_ID[conditionId].label);

  if (firstLabels.length > 0) {
    keyPatterns.unshift(`First-degree history includes ${joinLabels(firstLabels.map((label) => label.toLowerCase()))}.`);
  }
  if (secondLabels.length > 0) {
    keyPatterns.push(`Second-degree history includes ${joinLabels(secondLabels.map((label) => label.toLowerCase()))}.`);
  }

  for (const clusterId of CLUSTER_ORDER) {
    const cluster = CLUSTERS[clusterId];
    const firstDegreeUnknownCount = firstDegreeMembers.filter((member) => {
      const relatedConditionIds = (Object.keys(CONDITIONS_BY_ID) as ConditionId[]).filter(
        (conditionId) => CONDITIONS_BY_ID[conditionId].cluster === clusterId,
      );
      return relatedConditionIds.every((conditionId) => {
        const fact = getFact(profile, member.id, conditionId);
        return !fact || fact.status === 'unknown' || fact.status === 'unanswered';
      });
    }).length;

    if (firstDegreeUnknownCount >= 2 && clusterCounts[clusterId].first === 0) {
      missingQuestions.push({
        id: `cluster-${clusterId}`,
        prompt: `Ask whether anyone in your close family has a history of ${cluster.label.toLowerCase()} conditions.`,
        reason: cluster.whyItMatters,
        priority: 'medium',
        cluster: clusterId,
      });
    }
  }

  if (members.length === 0) {
    incompletenessNotes.push('You have not added any family members yet. Start with parents or siblings to make the summary more useful.');
  }

  if (members.length > 0 && firstDegreeMembers.length === 0) {
    incompletenessNotes.push('No first-degree relatives are currently included. Adding parents or siblings usually creates the strongest starting context.');
  }

  const cancerDetailsMissing = missingQuestions.filter((question) => question.cluster === 'cancer').length;
  if (cancerDetailsMissing > 0) {
    incompletenessNotes.push('Cancer history is present, but some age-at-diagnosis details are still missing.');
  }

  if (keyPatterns.length === 0) {
    keyPatterns.push('This profile is still early. What you have entered so far is enough to start a clearer family history record.');
  }

  if (firstLabels.length > 0) {
    doctorVisitNotes.push(`Mention first-degree family history of ${joinLabels(firstLabels.map((label) => label.toLowerCase()))}.`);
  }
  if (secondLabels.length > 0) {
    doctorVisitNotes.push(`Mention second-degree family history of ${joinLabels(secondLabels.map((label) => label.toLowerCase()))}.`);
  }
  if (missingQuestions.length > 0) {
    doctorVisitNotes.push('Bring up that some family-history details are still incomplete, especially age at diagnosis where it is known to matter.');
  }
  if (doctorVisitNotes.length === 0) {
    doctorVisitNotes.push('Bring this summary to future visits as a starting point, then keep adding details over time.');
  }

  const plainLanguageSummary = [
    keyPatterns[0],
    keyPatterns[1],
    incompletenessNotes[0],
  ]
    .filter(Boolean)
    .join(' ');

  return {
    plainLanguageSummary,
    firstDegreeFlags: [...firstDegreeFlags],
    secondDegreeFlags: [...secondDegreeFlags],
    keyPatterns,
    clusterCounts,
    missingQuestions: missingQuestions.slice(0, 8),
    doctorVisitNotes,
    incompletenessNotes,
  };
}

export function buildDoctorNote(profile: FamilyHistoryProfile, artifact: SummaryArtifact): string {
  const name = profile.personal.nameOrLabel?.trim() || 'Patient';
  return `${name} family history summary: ${artifact.plainLanguageSummary} ${artifact.doctorVisitNotes.join(' ')}`.trim();
}
