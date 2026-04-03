import {
  createBlankProfile,
  createFactRecord,
  createPersonalContextItem,
  createSibling,
  touchPersonalContextItem,
  touchFact,
  touchProfile,
  type FamilyHistoryFact,
  type FamilyHistoryProfile,
  type FamilyMember,
  type PersonalContextItem,
} from './profile';
import { type ConditionId } from './taxonomy';

export interface SampleProfile {
  id: string;
  label: string;
  blurb: string;
  featured?: boolean;
  profile: FamilyHistoryProfile;
}

function includeMember(member: FamilyMember, patch: Partial<FamilyMember> = {}): FamilyMember {
  return {
    ...member,
    included: true,
    ...patch,
  };
}

function fact(
  memberId: string,
  conditionId: ConditionId,
  ageAtOnset?: string,
  patch: Partial<Omit<FamilyHistoryFact, 'id' | 'memberId' | 'conditionId' | 'status'>> = {},
): FamilyHistoryFact {
  return touchFact(createFactRecord(memberId, conditionId, 'present'), {
    ageAtOnset: ageAtOnset ?? '',
    ...patch,
  });
}

function contextItem(
  kind: PersonalContextItem['kind'],
  label: string,
  detail = '',
  patch: Partial<Omit<PersonalContextItem, 'id' | 'kind' | 'label'>> = {},
): PersonalContextItem {
  return touchPersonalContextItem(createPersonalContextItem(kind), {
    label,
    detail,
    ...patch,
  });
}

function cardioSample(): FamilyHistoryProfile {
  const base = createBlankProfile();
  const sibling = includeMember(createSibling(1), { nameOptional: 'Brother', sex: 'male', approximateAge: '34' });
  const members = base.members.map((member) => {
    switch (member.id) {
      case 'mother':
        return includeMember(member, { nameOptional: 'Mom', approximateAge: '63', aliveStatus: 'alive' });
      case 'father':
        return includeMember(member, { nameOptional: 'Dad', approximateAge: '66', aliveStatus: 'alive' });
      case 'maternal-grandfather':
        return includeMember(member, { nameOptional: 'Maternal grandfather', aliveStatus: 'deceased', ageAtDeath: '78' });
      case 'paternal-grandmother':
        return includeMember(member, { nameOptional: 'Paternal grandmother', aliveStatus: 'deceased', ageAtDeath: '81' });
      default:
        return member;
    }
  });

  const facts: FamilyHistoryFact[] = [
    fact('mother', 'high_blood_pressure', '', { confidence: 'certain', source: 'patient_memory' }),
    fact('mother', 'high_cholesterol', '', { confidence: 'likely', source: 'family_report' }),
    fact('father', 'heart_disease', '54', { confidence: 'certain', source: 'family_report' }),
    fact('father', 'stroke', '58', { confidence: 'likely', source: 'family_report' }),
    fact('sibling-1-seed', 'high_cholesterol', '', { confidence: 'likely', source: 'patient_memory' }),
    fact('maternal-grandfather', 'heart_disease', '61', { confidence: 'likely', source: 'family_report' }),
    fact('maternal-grandfather', 'diabetes', '', { confidence: 'likely', source: 'family_report' }),
    fact('paternal-grandmother', 'stroke', '72', { confidence: 'certain', source: 'family_report' }),
  ];

  sibling.id = 'sibling-1-seed';

  return touchProfile({
    ...base,
    personal: {
      nameOrLabel: 'Alex',
      ageRange: '30-39',
      sex: 'unknown',
      reasonForStarting: 'Annual physical prep',
      pronouns: 'he/him',
      preferredLanguage: 'English',
      timezone: 'America/New_York',
      preferredPharmacy: 'CVS on Broad Street',
      visitGoal: 'Bring current cardiovascular family context into my preventive visit.',
      medications: [contextItem('medication', 'Atorvastatin', '20 mg nightly')],
      allergies: [contextItem('allergy', 'Penicillin', 'Rash as a child', { confidence: 'uncertain', reviewStatus: 'needs_followup' })],
      chronicConditions: [contextItem('condition', 'High cholesterol', 'Managed with medication')],
    },
    members: [...members, sibling],
    facts,
  });
}

