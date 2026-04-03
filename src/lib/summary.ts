import { CLUSTERS, CLUSTER_ORDER, CONDITIONS_BY_ID, type ClusterId, type ConditionId } from './taxonomy';
import {
  factNeedsFollowup,
  getCompletePersonalContextItems,
  getFact,
  getTrackedMembers,
  personalContextItemNeedsFollowup,
  type FamilyHistoryProfile,
  type FamilyMember,
} from './profile';

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
  documentedFactCount: number;
  readyToShareFactCount: number;
  needsFollowupFactCount: number;
  patientContextCounts: {
    medications: number;
    allergies: number;
    chronicConditions: number;
    total: number;
  };
  patientContextNotes: string[];
  missingQuestions: MissingQuestion[];
  doctorVisitNotes: string[];
  incompletenessNotes: string[];
  reviewabilityNotes: string[];
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

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function buildSummaryArtifact(profile: FamilyHistoryProfile): SummaryArtifact {
  const members = getTrackedMembers(profile);
  const firstDegreeMembers = members.filter((member) => member.degree === 'first');
  const secondDegreeMembers = members.filter((member) => member.degree === 'second');
  const trackedMemberIds = new Set(members.map((member) => member.id));
  const medications = getCompletePersonalContextItems(profile.personal.medications);
  const allergies = getCompletePersonalContextItems(profile.personal.allergies);
  const chronicConditions = getCompletePersonalContextItems(profile.personal.chronicConditions);
  const patientMemoryItems = [...medications, ...allergies, ...chronicConditions];
  const documentedFacts = profile.facts.filter(
    (fact) => fact.status !== 'unanswered' && trackedMemberIds.has(fact.memberId),
  );
  const readyToShareFacts = documentedFacts.filter((fact) => !factNeedsFollowup(fact));
  const needsFollowupFacts = documentedFacts.filter((fact) => factNeedsFollowup(fact));
  const readyToShareMemoryItems = patientMemoryItems.filter((item) => !personalContextItemNeedsFollowup(item));
  const needsFollowupMemoryItems = patientMemoryItems.filter((item) => personalContextItemNeedsFollowup(item));
  const documentedContextCount = documentedFacts.length + patientMemoryItems.length;
  const readyContextCount = readyToShareFacts.length + readyToShareMemoryItems.length;
  const needsFollowupCount = needsFollowupFacts.length + needsFollowupMemoryItems.length;

  const firstDegreeFlags = new Set<ConditionId>();
  const secondDegreeFlags = new Set<ConditionId>();
  const missingQuestions: MissingQuestion[] = [];
  const keyPatterns: string[] = [];
  const doctorVisitNotes: string[] = [];
  const incompletenessNotes: string[] = [];
  const reviewabilityNotes: string[] = [];
  const patientContextNotes: string[] = [];
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

  const patientContextCountParts: string[] = [];
  if (medications.length > 0) {
    patientContextCountParts.push(`${medications.length} ${pluralize(medications.length, 'medication')}`);
  }
  if (allergies.length > 0) {
    patientContextCountParts.push(`${allergies.length} ${pluralize(allergies.length, 'allergy', 'allergies')}`);
  }
  if (chronicConditions.length > 0) {
    patientContextCountParts.push(`${chronicConditions.length} ${pluralize(chronicConditions.length, 'chronic condition')}`);
  }

  if (patientContextCountParts.length > 0) {
    patientContextNotes.push(`Patient memory also includes ${joinLabels(patientContextCountParts)}.`);
  }
  if (medications.length > 0) {
    patientContextNotes.push(`Current medications: ${joinLabels(medications.map((item) => item.label))}.`);
  }
  if (allergies.length > 0) {
    patientContextNotes.push(`Reported allergies include ${joinLabels(allergies.map((item) => item.label.toLowerCase()))}.`);
  }
  if (chronicConditions.length > 0) {
    patientContextNotes.push(`Chronic conditions tracked: ${joinLabels(chronicConditions.map((item) => item.label.toLowerCase()))}.`);
  }
  if (profile.personal.visitGoal?.trim()) {
    patientContextNotes.push(`Visit goal: ${profile.personal.visitGoal.trim()}`);
  }
  if (profile.personal.preferredLanguage?.trim() || profile.personal.pronouns?.trim() || profile.personal.preferredPharmacy?.trim()) {
    const preferenceParts = [
      profile.personal.preferredLanguage?.trim() ? `language ${profile.personal.preferredLanguage.trim()}` : null,
      profile.personal.pronouns?.trim() ? `pronouns ${profile.personal.pronouns.trim()}` : null,
      profile.personal.preferredPharmacy?.trim() ? `pharmacy ${profile.personal.preferredPharmacy.trim()}` : null,
    ].filter(Boolean) as string[];
    if (preferenceParts.length > 0) {
      patientContextNotes.push(`Care preferences documented: ${joinLabels(preferenceParts)}.`);
    }
  }

  if (patientMemoryItems.length === 0) {
    incompletenessNotes.push('No current medications, allergies, or chronic conditions are recorded yet.');
  }

  if (documentedContextCount === 0) {
    reviewabilityNotes.push('No documented context items are marked ready to share yet.');
  } else if (needsFollowupCount === 0) {
    reviewabilityNotes.push(`All ${documentedContextCount} documented ${pluralize(documentedContextCount, 'context item')} are marked ready to share.`);
  } else {
    reviewabilityNotes.push(
      `${needsFollowupCount} documented ${pluralize(needsFollowupCount, 'context item')} still need source or confidence follow-up before reuse.`,
    );
    if (readyContextCount > 0) {
      reviewabilityNotes.push(
        `${readyContextCount} ${pluralize(readyContextCount, 'context item')} already look ready to share in a clinician handoff.`,
      );
    }
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
  if (patientMemoryItems.length > 0) {
    doctorVisitNotes.push('Use the patient memory layer for current medications, allergies, and chronic conditions during intake.');
  }
  if (profile.personal.visitGoal?.trim()) {
    doctorVisitNotes.push(`Lead with the patient goal: ${profile.personal.visitGoal.trim()}`);
  }
  if (profile.personal.preferredPharmacy?.trim()) {
    doctorVisitNotes.push(`Preferred pharmacy is ${profile.personal.preferredPharmacy.trim()}.`);
  }
  if (needsFollowupCount > 0) {
    doctorVisitNotes.push('Mention which context items are approximate, family-reported, or still need confirmation.');
  }
  if (doctorVisitNotes.length === 0) {
    doctorVisitNotes.push('Bring this summary to future visits as a starting point, then keep adding details over time.');
  }

  const plainLanguageSummary = [
    keyPatterns[0],
    patientContextNotes[0] ?? keyPatterns[1],
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
    documentedFactCount: documentedContextCount,
    readyToShareFactCount: readyContextCount,
    needsFollowupFactCount: needsFollowupCount,
    patientContextCounts: {
      medications: medications.length,
      allergies: allergies.length,
      chronicConditions: chronicConditions.length,
      total: patientMemoryItems.length,
    },
    patientContextNotes,
    missingQuestions: missingQuestions.slice(0, 8),
    doctorVisitNotes,
    incompletenessNotes,
    reviewabilityNotes,
  };
}

export function buildDoctorNote(profile: FamilyHistoryProfile, artifact: SummaryArtifact): string {
  const name = profile.personal.nameOrLabel?.trim() || 'Patient';
  return `${name} health context summary: ${artifact.plainLanguageSummary} ${artifact.doctorVisitNotes.join(' ')}`.trim();
}
