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
  | 'care_preference';
type HandoffStatus = 'patient_reported' | 'needs_followup';
type HandoffCategory = 'family_history' | 'patient_context';

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
}

export interface HandoffOpenQuestion {
  id: string;
  prompt: string;
  reason: string;
  priority: 'high' | 'medium';
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
}

export interface MockEncounterScenario {
  id: string;
  title: string;
  patient_prompt: string;
  why_context_matters: string;
  medcanon_goal: string;
}

export interface MedCanonHandoffPackage {
  package_version: 'first_degree_medcanon_handoff_v1';
  generated_at: string;
  package_purpose: string;
  patient: {
    display_name: string;
    age_range: string;
    sex: FamilyHistoryProfile['personal']['sex'];
    reason_for_starting: string;
  };
  family_snapshot: {
    tracked_relative_count: number;
    first_degree_relative_count: number;
    second_degree_relative_count: number;
    first_degree_flag_count: number;
    second_degree_flag_count: number;
    documented_fact_count: number;
    ready_to_share_fact_count: number;
    needs_followup_fact_count: number;
    patient_context_item_count: number;
    notable_clusters: string[];
  };
  patient_context_snapshot: {
    medications: HandoffPatientContextItem[];
    allergies: HandoffPatientContextItem[];
    chronic_conditions: HandoffPatientContextItem[];
    preferred_pharmacy: string;
    preferred_language: string;
    pronouns: string;
    timezone: string;
    visit_goal: string;
  };
  clinician_brief: string;
  salient_family_history: HandoffFamilySignal[];
  patient_memory: HandoffPatientContextItem[];
  pattern_summaries: string[];
  open_questions: HandoffOpenQuestion[];
  encounter_scenarios: MockEncounterScenario[];
  guardrails: string[];
  medcanon_clinical_context: MedCanonClinicalContextEntry[];
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

  const salientSignals = buildResolvedSignals(profile, artifact)
    .slice(0, 6)
    .map((entry) => ({
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
    }));

  const openQuestions = artifact.missingQuestions.slice(0, 3).map((question) => ({
    id: question.id,
    prompt: question.prompt,
    reason: question.reason,
    priority: question.priority,
  }));

  const mapPatientMemoryItem = (item: PersonalContextItem): HandoffPatientContextItem => ({
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
  });

  const patientMemory = patientMemoryItems.map((item) => mapPatientMemoryItem(item));
  const clinicianBrief = buildClinicianBrief(profile, artifact, prominentClusters, salientSignals, patientMemory, openQuestions);
  const sourcePrefix = `fd-${slugify(profile.personal.nameOrLabel || 'patient')}`;
  const recordedAt = profile.updatedAt;
  const packageNeedsReview = artifact.needsFollowupFactCount > 0 || openQuestions.length > 0;
  const carePreferenceParts = [
    profile.personal.preferredLanguage?.trim() ? `Preferred language: ${profile.personal.preferredLanguage.trim()}.` : null,
    profile.personal.pronouns?.trim() ? `Pronouns: ${profile.personal.pronouns.trim()}.` : null,
    profile.personal.timezone?.trim() ? `Timezone: ${profile.personal.timezone.trim()}.` : null,
    profile.personal.preferredPharmacy?.trim() ? `Preferred pharmacy: ${profile.personal.preferredPharmacy.trim()}.` : null,
    profile.personal.visitGoal?.trim() ? `Visit goal: ${profile.personal.visitGoal.trim()}.` : null,
  ].filter(Boolean) as string[];

