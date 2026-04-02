import { createBlankProfile, createSibling, touchProfile, type FamilyHistoryFact, type FamilyHistoryProfile, type FamilyMember } from './profile';
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

function fact(memberId: string, conditionId: ConditionId, ageAtOnset?: string): FamilyHistoryFact {
  return {
    id: `${memberId}-${conditionId}`,
    memberId,
    conditionId,
    status: 'present',
    ageAtOnset: ageAtOnset ?? '',
  };
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
    fact('mother', 'high_blood_pressure'),
    fact('mother', 'high_cholesterol'),
    fact('father', 'heart_disease', '54'),
    fact('father', 'stroke', '58'),
    fact('sibling-1-seed', 'high_cholesterol'),
    fact('maternal-grandfather', 'heart_disease', '61'),
    fact('maternal-grandfather', 'diabetes'),
    fact('paternal-grandmother', 'stroke', '72'),
  ];

  sibling.id = 'sibling-1-seed';

  return touchProfile({
    ...base,
    personal: {
      nameOrLabel: 'Alex',
      ageRange: '30-39',
      sex: 'unknown',
      reasonForStarting: 'Annual physical prep',
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
    },
    members: [...members, sibling],
    facts: [
      fact('mother', 'breast_cancer', '46'),
      fact('maternal-grandmother', 'ovarian_cancer', '59'),
      fact('paternal-grandfather', 'colon_cancer', '68'),
      fact('father', 'prostate_cancer', '63'),
      fact('sibling-cancer', 'breast_cancer'),
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
    },
    members,
    facts: [fact('mother', 'diabetes'), fact('maternal-grandmother', 'dementia', '74')],
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
    },
    members: [...members, sibling],
    facts: [
      fact('mother', 'breast_cancer', '46'),
      fact('mother', 'high_blood_pressure'),
      fact('father', 'heart_disease', '52'),
      fact('father', 'stroke'),
      fact('father', 'diabetes'),
      fact('sibling-featured-1', 'high_cholesterol'),
      fact('maternal-grandmother', 'ovarian_cancer'),
      fact('maternal-grandfather', 'heart_disease'),
      fact('paternal-grandfather', 'colon_cancer', '70'),
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
