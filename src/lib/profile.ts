import { z } from 'zod';
import { type ConditionId } from './taxonomy';

export type StepId = 'intro' | 'about-you' | 'family-members' | 'conditions' | 'missing-details' | 'summary';
export type Sex = 'female' | 'male' | 'intersex' | 'unknown';
export type RelativeDegree = 'self' | 'first' | 'second';
export type Relationship =
  | 'self'
  | 'mother'
  | 'father'
  | 'sibling'
  | 'maternal_grandmother'
  | 'maternal_grandfather'
  | 'paternal_grandmother'
  | 'paternal_grandfather';
export type AliveStatus = 'alive' | 'deceased' | 'unknown';
export type FactStatus = 'present' | 'absent' | 'unknown' | 'unanswered';
export type FactSource = 'patient_memory' | 'family_report' | 'medical_record' | 'clinician_confirmed' | 'unknown';
export type FactConfidence = 'certain' | 'likely' | 'uncertain';
export type FactReviewStatus = 'ready_to_share' | 'needs_followup';

export interface FamilyMember {
  id: string;
  relationship: Relationship;
  degree: RelativeDegree;
  displayLabel: string;
  branch: 'maternal' | 'paternal' | 'core';
  included: boolean;
  sex: Sex;
  aliveStatus: AliveStatus;
  nameOptional?: string;
  approximateAge?: string;
  ageAtDeath?: string;
}

export interface FamilyHistoryFact {
  id: string;
  memberId: string;
  conditionId: ConditionId;
  status: FactStatus;
  ageAtOnset?: string;
  source: FactSource;
  confidence: FactConfidence;
  reviewStatus: FactReviewStatus;
  note?: string;
  lastUpdatedAt: string;
}

export interface PersonalProfile {
  nameOrLabel: string;
  ageRange: string;
  sex: Sex;
  reasonForStarting: string;
}

export interface FamilyHistoryProfile {
  version: '1.0';
  personal: PersonalProfile;
  members: FamilyMember[];
  facts: FamilyHistoryFact[];
  updatedAt: string;
}

const personalSchema = z.object({
  nameOrLabel: z.string(),
  ageRange: z.string(),
  sex: z.enum(['female', 'male', 'intersex', 'unknown']),
  reasonForStarting: z.string(),
});

const memberSchema = z.object({
  id: z.string(),
  relationship: z.enum([
    'self',
    'mother',
    'father',
    'sibling',
    'maternal_grandmother',
    'maternal_grandfather',
    'paternal_grandmother',
    'paternal_grandfather',
  ]),
  degree: z.enum(['self', 'first', 'second']),
  displayLabel: z.string(),
  branch: z.enum(['maternal', 'paternal', 'core']),
  included: z.boolean(),
  sex: z.enum(['female', 'male', 'intersex', 'unknown']),
  aliveStatus: z.enum(['alive', 'deceased', 'unknown']),
  nameOptional: z.string().optional(),
  approximateAge: z.string().optional(),
  ageAtDeath: z.string().optional(),
});

const factSchema = z.object({
  id: z.string(),
  memberId: z.string(),
  conditionId: z.string(),
  status: z.enum(['present', 'absent', 'unknown', 'unanswered']),
  ageAtOnset: z.string().optional(),
  source: z.enum(['patient_memory', 'family_report', 'medical_record', 'clinician_confirmed', 'unknown']).optional(),
  confidence: z.enum(['certain', 'likely', 'uncertain']).optional(),
  reviewStatus: z.enum(['ready_to_share', 'needs_followup']).optional(),
  note: z.string().optional(),
  lastUpdatedAt: z.string().optional(),
});

const profileSchema = z.object({
  version: z.literal('1.0'),
  personal: personalSchema,
  members: z.array(memberSchema),
  facts: z.array(factSchema),
  updatedAt: z.string(),
});

const FIXED_MEMBERS: FamilyMember[] = [
  {
    id: 'mother',
    relationship: 'mother',
    degree: 'first',
    displayLabel: 'Mother',
    branch: 'core',
    included: false,
    sex: 'female',
    aliveStatus: 'unknown',
  },
  {
    id: 'father',
    relationship: 'father',
    degree: 'first',
    displayLabel: 'Father',
    branch: 'core',
    included: false,
    sex: 'male',
    aliveStatus: 'unknown',
  },
  {
    id: 'maternal-grandmother',
    relationship: 'maternal_grandmother',
    degree: 'second',
    displayLabel: 'Maternal grandmother',
    branch: 'maternal',
    included: false,
    sex: 'female',
    aliveStatus: 'unknown',
  },
  {
    id: 'maternal-grandfather',
    relationship: 'maternal_grandfather',
    degree: 'second',
    displayLabel: 'Maternal grandfather',
    branch: 'maternal',
    included: false,
    sex: 'male',
    aliveStatus: 'unknown',
  },
  {
    id: 'paternal-grandmother',
    relationship: 'paternal_grandmother',
    degree: 'second',
    displayLabel: 'Paternal grandmother',
    branch: 'paternal',
    included: false,
    sex: 'female',
    aliveStatus: 'unknown',
  },
  {
    id: 'paternal-grandfather',
    relationship: 'paternal_grandfather',
    degree: 'second',
    displayLabel: 'Paternal grandfather',
    branch: 'paternal',
    included: false,
    sex: 'male',
    aliveStatus: 'unknown',
  },
];