function cancerSample(): FamilyHistoryProfile {
  const base = createBlankProfile();
  const sibling = includeMember(createSibling(1), { id: 'sibling-cancer', nameOptional: 'Sister', sex: 'female', approximateAge: '31' });
  const members = base.members.map((member) => {
    switch (member.id) {
      case 'mother':
        return includeMember(member, { nameOptional: 'Mother', approximateAge: '58', aliveStatus: 'alive' });
      case 'father':
        return includeMember(member, { nameOptional: 'Father', approximateAge: '60', aliveStatus: 'alive' });
      case 'maternal-grandmother':
        return includeMember(member, { nameOptional: 'Maternal grandmother', aliveStatus: 'deceased', ageAtDeath: '67' });
      case 'paternal-grandfather':
        return includeMember(member, { nameOptional: 'Paternal grandfather', aliveStatus: 'deceased', ageAtDeath: '75' });
      default:
        return member;
    }
  });

  return touchProfile({
    ...base,
    personal: {
      nameOrLabel: 'Maya',
      ageRange: '30-39',
      sex: 'female',
      reasonForStarting: 'Family planning and preventive care',
      pronouns: 'she/her',
      preferredLanguage: 'English',
      timezone: 'America/Chicago',
      preferredPharmacy: 'Walgreens near Lakeview',
      visitGoal: 'Make sure preventive screening discussions reflect both family and personal context.',
      medications: [contextItem('medication', 'Prenatal vitamin', 'Daily')],
      allergies: [contextItem('allergy', 'Sulfa antibiotics', 'Hives')],
      chronicConditions: [contextItem('condition', 'Migraine history', 'A few flares each month')],
    },
    members: [...members, sibling],
    facts: [
      fact('mother', 'breast_cancer', '46', { confidence: 'certain', source: 'medical_record' }),
      fact('maternal-grandmother', 'ovarian_cancer', '59', { confidence: 'likely', source: 'family_report' }),
      fact('paternal-grandfather', 'colon_cancer', '68', { confidence: 'likely', source: 'family_report' }),
      fact('father', 'prostate_cancer', '63', { confidence: 'certain', source: 'family_report' }),
      fact('sibling-cancer', 'breast_cancer', '', { confidence: 'likely', source: 'patient_memory' }),
    ],
  });
}

function mixedSample(): FamilyHistoryProfile {
  const base = createBlankProfile();
  const members = base.members.map((member) => {
    switch (member.id) {
      case 'mother':
        return includeMember(member, { nameOptional: 'Mother', approximateAge: '57', aliveStatus: 'alive' });
      case 'father':
        return includeMember(member, { nameOptional: 'Father', approximateAge: '59', aliveStatus: 'alive' });
      case 'maternal-grandmother':
        return includeMember(member, { nameOptional: 'Maternal grandmother', aliveStatus: 'deceased', ageAtDeath: '84' });
      default:
        return member;
    }
  });

  return touchProfile({
    ...base,
    personal: {
      nameOrLabel: 'Jordan',
      ageRange: '18-29',
      sex: 'unknown',
      reasonForStarting: 'Getting organized before a new primary care visit',
      pronouns: 'they/them',
      preferredLanguage: 'English',
      timezone: 'America/Los_Angeles',
      preferredPharmacy: '',
      visitGoal: 'Have a clean starting profile before meeting a new PCP.',
      medications: [],
      allergies: [contextItem('allergy', 'Latex', 'Skin irritation', { confidence: 'likely' })],
      chronicConditions: [],
    },
    members,
    facts: [
      fact('mother', 'diabetes', '', { confidence: 'likely', source: 'patient_memory' }),
      fact('maternal-grandmother', 'dementia', '74', { confidence: 'uncertain', source: 'family_report', reviewStatus: 'needs_followup' }),
    ],
  });
}

