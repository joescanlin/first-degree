import {
  factNeedsFollowup,
  formatFactConfidenceLabel,
  formatPersonalContextKindLabel,
  formatFactSourceLabel,
  getCompletePersonalContextItems,
  getTrackedMembers,
  personalContextItemNeedsFollowup,
  type FamilyHistoryFact,
  type FamilyHistoryProfile,
  type FamilyMember,
  type PersonalContextItem,
} from './profile';
import { CLUSTERS, CLUSTER_ORDER, CONDITIONS_BY_ID, type ClusterId } from './taxonomy';
import { type SummaryArtifact } from './summary';

type HandoffContextType =
  | 'profile_brief'
  | 'family_history_flag'
  | 'family_history_pattern'
  | 'family_history_open_question'
  | 'patient_memory_item'
  | 'care_preference'
  | 'recent_change';
type HandoffStatus = 'patient_reported' | 'needs_followup';
type HandoffCategory = 'family_history' | 'patient_context';
export type HandoffDomain = 'family_history' | PersonalContextItem['kind'] | 'care_preference';
export type VisitMode = 'general_intake' | 'preventive' | 'acute_symptom' | 'medication_follow_up' | 'chronic_follow_up';

export const VISIT_MODE_OPTIONS: Array<{ value: VisitMode; label: string; description: string }> = [
  {
    value: 'general_intake',
    label: 'General intake',
    description: 'Balanced context for a broad new-patient or PCP intake.',
  },
  {
    value: 'preventive',
    label: 'Preventive visit',
    description: 'Prioritize screening context, family patterns, and durable baseline history.',
  },
  {
    value: 'acute_symptom',
    label: 'Acute symptom visit',
    description: 'Prioritize medications, allergies, chronic conditions, and any family context that changes triage framing.',
  },
  {
    value: 'medication_follow_up',
    label: 'Medication follow-up',
    description: 'Prioritize active medications, allergies, pharmacy details, and visit goals.',
  },
  {
    value: 'chronic_follow_up',
    label: 'Chronic follow-up',
    description: 'Prioritize chronic conditions, medication context, and the most relevant family patterns.',
  },
];

export interface MedCanonClinicalContextEntry {
  type: HandoffContextType;
  value: string;
  label?: string;
  origin: 'first_degree_context';
  source_id: string | null;
  recorded_at: string;
  review_required: boolean;
  status: HandoffStatus;
  category: HandoffCategory;
  tags: string[];
}

export interface HandoffFamilySignal {
  id: string;
  relative: string;
  degree: 'first-degree' | 'second-degree';
  branch: FamilyMember['branch'];
  cluster_id: ClusterId;
  condition: string;
  cluster: string;
  handoff_line: string;
  source: FamilyHistoryFact['source'];
  confidence: FamilyHistoryFact['confidence'];
  review_status: FamilyHistoryFact['reviewStatus'];
  review_required: boolean;
  last_updated_at: string;
  relevance_score: number;
  relevance_reason: string;
}

export interface HandoffOpenQuestion {
  id: string;
  prompt: string;
  reason: string;
  priority: 'high' | 'medium';
  cluster: ClusterId;
  relevance_score: number;
  relevance_reason: string;
}

export interface HandoffPatientContextItem {
  id: string;
  kind: PersonalContextItem['kind'];
  label: string;
  detail: string;
  handoff_line: string;
  source: PersonalContextItem['source'];
  confidence: PersonalContextItem['confidence'];
  review_status: PersonalContextItem['reviewStatus'];
  review_required: boolean;
  last_updated_at: string;
  relevance_score: number;
  relevance_reason: string;
}

export interface HandoffDurableFact {
  id: string;
  domain: HandoffDomain;
  label: string;
  value: string;
  source: FamilyHistoryFact['source'];
  confidence: FamilyHistoryFact['confidence'];
  review_status: FamilyHistoryFact['reviewStatus'];
  review_required: boolean;
  recorded_at: string;
  tags: string[];
  relevance_score: number;
  relevance_reason: string;
}

export interface HandoffRecentChange {
  id: string;
  domain: HandoffDomain;
  label: string;
  changed_at: string;
  summary: string;
  review_required: boolean;
  relevance_score: number;
}

export interface VisitFocus {
  mode: VisitMode;
  label: string;
  description: string;
  summary: string;
  priority_labels: string[];
}

export interface MockEncounterScenario {
  id: string;
  title: string;
  patient_prompt: string;
  why_context_matters: string;
  medcanon_goal: string;
}