  const medcanonClinicalContext: MedCanonClinicalContextEntry[] = [
    {
      type: 'profile_brief',
      label: 'Patient context brief',
      value: clinicianBrief,
      origin: 'first_degree_context',
      source_id: `${sourcePrefix}-brief`,
      recorded_at: recordedAt,
      review_required: packageNeedsReview,
      status: packageNeedsReview ? 'needs_followup' : 'patient_reported',
      category: 'patient_context',
      tags: ['family_history', 'patient_context', 'profile_brief', ...prominentClusterIds, packageNeedsReview ? 'needs_followup' : 'ready_to_share'],
    },
    ...salientSignals.map((signal) => ({
      type: 'family_history_flag' as const,
      label: `${signal.degree} family history`,
      value: signal.handoff_line,
      origin: 'first_degree_context' as const,
      source_id: signal.id,
      recorded_at: signal.last_updated_at,
      review_required: signal.review_required,
      status: signal.review_required ? 'needs_followup' as const : 'patient_reported' as const,
      category: 'family_history' as const,
      tags: [
        'family_history',
        signal.cluster.toLowerCase().replace(/\s+/g, '_'),
        signal.degree.replace('-', '_'),
        `source_${signal.source}`,
        `confidence_${signal.confidence}`,
        signal.review_status,
      ],
    })),
    ...artifact.keyPatterns.slice(0, 3).map((pattern, index) => ({
      type: 'family_history_pattern' as const,
      label: 'Family history pattern',
      value: pattern,
      origin: 'first_degree_context' as const,
      source_id: `${sourcePrefix}-pattern-${index + 1}`,
      recorded_at: recordedAt,
      review_required: packageNeedsReview,
      status: packageNeedsReview ? 'needs_followup' as const : 'patient_reported' as const,
      category: 'family_history' as const,
      tags: ['family_history', ...prominentClusterIds, packageNeedsReview ? 'needs_followup' : 'ready_to_share'],
    })),
    ...patientMemory.map((item) => ({
      type: 'patient_memory_item' as const,
      label: formatPersonalContextKindLabel(item.kind),
      value: item.handoff_line,
      origin: 'first_degree_context' as const,
      source_id: item.id,
      recorded_at: item.last_updated_at,
      review_required: item.review_required,
      status: item.review_required ? 'needs_followup' as const : 'patient_reported' as const,
      category: 'patient_context' as const,
      tags: [
        'patient_context',
        item.kind,
        `source_${item.source}`,
        `confidence_${item.confidence}`,
        item.review_status,
      ],
    })),
    ...(carePreferenceParts.length > 0
      ? [
          {
            type: 'care_preference' as const,
            label: 'Care preferences',
            value: carePreferenceParts.join(' '),
            origin: 'first_degree_context' as const,
            source_id: `${sourcePrefix}-preferences`,
            recorded_at: recordedAt,
            review_required: false,
            status: 'patient_reported' as const,
            category: 'patient_context' as const,
            tags: ['patient_context', 'care_preferences'],
          },
        ]
      : []),
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
      tags: ['family_history', question.priority, 'missing_detail'],
    })),
  ];

  return {
    package_version: 'first_degree_medcanon_handoff_v1',
    generated_at: new Date().toISOString(),
    package_purpose: 'Compact patient-memory and family-history context package intended to enrich MedCanon clinician handoff and follow-up framing.',
    patient: {
      display_name: profile.personal.nameOrLabel?.trim() || 'Patient',
      age_range: profile.personal.ageRange || 'Not set',
      sex: profile.personal.sex,
      reason_for_starting: profile.personal.reasonForStarting || 'Not specified',
    },
    family_snapshot: {
      tracked_relative_count: trackedMembers.length,
      first_degree_relative_count: firstDegreeMembers.length,
      second_degree_relative_count: secondDegreeMembers.length,
      first_degree_flag_count: artifact.firstDegreeFlags.length,
      second_degree_flag_count: artifact.secondDegreeFlags.length,
      documented_fact_count: artifact.documentedFactCount,
      ready_to_share_fact_count: artifact.readyToShareFactCount,
      needs_followup_fact_count: artifact.needsFollowupFactCount,
      patient_context_item_count: artifact.patientContextCounts.total,
      notable_clusters: prominentClusters,
    },
    patient_context_snapshot: {
      medications: medications.map((item) => mapPatientMemoryItem(item)),
      allergies: allergies.map((item) => mapPatientMemoryItem(item)),
      chronic_conditions: chronicConditions.map((item) => mapPatientMemoryItem(item)),
      preferred_pharmacy: profile.personal.preferredPharmacy?.trim() || '',
      preferred_language: profile.personal.preferredLanguage?.trim() || '',
      pronouns: profile.personal.pronouns?.trim() || '',
      timezone: profile.personal.timezone?.trim() || '',
      visit_goal: profile.personal.visitGoal?.trim() || '',
    },
    clinician_brief: clinicianBrief,
    salient_family_history: salientSignals,
    patient_memory: patientMemory,
    pattern_summaries: artifact.keyPatterns.slice(0, 4),
    open_questions: openQuestions,
    encounter_scenarios: buildMockEncounterScenarios(prominentClusterIds),
    guardrails: [
      'This package is patient-reported context, not a diagnosis list for the patient.',
      'Unknown details and missing ages stay explicit instead of being filled in.',
      'The intended use is better clinician review, follow-up questions, and context handoff.',
    ],
    medcanon_clinical_context: medcanonClinicalContext,
  };
}
