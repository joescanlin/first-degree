export type ClusterId =
  | 'cardiovascular'
  | 'metabolic'
  | 'cancer'
  | 'autoimmune'
  | 'neurologic'
  | 'mental_health';

export type ConditionId =
  | 'heart_disease'
  | 'stroke'
  | 'high_blood_pressure'
  | 'high_cholesterol'
  | 'diabetes'
  | 'breast_cancer'
  | 'ovarian_cancer'
  | 'colon_cancer'
  | 'prostate_cancer'
  | 'autoimmune_disease'
  | 'dementia'
  | 'depression_anxiety'
  | 'bipolar_schizophrenia';

export interface ClusterMeta {
  id: ClusterId;
  label: string;
  color: string;
  accent: string;
  description: string;
  whyItMatters: string;
}

export interface ConditionDefinition {
  id: ConditionId;
  label: string;
  shortLabel: string;
  cluster: ClusterId;
  askAgeAtDiagnosis: boolean;
  doctorPrompt: string;
}

export const CLUSTERS: Record<ClusterId, ClusterMeta> = {
  cardiovascular: {
    id: 'cardiovascular',
    label: 'Cardiovascular',
    color: '#2757A5',
    accent: '#D8E6FB',
    description: 'Heart disease, stroke, blood pressure, and cholesterol patterns.',
    whyItMatters:
      'Clinicians often ask about cardiovascular history because it can shape preventive conversations and how family context is interpreted.',
  },
  metabolic: {
    id: 'metabolic',
    label: 'Metabolic',
    color: '#1FB6B1',
    accent: '#D8F5F3',
    description: 'Diabetes and related metabolic patterns.',
    whyItMatters:
      'Family metabolic history can be relevant when a clinician is thinking about prevention, screening, and broader risk context.',
  },
  cancer: {
    id: 'cancer',
    label: 'Cancer',
    color: '#F24E43',
    accent: '#FDE1DE',
    description: 'Breast, ovarian, colon, and prostate cancer history.',
    whyItMatters:
      'The type of cancer and the age at diagnosis can both matter when family history is discussed during future visits.',
  },
  autoimmune: {
    id: 'autoimmune',
    label: 'Autoimmune',
    color: '#7A3FA6',
    accent: '#EFE0F8',
    description: 'Autoimmune disease patterns across the family.',
    whyItMatters:
      'Autoimmune history can add useful background context, especially when symptoms or diagnoses overlap across family members.',
  },
  neurologic: {
    id: 'neurologic',
    label: 'Neurologic',
    color: '#F5B135',
    accent: '#FFF0CC',
    description: 'Dementia and neurologic history.',
    whyItMatters:
      'Neurologic family history can be important for preventive conversations and long-term context gathering.',
  },
  mental_health: {
    id: 'mental_health',
    label: 'Mental Health',
    color: '#3D52B3',
    accent: '#E2E6FA',
    description: 'Depression, anxiety, bipolar disorder, and schizophrenia history.',
    whyItMatters:
      'Mental health history can be relevant family context and is often under-documented if it is never written down clearly.',
  },
};

export const CONDITIONS: ConditionDefinition[] = [
  {
    id: 'heart_disease',
    label: 'Heart disease',
    shortLabel: 'Heart disease',
    cluster: 'cardiovascular',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'Mention any family history of heart disease, especially in first-degree relatives.',
  },
  {
    id: 'stroke',
    label: 'Stroke',
    shortLabel: 'Stroke',
    cluster: 'cardiovascular',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'Include family stroke history if it is known, along with age at diagnosis if possible.',
  },
  {
    id: 'high_blood_pressure',
    label: 'High blood pressure',
    shortLabel: 'High BP',
    cluster: 'cardiovascular',
    askAgeAtDiagnosis: false,
    doctorPrompt: 'Family high blood pressure is useful baseline preventive context.',
  },
  {
    id: 'high_cholesterol',
    label: 'High cholesterol',
    shortLabel: 'High cholesterol',
    cluster: 'cardiovascular',
    askAgeAtDiagnosis: false,
    doctorPrompt: 'Family high cholesterol history can be useful preventive context.',
  },
  {
    id: 'diabetes',
    label: 'Diabetes',
    shortLabel: 'Diabetes',
    cluster: 'metabolic',
    askAgeAtDiagnosis: false,
    doctorPrompt: 'Family diabetes history is useful to bring up in preventive care conversations.',
  },
  {
    id: 'breast_cancer',
    label: 'Breast cancer',
    shortLabel: 'Breast cancer',
    cluster: 'cancer',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'If breast cancer is present in the family, include which relative and age at diagnosis if known.',
  },
  {
    id: 'ovarian_cancer',
    label: 'Ovarian cancer',
    shortLabel: 'Ovarian cancer',
    cluster: 'cancer',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'If ovarian cancer is present in the family, include which relative and age at diagnosis if known.',
  },
  {
    id: 'colon_cancer',
    label: 'Colon cancer',
    shortLabel: 'Colon cancer',
    cluster: 'cancer',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'If colon cancer is in the family, include the relative and age at diagnosis if known.',
  },
  {
    id: 'prostate_cancer',
    label: 'Prostate cancer',
    shortLabel: 'Prostate cancer',
    cluster: 'cancer',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'If prostate cancer is present in the family, include which relative and age at diagnosis if known.',
  },
  {
    id: 'autoimmune_disease',
    label: 'Autoimmune disease',
    shortLabel: 'Autoimmune',
    cluster: 'autoimmune',
    askAgeAtDiagnosis: false,
    doctorPrompt: 'Autoimmune disease history can be useful context if a clinician is looking at overlapping symptoms or diagnoses.',
  },
  {
    id: 'dementia',
    label: 'Dementia or Alzheimer\'s disease',
    shortLabel: 'Dementia',
    cluster: 'neurologic',
    askAgeAtDiagnosis: true,
    doctorPrompt: 'If dementia is present in the family, include which side of the family and age at onset if known.',
  },
  {
    id: 'depression_anxiety',
    label: 'Depression or anxiety',
    shortLabel: 'Depression/anxiety',
    cluster: 'mental_health',
    askAgeAtDiagnosis: false,
    doctorPrompt: 'Mental health history often matters more when it is written down clearly rather than left vague.',
  },
  {
    id: 'bipolar_schizophrenia',
    label: 'Bipolar disorder or schizophrenia',
    shortLabel: 'Bipolar/schizophrenia',
    cluster: 'mental_health',
    askAgeAtDiagnosis: false,
    doctorPrompt: 'Include serious mental health history if it is known and you feel comfortable sharing it in future care settings.',
  },
];

export const CONDITIONS_BY_ID = Object.fromEntries(CONDITIONS.map((condition) => [condition.id, condition])) as Record<
  ConditionId,
  ConditionDefinition
>;

export const CLUSTER_ORDER: ClusterId[] = [
  'cardiovascular',
  'metabolic',
  'cancer',
  'autoimmune',
  'neurologic',
  'mental_health',
];