export interface MedCanonHandoffPackage {
  package_version: 'first_degree_context_handoff_v2';
  generated_at: string;
  package_purpose: string;
  patient: {
    display_name: string;
    age_range: string;
    sex: FamilyHistoryProfile['personal']['sex'];
    reason_for_starting: string;
  };
  visit_focus: VisitFocus;
  family_snapshot: {
    tracked_relative_count: number;
    first_degree_relative_count: number;
    second_degree_relative_count: number;
    first_degree_flag_count: number;
    second_degree_flag_count: number;
    durable_fact_count: number;
    ready_to_share_fact_count: number;
    needs_followup_fact_count: number;
    recent_change_count: number;
    notable_clusters: string[];
  };
  profile_brief: string;
  durable_facts: HandoffDurableFact[];
  family_history_flags: HandoffFamilySignal[];
  pattern_summaries: string[];
  open_questions: HandoffOpenQuestion[];
  recent_changes: HandoffRecentChange[];
  visit_scenarios: MockEncounterScenario[];
  guardrails: string[];
  clinical_context: MedCanonClinicalContextEntry[];
}

interface ResolvedSignal {
  fact: FamilyHistoryFact;
  member: FamilyMember;
  clusterId: ClusterId;
  clusterWeight: number;
}

interface ScenarioTemplate {
  title: string;
  patient_prompt: string;
  why_context_matters: string;
  medcanon_goal: string;
}

const SCENARIO_TEMPLATES: Record<ClusterId, ScenarioTemplate> = {
  cardiovascular: {
    title: 'Same-day symptom intake',
    patient_prompt: 'I have chest pressure and get short of breath walking upstairs.',
    why_context_matters:
      'Acute triage should still focus on the current symptoms, but the clinician handoff should carry the strong cardiovascular family pattern forward.',
    medcanon_goal:
      'Expose first-degree cardiovascular history as clinician context without pretending family history explains the current complaint.',
  },
  metabolic: {
    title: 'New PCP onboarding',
    patient_prompt: 'I am establishing care and want my family history reflected before my intake visit.',
    why_context_matters:
      'Family metabolic history is useful preventive context and helps the clinician ask more focused follow-up questions.',
    medcanon_goal:
      'Surface diabetes and broader metabolic patterns as background context for preventive planning.',
  },
  cancer: {
    title: 'Preventive telehealth follow-up',
    patient_prompt: 'I want to know what family cancer history I should mention before my annual visit.',
    why_context_matters:
      'Cancer type and age at diagnosis can materially improve the clinician handoff and what gets asked next.',
    medcanon_goal:
      'Highlight the strongest cancer lineage details while keeping unknown ages explicit.',
  },
  autoimmune: {
    title: 'Chronic symptom revisit',
    patient_prompt: 'My symptoms have been on and off for months and I am trying to explain the family context clearly.',
    why_context_matters:
      'Autoimmune family history often matters as background context when the visit is about unclear or recurrent symptoms.',
    medcanon_goal:
      'Carry autoimmune family history into reviewable context rather than burying it in free text.',
  },
  neurologic: {
    title: 'Memory concern conversation',
    patient_prompt: 'I am worried about some memory changes and want to mention what runs in my family.',
    why_context_matters:
      'Neurologic family history can influence how a clinician frames follow-up and preventive discussion.',
    medcanon_goal:
      'Keep neurologic family history visible, compact, and reviewable during clinician handoff.',
  },
  mental_health: {
    title: 'Mood and medication check-in',
    patient_prompt: 'I am following up on anxiety and want the clinician to have the right family background.',
    why_context_matters:
      'Mental-health family history is often under-documented, so a concise handoff can make it easier to discuss appropriately.',
    medcanon_goal:
      'Preserve family mental-health context without turning it into a diagnostic claim.',
  },
};

const VISIT_MODE_CONFIG: Record<VisitMode, { label: string; description: string; priority_labels: string[] }> = Object.fromEntries(
  VISIT_MODE_OPTIONS.map((option) => [
    option.value,
    {
      label: option.label,
      description: option.description,
      priority_labels:
        option.value === 'preventive'
          ? ['Family screening context', 'Durable baseline history', 'Visit goals']
          : option.value === 'acute_symptom'
            ? ['Medications and allergies', 'Chronic conditions', 'Relevant family patterns']
            : option.value === 'medication_follow_up'
              ? ['Active medications', 'Allergy checks', 'Preferred pharmacy']
              : option.value === 'chronic_follow_up'
                ? ['Chronic conditions', 'Medication context', 'Related family history']
                : ['Broad intake context', 'Current patient memory', 'Family background'],
    },
  ]),
) as Record<VisitMode, { label: string; description: string; priority_labels: string[] }>;