export const AGE_RANGES = ['', 'Under 18', '18-29', '30-39', '40-49', '50-59', '60-69', '70+'];
export const FACT_SOURCE_OPTIONS: Array<{ value: FactSource; label: string }> = [
  { value: 'patient_memory', label: 'Patient memory' },
  { value: 'family_report', label: 'Family told me' },
  { value: 'medical_record', label: 'Medical record' },
  { value: 'clinician_confirmed', label: 'Clinician confirmed' },
  { value: 'unknown', label: 'Source unclear' },
];
export const FACT_CONFIDENCE_OPTIONS: Array<{ value: FactConfidence; label: string }> = [
  { value: 'certain', label: 'Certain' },
  { value: 'likely', label: 'Pretty sure' },
  { value: 'uncertain', label: 'Not very sure' },
];
export const FACT_REVIEW_STATUS_OPTIONS: Array<{ value: FactReviewStatus; label: string }> = [
  { value: 'ready_to_share', label: 'Ready to share' },
  { value: 'needs_followup', label: 'Needs follow-up' },
];

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeFact(value: z.infer<typeof factSchema>): FamilyHistoryFact {
  return {
    id: value.id,
    memberId: value.memberId,
    conditionId: value.conditionId as ConditionId,
    status: value.status,
    ageAtOnset: value.ageAtOnset ?? '',
    source: value.source ?? 'patient_memory',
    confidence: value.confidence ?? 'likely',
    reviewStatus: value.reviewStatus ?? 'ready_to_share',
    note: value.note ?? '',
    lastUpdatedAt: value.lastUpdatedAt ?? nowIso(),
  };
}

export function cloneFixedMembers(): FamilyMember[] {
  return FIXED_MEMBERS.map((member) => ({ ...member }));
}

export function createBlankProfile(): FamilyHistoryProfile {
  return {
    version: '1.0',
    personal: {
      nameOrLabel: '',
      ageRange: '',
      sex: 'unknown',
      reasonForStarting: '',
    },
    members: cloneFixedMembers(),
    facts: [],
    updatedAt: new Date().toISOString(),
  };
}

export function parseProfile(value: unknown): FamilyHistoryProfile | null {
  const result = profileSchema.safeParse(value);
  if (!result.success) {
    return null;
  }

  return {
    ...(result.data as FamilyHistoryProfile),
    facts: result.data.facts.map((fact) => normalizeFact(fact)),
  };
}

export function createSibling(index: number): FamilyMember {
  return {
    id: `sibling-${index}-${Math.random().toString(36).slice(2, 8)}`,
    relationship: 'sibling',
    degree: 'first',
    displayLabel: `Sibling ${index}`,
    branch: 'core',
    included: true,
    sex: 'unknown',
    aliveStatus: 'unknown',
  };
}

export function touchProfile(profile: FamilyHistoryProfile): FamilyHistoryProfile {
  return {
    ...profile,
    updatedAt: nowIso(),
  };
}

export function createFactRecord(memberId: string, conditionId: ConditionId, status: FactStatus): FamilyHistoryFact {
  const unresolved = status === 'unknown' || status === 'unanswered';
  return normalizeFact({
    id: `${memberId}-${conditionId}`,
    memberId,
    conditionId,
    status,
    ageAtOnset: '',
    source: unresolved ? 'unknown' : 'patient_memory',
    confidence: unresolved ? 'uncertain' : 'likely',
    reviewStatus: unresolved ? 'needs_followup' : 'ready_to_share',
    note: '',
    lastUpdatedAt: nowIso(),
  });
}

export function touchFact(
  fact: FamilyHistoryFact,
  patch: Partial<Omit<FamilyHistoryFact, 'id' | 'memberId' | 'conditionId'>>,
): FamilyHistoryFact {
  return normalizeFact({
    ...fact,
    ...patch,
    lastUpdatedAt: nowIso(),
  });
}

export function factNeedsFollowup(fact: FamilyHistoryFact): boolean {
  return fact.reviewStatus === 'needs_followup' || fact.confidence === 'uncertain' || fact.source === 'unknown';
}

export function formatFactSourceLabel(source: FactSource): string {
  return FACT_SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? source;
}

export function formatFactConfidenceLabel(confidence: FactConfidence): string {
  return FACT_CONFIDENCE_OPTIONS.find((option) => option.value === confidence)?.label ?? confidence;
}

export function formatFactReviewStatusLabel(reviewStatus: FactReviewStatus): string {
  return FACT_REVIEW_STATUS_OPTIONS.find((option) => option.value === reviewStatus)?.label ?? reviewStatus;
}

export function getTrackedMembers(profile: FamilyHistoryProfile): FamilyMember[] {
  return profile.members.filter((member) => member.included);
}

export function getFactsForMember(profile: FamilyHistoryProfile, memberId: string): FamilyHistoryFact[] {
  return profile.facts.filter((fact) => fact.memberId === memberId);
}

export function getFact(
  profile: FamilyHistoryProfile,
  memberId: string,
  conditionId: ConditionId,
): FamilyHistoryFact | undefined {
  return profile.facts.find((fact) => fact.memberId === memberId && fact.conditionId === conditionId);
}

export function countAnsweredFactsForMember(profile: FamilyHistoryProfile, memberId: string): number {
  return profile.facts.filter((fact) => fact.memberId === memberId && fact.status !== 'unanswered').length;
}

export function countPresentFactsForMember(profile: FamilyHistoryProfile, memberId: string): number {
  return profile.facts.filter((fact) => fact.memberId === memberId && fact.status === 'present').length;
}