function medCanonDemoSample(): FamilyHistoryProfile {
  const base = createBlankProfile();
  const sibling = includeMember(createSibling(1), {
    id: 'sibling-featured-1',
    nameOptional: 'Older sister',
    sex: 'female',
    approximateAge: '35',
    aliveStatus: 'alive',
  });

  const members = base.members.map((member) => {
    switch (member.id) {
      case 'mother':
        return includeMember(member, { nameOptional: 'Denise', approximateAge: '62', aliveStatus: 'alive' });
      case 'father':
        return includeMember(member, { nameOptional: 'Marcus', approximateAge: '65', aliveStatus: 'alive' });
      case 'maternal-grandmother':
        return includeMember(member, { nameOptional: 'Elaine', aliveStatus: 'deceased', ageAtDeath: '68' });
      case 'maternal-grandfather':
        return includeMember(member, { nameOptional: 'Robert', aliveStatus: 'deceased', ageAtDeath: '74' });
      case 'paternal-grandfather':
        return includeMember(member, { nameOptional: 'Thomas', aliveStatus: 'deceased', ageAtDeath: '76' });
      default:
        return member;
    }
  });

  return touchProfile({
    ...base,
    personal: {
      nameOrLabel: 'Naomi Carter',
      ageRange: '30-39',
      sex: 'female',
      reasonForStarting: 'Preparing for more personalized telehealth visits',
      pronouns: 'she/her',
      preferredLanguage: 'English',
      timezone: 'America/New_York',
      preferredPharmacy: 'Walgreens, 14th Street',
      visitGoal: 'Give MedCanon enough durable context to personalize preventive and acute telehealth visits.',
      medications: [
        contextItem('medication', 'Rosuvastatin', '10 mg nightly', { source: 'medical_record', confidence: 'certain' }),
        contextItem('medication', 'Albuterol inhaler', 'As needed for exercise-induced symptoms', { source: 'patient_memory', confidence: 'likely' }),
      ],
      allergies: [
        contextItem('allergy', 'Penicillin', 'Rash', { source: 'family_report', confidence: 'likely' }),
      ],
      chronicConditions: [
        contextItem('condition', 'Asthma', 'Mild intermittent', { source: 'medical_record', confidence: 'certain' }),
        contextItem('condition', 'Migraine', 'A few episodes most months', { source: 'patient_memory', confidence: 'likely' }),
      ],
    },
    members: [...members, sibling],
    facts: [
      fact('mother', 'breast_cancer', '46', { confidence: 'certain', source: 'medical_record' }),
      fact('mother', 'high_blood_pressure', '', { confidence: 'likely', source: 'patient_memory' }),
      fact('father', 'heart_disease', '52', { confidence: 'likely', source: 'family_report' }),
      fact('father', 'stroke', '', { confidence: 'uncertain', source: 'family_report', reviewStatus: 'needs_followup' }),
      fact('father', 'diabetes', '', { confidence: 'likely', source: 'family_report' }),
      fact('sibling-featured-1', 'high_cholesterol', '', { confidence: 'likely', source: 'patient_memory' }),
      fact('maternal-grandmother', 'ovarian_cancer', '', { confidence: 'uncertain', source: 'family_report', reviewStatus: 'needs_followup' }),
      fact('maternal-grandfather', 'heart_disease', '', { confidence: 'likely', source: 'family_report' }),
      fact('paternal-grandfather', 'colon_cancer', '70', { confidence: 'certain', source: 'family_report' }),
    ],
  });
}

export const SAMPLE_PROFILES: SampleProfile[] = [
  {
    id: 'medcanon-demo',
    label: 'MedCanon Demo Family',
    blurb: 'A high-signal family history with cardiovascular and cancer context that feeds a stronger telehealth handoff.',
    featured: true,
    profile: medCanonDemoSample(),
  },
  {
    id: 'cardio-cluster',
    label: 'Cardio Cluster',
    blurb: 'A dense cardiovascular family pattern with several first-degree flags and one sibling.',
    profile: cardioSample(),
  },
  {
    id: 'cancer-lineage',
    label: 'Cancer Lineage',
    blurb: 'A cancer-heavy family history that exercises the age-at-diagnosis prompts and clustering view.',
    profile: cancerSample(),
  },
  {
    id: 'sparse-context',
    label: 'Sparse Context',
    blurb: 'A lighter profile with incomplete details, useful for testing missing-question behavior.',
    profile: mixedSample(),
  },
];