const FAMILY_CLUSTER_MODE_SCORES: Record<VisitMode, Record<ClusterId, number>> = {
  general_intake: {
    cardiovascular: 84,
    metabolic: 76,
    cancer: 80,
    autoimmune: 70,
    neurologic: 72,
    mental_health: 68,
  },
  preventive: {
    cardiovascular: 96,
    metabolic: 88,
    cancer: 98,
    autoimmune: 70,
    neurologic: 66,
    mental_health: 60,
  },
  acute_symptom: {
    cardiovascular: 96,
    metabolic: 70,
    cancer: 44,
    autoimmune: 78,
    neurologic: 90,
    mental_health: 58,
  },
  medication_follow_up: {
    cardiovascular: 54,
    metabolic: 60,
    cancer: 36,
    autoimmune: 52,
    neurologic: 48,
    mental_health: 64,
  },
  chronic_follow_up: {
    cardiovascular: 82,
    metabolic: 86,
    cancer: 50,
    autoimmune: 84,
    neurologic: 80,
    mental_health: 72,
  },
};

const PERSONAL_CONTEXT_MODE_SCORES: Record<VisitMode, Record<Exclude<HandoffDomain, 'family_history'>, number>> = {
  general_intake: {
    medication: 90,
    allergy: 88,
    condition: 92,
    care_preference: 78,
  },
  preventive: {
    medication: 66,
    allergy: 60,
    condition: 82,
    care_preference: 74,
  },
  acute_symptom: {
    medication: 98,
    allergy: 96,
    condition: 92,
    care_preference: 72,
  },
  medication_follow_up: {
    medication: 99,
    allergy: 86,
    condition: 82,
    care_preference: 90,
  },
  chronic_follow_up: {
    medication: 92,
    allergy: 76,
    condition: 98,
    care_preference: 82,
  },
};

