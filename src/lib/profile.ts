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
  return result.success ? (result.data as FamilyHistoryProfile) : null;
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
    updatedAt: new Date().toISOString(),
  };
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