function joinLabels(labels: string[]): string {
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels.at(-1)}`;
}

function displayMemberName(member: FamilyMember): string {
  return member.nameOptional?.trim() || member.displayLabel;
}

function degreeLabel(member: FamilyMember): 'first-degree' | 'second-degree' {
  return member.degree === 'first' ? 'first-degree' : 'second-degree';
}

function conditionLine(member: FamilyMember, fact: FamilyHistoryFact): string {
  const condition = CONDITIONS_BY_ID[fact.conditionId];
  const relative = displayMemberName(member);
  const ageLine = fact.ageAtOnset?.trim() ? ` diagnosed at ${fact.ageAtOnset.trim()}` : '';
  const sourceLine = `Source: ${formatFactSourceLabel(fact.source)}.`;
  const confidenceLine = `Confidence: ${formatFactConfidenceLabel(fact.confidence)}.`;
  const followupLine = factNeedsFollowup(fact) ? ' This detail still needs follow-up before reuse.' : '';
  return `${relative} with ${condition.label.toLowerCase()}${ageLine}. ${sourceLine} ${confidenceLine}${followupLine}`.replace(/\s+/g, ' ').trim();
}

function personalContextLine(item: PersonalContextItem): string {
  const kindLabel = formatPersonalContextKindLabel(item.kind);
  const detailLine = item.detail?.trim() ? ` ${item.detail.trim()}.` : '';
  const sourceLine = ` Source: ${formatFactSourceLabel(item.source)}.`;
  const confidenceLine = ` Confidence: ${formatFactConfidenceLabel(item.confidence)}.`;
  const followupLine = personalContextItemNeedsFollowup(item) ? ' This detail still needs follow-up before reuse.' : '';
  return `${kindLabel}: ${item.label.trim()}.${detailLine}${sourceLine}${confidenceLine}${followupLine}`.replace(/\s+/g, ' ').trim();
}

function compactFamilyFactLabel(signal: HandoffFamilySignal): string {
  return `${signal.relative} · ${signal.condition}`;
}

function patientContextLabel(item: HandoffPatientContextItem): string {
  return `${formatPersonalContextKindLabel(item.kind)} · ${item.label}`;
}

function scoreFamilySignalForVisit(signal: HandoffFamilySignal, visitMode: VisitMode): { score: number; reason: string } {
  let score = FAMILY_CLUSTER_MODE_SCORES[visitMode][signal.cluster_id];
  if (signal.degree === 'first-degree') {
    score += 8;
  }
  if (signal.handoff_line.includes('diagnosed at')) {
    score += 3;
  }
  if (!signal.review_required) {
    score += 2;
  }

  const reason =
    visitMode === 'preventive'
      ? `${signal.cluster} family history is high-yield preventive context.`
      : visitMode === 'acute_symptom'
        ? `${signal.cluster} family history can change acute triage framing and follow-up questions.`
        : visitMode === 'medication_follow_up'
          ? `${signal.cluster} family history is secondary background context during medication follow-up.`
          : visitMode === 'chronic_follow_up'
            ? `${signal.cluster} family history can shape chronic-condition review and management framing.`
            : `${signal.cluster} family history belongs in a broad intake context package.`;

  return { score, reason };
}

function scorePatientContextForVisit(
  domain: Exclude<HandoffDomain, 'family_history'>,
  label: string,
  visitMode: VisitMode,
): { score: number; reason: string } {
  let score = PERSONAL_CONTEXT_MODE_SCORES[visitMode][domain];
  const normalized = label.toLowerCase();

  if (domain === 'care_preference') {
    if (normalized.includes('visit goal')) {
      score += 10;
    }
    if (normalized.includes('preferred pharmacy') && visitMode === 'medication_follow_up') {
      score += 8;
    }
    if ((normalized.includes('preferred language') || normalized.includes('pronouns')) && visitMode === 'general_intake') {
      score += 6;
    }
  }

  const reason =
    domain === 'medication'
      ? visitMode === 'preventive'
        ? 'Current medications still matter in preventive visits, but they are not the primary focus.'
        : 'Current medications are part of the first context a clinician should see for this visit type.'
      : domain === 'allergy'
        ? 'Allergy context should stay visible because it can change care and prescribing decisions quickly.'
      : domain === 'condition'
        ? 'Chronic condition context should remain visible for this visit type.'
      : 'Care preferences change how this visit is framed and carried through MedCanon.';

  return { score, reason };
}

function scoreOpenQuestionForVisit(question: HandoffOpenQuestion, visitMode: VisitMode): { score: number; reason: string } {
  const clusterScore = FAMILY_CLUSTER_MODE_SCORES[visitMode][question.cluster];
  return {
    score: clusterScore + (question.priority === 'high' ? 8 : 0),
    reason:
      visitMode === 'preventive'
        ? 'This missing detail is useful because preventive handoffs rely on family pattern specificity.'
        : visitMode === 'acute_symptom'
          ? 'This missing detail is kept only when it could still sharpen clinical follow-up.'
          : 'This missing detail remains useful context for clinician review.',
  };
}

function clusterWeight(artifact: SummaryArtifact, clusterId: ClusterId): number {
  const counts = artifact.clusterCounts[clusterId];
  return counts.first * 3 + counts.second * 2;
}

function buildResolvedSignals(profile: FamilyHistoryProfile, artifact: SummaryArtifact): ResolvedSignal[] {
  const trackedMembers = getTrackedMembers(profile);
  const membersById = new Map(trackedMembers.map((member) => [member.id, member]));

  return profile.facts
    .filter((fact) => fact.status === 'present' && membersById.has(fact.memberId))
    .map((fact) => {
      const member = membersById.get(fact.memberId)!;
      const condition = CONDITIONS_BY_ID[fact.conditionId];
      return {
        fact,
        member,
        clusterId: condition.cluster,
        clusterWeight: clusterWeight(artifact, condition.cluster),
      };
    })
    .sort((left, right) => {
      const leftDegree = left.member.degree === 'first' ? 2 : 1;
      const rightDegree = right.member.degree === 'first' ? 2 : 1;
      if (rightDegree !== leftDegree) return rightDegree - leftDegree;
      if (right.clusterWeight !== left.clusterWeight) return right.clusterWeight - left.clusterWeight;
      const leftHasAge = left.fact.ageAtOnset?.trim() ? 1 : 0;
      const rightHasAge = right.fact.ageAtOnset?.trim() ? 1 : 0;
      if (rightHasAge !== leftHasAge) return rightHasAge - leftHasAge;
      return CONDITIONS_BY_ID[left.fact.conditionId].label.localeCompare(CONDITIONS_BY_ID[right.fact.conditionId].label);
    });
}

function buildClinicianBrief(
  profile: FamilyHistoryProfile,
  artifact: SummaryArtifact,
  prominentClusters: string[],
  signals: HandoffFamilySignal[],
  patientMemory: HandoffPatientContextItem[],
  durableFacts: HandoffDurableFact[],
  openQuestions: HandoffOpenQuestion[],
): string {
  const patientName = profile.personal.nameOrLabel?.trim() || 'Patient';
  const firstDegreeLabels = artifact.firstDegreeFlags.map((conditionId) => CONDITIONS_BY_ID[conditionId].label.toLowerCase());
  const secondDegreeLabels = artifact.secondDegreeFlags.map((conditionId) => CONDITIONS_BY_ID[conditionId].label.toLowerCase());
  const preferenceParts = [
    profile.personal.preferredLanguage?.trim() ? `language ${profile.personal.preferredLanguage.trim()}` : null,
    profile.personal.pronouns?.trim() ? `pronouns ${profile.personal.pronouns.trim()}` : null,
    profile.personal.preferredPharmacy?.trim() ? `pharmacy ${profile.personal.preferredPharmacy.trim()}` : null,
  ].filter(Boolean) as string[];
  const parts = [
    `Patient-reported context handoff for ${patientName}.`,
    prominentClusters.length > 0 ? `The strongest shared patterns are ${joinLabels(prominentClusters.map((label) => label.toLowerCase()))}.` : null,
    firstDegreeLabels.length > 0
      ? `First-degree history includes ${joinLabels(firstDegreeLabels)}.`
      : 'No first-degree family-history flags have been explicitly documented yet.',
    secondDegreeLabels.length > 0 ? `Additional second-degree history includes ${joinLabels(secondDegreeLabels)}.` : null,
    artifact.documentedFactCount > 0
      ? `${artifact.readyToShareFactCount} documented ${artifact.readyToShareFactCount === 1 ? 'fact is' : 'facts are'} marked ready to share and ${artifact.needsFollowupFactCount} ${artifact.needsFollowupFactCount === 1 ? 'fact still needs' : 'facts still need'} follow-up.`
      : null,
    durableFacts.length > 0 ? `${durableFacts.length} durable context ${durableFacts.length === 1 ? 'fact is' : 'facts are'} packaged for downstream use.` : null,
    patientMemory.length > 0
      ? `Patient memory also includes ${artifact.patientContextCounts.medications} ${artifact.patientContextCounts.medications === 1 ? 'medication' : 'medications'}, ${artifact.patientContextCounts.allergies} ${artifact.patientContextCounts.allergies === 1 ? 'allergy' : 'allergies'}, and ${artifact.patientContextCounts.chronicConditions} chronic ${artifact.patientContextCounts.chronicConditions === 1 ? 'condition' : 'conditions'}.`
      : null,
    profile.personal.visitGoal?.trim() ? `Visit goal: ${profile.personal.visitGoal.trim()}` : null,
    preferenceParts.length > 0 ? `Care preferences: ${joinLabels(preferenceParts)}.` : null,
    signals.length > 0 ? `Most salient facts: ${signals.slice(0, 3).map((signal) => signal.handoff_line).join(' ')}` : null,
    patientMemory.length > 0 ? `Current patient memory: ${patientMemory.slice(0, 3).map((item) => item.handoff_line).join(' ')}` : null,
    openQuestions.length > 0 ? `Still worth confirming: ${openQuestions[0].prompt}` : null,
    'Use this as clinician review context rather than as a patient diagnosis list.',
  ];

  return parts.filter(Boolean).join(' ');
}

function buildMockEncounterScenarios(prominentClusterIds: ClusterId[]): MockEncounterScenario[] {
  const chosen: ClusterId[] = prominentClusterIds.length > 0 ? prominentClusterIds.slice(0, 3) : ['cardiovascular'];
  return chosen.map((clusterId) => {
    const template = SCENARIO_TEMPLATES[clusterId];
    return {
      id: `scenario-${clusterId}`,
      ...template,
    };
  });
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function buildMedCanonHandoffPackage(
  profile: FamilyHistoryProfile,
  artifact: SummaryArtifact,
  visitMode: VisitMode = 'general_intake',
): MedCanonHandoffPackage {
  const trackedMembers = getTrackedMembers(profile);
  const firstDegreeMembers = trackedMembers.filter((member) => member.degree === 'first');
  const secondDegreeMembers = trackedMembers.filter((member) => member.degree === 'second');
  const medications = getCompletePersonalContextItems(profile.personal.medications);
  const allergies = getCompletePersonalContextItems(profile.personal.allergies);
  const chronicConditions = getCompletePersonalContextItems(profile.personal.chronicConditions);
  const patientMemoryItems = [...medications, ...allergies, ...chronicConditions];
  const prominentClusterIds = CLUSTER_ORDER
    .filter((clusterId) => artifact.clusterCounts[clusterId].first + artifact.clusterCounts[clusterId].second > 0)
    .sort((left, right) => clusterWeight(artifact, right) - clusterWeight(artifact, left))
    .slice(0, 3);
  const prominentClusters = prominentClusterIds.map((clusterId) => CLUSTERS[clusterId].label);
  const sourcePrefix = `fd-${slugify(profile.personal.nameOrLabel || 'patient')}`;
  const recordedAt = profile.updatedAt;
  const allSignals = buildResolvedSignals(profile, artifact).map((entry) => {
    const baseSignal: HandoffFamilySignal = {
      id: entry.fact.id,
      relative: displayMemberName(entry.member),
      degree: degreeLabel(entry.member),
      branch: entry.member.branch,
      cluster_id: entry.clusterId,
      condition: CONDITIONS_BY_ID[entry.fact.conditionId].label,
      cluster: CLUSTERS[entry.clusterId].label,
      handoff_line: conditionLine(entry.member, entry.fact),
      source: entry.fact.source,
      confidence: entry.fact.confidence,
      review_status: entry.fact.reviewStatus,
      review_required: factNeedsFollowup(entry.fact),
      last_updated_at: entry.fact.lastUpdatedAt,
      relevance_score: 0,
      relevance_reason: '',
    };
    const relevance = scoreFamilySignalForVisit(baseSignal, visitMode);
    return {
      ...baseSignal,
      relevance_score: relevance.score,
      relevance_reason: relevance.reason,
    };
  });
  const familyHistoryFlags = [...allSignals].sort((left, right) => right.relevance_score - left.relevance_score).slice(0, 6);

  const openQuestions = artifact.missingQuestions
    .map((question) => {
      const relevance = scoreOpenQuestionForVisit(
        {
          id: question.id,
          prompt: question.prompt,
          reason: question.reason,
          priority: question.priority,
          cluster: question.cluster,
          relevance_score: 0,
          relevance_reason: '',
        },
        visitMode,
      );
      return {
        id: question.id,
        prompt: question.prompt,
        reason: question.reason,
        priority: question.priority,
        cluster: question.cluster,
        relevance_score: relevance.score,
        relevance_reason: relevance.reason,
      };
    })
    .sort((left, right) => right.relevance_score - left.relevance_score)
    .slice(0, 3);

  const mapPatientMemoryItem = (item: PersonalContextItem): HandoffPatientContextItem => {
    const relevance = scorePatientContextForVisit(item.kind, item.label, visitMode);
    return {
      id: item.id,
      kind: item.kind,
      label: item.label.trim(),
      detail: item.detail?.trim() ?? '',
      handoff_line: personalContextLine(item),
      source: item.source,
      confidence: item.confidence,
      review_status: item.reviewStatus,
      review_required: personalContextItemNeedsFollowup(item),
      last_updated_at: item.lastUpdatedAt,
      relevance_score: relevance.score,
      relevance_reason: relevance.reason,
    };
  };

  const patientMemory = patientMemoryItems
    .map((item) => mapPatientMemoryItem(item))
    .sort((left, right) => right.relevance_score - left.relevance_score);

  const carePreferenceFacts: HandoffDurableFact[] = [
    profile.personal.preferredLanguage?.trim()
      ? {
          id: `${sourcePrefix}-preferred-language`,
          domain: 'care_preference',
          label: 'Preferred language',
          value: `Preferred language: ${profile.personal.preferredLanguage.trim()}.`,
          source: 'patient_memory',
          confidence: 'certain',
          review_status: 'ready_to_share',
          review_required: false,
          recorded_at: recordedAt,
          tags: ['patient_context', 'care_preference', 'preferred_language'],
          relevance_score: scorePatientContextForVisit('care_preference', 'Preferred language', visitMode).score,
          relevance_reason: scorePatientContextForVisit('care_preference', 'Preferred language', visitMode).reason,
        }
      : null,
    profile.personal.pronouns?.trim()
      ? {
          id: `${sourcePrefix}-pronouns`,
          domain: 'care_preference',
          label: 'Pronouns',
          value: `Pronouns: ${profile.personal.pronouns.trim()}.`,
          source: 'patient_memory',
          confidence: 'certain',
          review_status: 'ready_to_share',
          review_required: false,
          recorded_at: recordedAt,
          tags: ['patient_context', 'care_preference', 'pronouns'],
          relevance_score: scorePatientContextForVisit('care_preference', 'Pronouns', visitMode).score,
          relevance_reason: scorePatientContextForVisit('care_preference', 'Pronouns', visitMode).reason,
        }
      : null,
    profile.personal.timezone?.trim()
      ? {
          id: `${sourcePrefix}-timezone`,
          domain: 'care_preference',
          label: 'Timezone',
          value: `Timezone: ${profile.personal.timezone.trim()}.`,
          source: 'patient_memory',
          confidence: 'certain',
          review_status: 'ready_to_share',
          review_required: false,
          recorded_at: recordedAt,
          tags: ['patient_context', 'care_preference', 'timezone'],
          relevance_score: scorePatientContextForVisit('care_preference', 'Timezone', visitMode).score,
          relevance_reason: scorePatientContextForVisit('care_preference', 'Timezone', visitMode).reason,
        }
      : null,
    profile.personal.preferredPharmacy?.trim()
      ? {
          id: `${sourcePrefix}-preferred-pharmacy`,
          domain: 'care_preference',
          label: 'Preferred pharmacy',
          value: `Preferred pharmacy: ${profile.personal.preferredPharmacy.trim()}.`,
          source: 'patient_memory',
          confidence: 'certain',
          review_status: 'ready_to_share',
          review_required: false,
          recorded_at: recordedAt,
          tags: ['patient_context', 'care_preference', 'preferred_pharmacy'],
          relevance_score: scorePatientContextForVisit('care_preference', 'Preferred pharmacy', visitMode).score,
          relevance_reason: scorePatientContextForVisit('care_preference', 'Preferred pharmacy', visitMode).reason,
        }
      : null,
    profile.personal.visitGoal?.trim()
      ? {
          id: `${sourcePrefix}-visit-goal`,
          domain: 'care_preference',
          label: 'Visit goal',
          value: `Visit goal: ${profile.personal.visitGoal.trim()}.`,
          source: 'patient_memory',
          confidence: 'certain',
          review_status: 'ready_to_share',
          review_required: false,
          recorded_at: recordedAt,
          tags: ['patient_context', 'care_preference', 'visit_goal'],
          relevance_score: scorePatientContextForVisit('care_preference', 'Visit goal', visitMode).score,
          relevance_reason: scorePatientContextForVisit('care_preference', 'Visit goal', visitMode).reason,
        }
      : null,
  ].filter(Boolean) as HandoffDurableFact[];

  const durableFacts: HandoffDurableFact[] = [
    ...patientMemory.map((item) => ({
      id: item.id,
      domain: item.kind,
      label: patientContextLabel(item),
      value: item.handoff_line,
      source: item.source,
      confidence: item.confidence,
      review_status: item.review_status,
      review_required: item.review_required,
      recorded_at: item.last_updated_at,
      tags: ['patient_context', item.kind, `source_${item.source}`, `confidence_${item.confidence}`, item.review_status],
      relevance_score: item.relevance_score,
      relevance_reason: item.relevance_reason,
    })),
    ...carePreferenceFacts,
    ...familyHistoryFlags.map((signal) => ({
      id: signal.id,
      domain: 'family_history' as const,
      label: compactFamilyFactLabel(signal),
      value: signal.handoff_line,
      source: signal.source,
      confidence: signal.confidence,
      review_status: signal.review_status,
      review_required: signal.review_required,
      recorded_at: signal.last_updated_at,
      tags: [
        'family_history',
        signal.cluster.toLowerCase().replace(/\s+/g, '_'),
        signal.degree.replace('-', '_'),
        `source_${signal.source}`,
        `confidence_${signal.confidence}`,
        signal.review_status,
      ],
      relevance_score: signal.relevance_score,
      relevance_reason: signal.relevance_reason,
    })),
  ].sort((left, right) => right.relevance_score - left.relevance_score);

  const visitFocusConfig = VISIT_MODE_CONFIG[visitMode];
  const profileBrief = buildClinicianBrief(profile, artifact, prominentClusters, familyHistoryFlags, patientMemory, durableFacts, openQuestions);
  const packageNeedsReview = artifact.needsFollowupFactCount > 0 || openQuestions.length > 0;

  const recentChanges: HandoffRecentChange[] = [
    ...familyHistoryFlags.map((signal) => ({
      id: `recent-${signal.id}`,
      domain: 'family_history' as const,
      label: compactFamilyFactLabel(signal),
      changed_at: signal.last_updated_at,
      summary: signal.handoff_line,
      review_required: signal.review_required,
      relevance_score: signal.relevance_score,
    })),
    ...patientMemory.map((item) => ({
      id: `recent-${item.id}`,
      domain: item.kind,
      label: patientContextLabel(item),
      changed_at: item.last_updated_at,
      summary: item.handoff_line,
      review_required: item.review_required,
      relevance_score: item.relevance_score,
    })),
  ]
    .sort((left, right) => {
      const timeDiff = Date.parse(right.changed_at) - Date.parse(left.changed_at);
      if (Math.abs(timeDiff) > 1000) {
        return timeDiff;
      }
      return right.relevance_score - left.relevance_score;
    })
    .slice(0, 8);

  const clinicalContext: MedCanonClinicalContextEntry[] = [
    {
      type: 'profile_brief',
      label: 'Patient context brief',
      value: profileBrief,
      origin: 'first_degree_context',
      source_id: `${sourcePrefix}-brief`,
      recorded_at: recordedAt,
      review_required: packageNeedsReview,
      status: packageNeedsReview ? 'needs_followup' : 'patient_reported',
      category: 'patient_context',
      tags: ['family_history', 'patient_context', 'profile_brief', `visit_${visitMode}`, ...prominentClusterIds, packageNeedsReview ? 'needs_followup' : 'ready_to_share'],
    },
    ...durableFacts.slice(0, 8).map((fact) => ({
      type: fact.domain === 'family_history' ? 'family_history_flag' as const : fact.domain === 'care_preference' ? 'care_preference' as const : 'patient_memory_item' as const,
      label: fact.label,
      value: fact.value,
      origin: 'first_degree_context' as const,
      source_id: fact.id,
      recorded_at: fact.recorded_at,
      review_required: fact.review_required,
      status: fact.review_required ? 'needs_followup' as const : 'patient_reported' as const,
      category: fact.domain === 'family_history' ? 'family_history' as const : 'patient_context' as const,
      tags: [...fact.tags, `visit_${visitMode}`],
    })),
    ...artifact.keyPatterns.slice(0, 2).map((pattern, index) => ({
      type: 'family_history_pattern' as const,
      label: 'Family history pattern',
      value: pattern,
      origin: 'first_degree_context' as const,
      source_id: `${sourcePrefix}-pattern-${index + 1}`,
      recorded_at: recordedAt,
      review_required: packageNeedsReview,
      status: packageNeedsReview ? 'needs_followup' as const : 'patient_reported' as const,
      category: 'family_history' as const,
      tags: ['family_history', `visit_${visitMode}`, ...prominentClusterIds, packageNeedsReview ? 'needs_followup' : 'ready_to_share'],
    })),
    ...recentChanges.slice(0, 4).map((change) => ({
      type: 'recent_change' as const,
      label: `Recent change · ${change.label}`,
      value: change.summary,
      origin: 'first_degree_context' as const,
      source_id: change.id,
      recorded_at: change.changed_at,
      review_required: change.review_required,
      status: change.review_required ? 'needs_followup' as const : 'patient_reported' as const,
      category: change.domain === 'family_history' ? 'family_history' as const : 'patient_context' as const,
      tags: [change.domain, 'recent_change', `visit_${visitMode}`, change.review_required ? 'needs_followup' : 'ready_to_share'],
    })),
    ...openQuestions.map((question) => ({
      type: 'family_history_open_question' as const,
      label: 'Open family-history question',
      value: question.prompt,
      origin: 'first_degree_context' as const,
      source_id: question.id,
      recorded_at: recordedAt,
      review_required: true,
      status: 'needs_followup' as const,
      category: 'family_history' as const,
      tags: ['family_history', question.priority, 'missing_detail', `visit_${visitMode}`],
    })),
  ];

  return {
    package_version: 'first_degree_context_handoff_v2',
    generated_at: new Date().toISOString(),
    package_purpose: `Structured patient-memory and family-history context package tuned for ${visitFocusConfig.label.toLowerCase()} handoff and durable context reuse.`,
    patient: {
      display_name: profile.personal.nameOrLabel?.trim() || 'Patient',
      age_range: profile.personal.ageRange || 'Not set',
      sex: profile.personal.sex,
      reason_for_starting: profile.personal.reasonForStarting || 'Not specified',
    },
    visit_focus: {
      mode: visitMode,
      label: visitFocusConfig.label,
      description: visitFocusConfig.description,
      summary:
        durableFacts.length > 0
          ? `${visitFocusConfig.description} Top context now emphasizes ${durableFacts
              .slice(0, 3)
              .map((fact) => fact.label.toLowerCase())
              .join(', ')}.`
          : visitFocusConfig.description,
      priority_labels: visitFocusConfig.priority_labels,
    },
    family_snapshot: {
      tracked_relative_count: trackedMembers.length,
      first_degree_relative_count: firstDegreeMembers.length,
      second_degree_relative_count: secondDegreeMembers.length,
      first_degree_flag_count: artifact.firstDegreeFlags.length,
      second_degree_flag_count: artifact.secondDegreeFlags.length,
      durable_fact_count: durableFacts.length,
      ready_to_share_fact_count: artifact.readyToShareFactCount,
      needs_followup_fact_count: artifact.needsFollowupFactCount,
      recent_change_count: recentChanges.length,
      notable_clusters: prominentClusters,
    },
    profile_brief: profileBrief,
    durable_facts: durableFacts,
    family_history_flags: familyHistoryFlags,
    pattern_summaries: artifact.keyPatterns.slice(0, 4),
    open_questions: openQuestions,
    recent_changes: recentChanges,
    visit_scenarios: buildMockEncounterScenarios(prominentClusterIds),
    guardrails: [
      'This package is patient-reported context, not a diagnosis list for the patient.',
      'Unknown details and missing ages stay explicit instead of being filled in.',
      'The intended use is better clinician review, follow-up questions, and context handoff.',
    ],
    clinical_context: clinicalContext,
  };
}
