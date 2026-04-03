import { useEffect, useMemo, useRef, useState } from 'react';
import logo from '../assets/first-degree-logo.svg';
import {
  ALCOHOL_USE_OPTIONS,
  AGE_RANGES,
  FACT_CONFIDENCE_OPTIONS,
  FACT_REVIEW_STATUS_OPTIONS,
  FACT_SOURCE_OPTIONS,
  PREGNANCY_CONTEXT_OPTIONS,
  TOBACCO_NICOTINE_OPTIONS,
  countAnsweredFactsForMember,
  countPresentFactsForMember,
  createBlankProfile,
  createFactRecord,
  createPersonalContextItem,
  formatAlcoholUseLabel,
  formatPregnancyContextLabel,
  formatTobaccoNicotineStatusLabel,
  createSibling,
  getCompletePersonalContextItems,
  getFact,
  getTrackedMembers,
  parseProfile,
  touchFact,
  touchPersonalContextItem,
  touchProfile,
  type FamilyHistoryFact,
  type FamilyHistoryProfile,
  type FamilyMember,
  type FactConfidence,
  type FactReviewStatus,
  type FactSource,
  type FactStatus,
  type PersonalContextItem,
  type PersonalContextKind,
  type StepId,
} from './lib/profile';
import { SAMPLE_PROFILES } from './lib/samples';
import { clearSavedProfile, loadProfile, saveProfile } from './lib/storage';
import {
  VISIT_MODE_OPTIONS,
  buildMedCanonHandoffPackage,
  type MedCanonHandoffPackage,
  type VisitMode,
} from './lib/handoff';
import { buildDoctorNote, buildSummaryArtifact, type MissingQuestion, type SummaryArtifact } from './lib/summary';
import { ClusterKnowledgeWorkbench, ClusterSignalBars, ConditionClusterGraph } from './lib/visuals';
import { CLUSTERS, CLUSTER_ORDER, CONDITIONS, CONDITIONS_BY_ID, type ClusterId, type ConditionId } from './lib/taxonomy';

const STEP_ORDER: StepId[] = ['intro', 'about-you', 'family-members', 'conditions', 'missing-details', 'summary'];
const SUMMARY_TABS = ['overview', 'timeline', 'handoff', 'graph', 'clusters', 'questions'] as const;
const GRAPH_CLUSTER_FILTERS = ['all', ...CLUSTER_ORDER] as const;
const FEATURED_DEMO_SAMPLE_ID = 'medcanon-demo';

type SummaryTab = (typeof SUMMARY_TABS)[number];
type GraphClusterFilter = (typeof GRAPH_CLUSTER_FILTERS)[number];
type PersonalCollectionKey = 'medications' | 'allergies' | 'chronicConditions';

const SUMMARY_TAB_LABELS: Record<SummaryTab, string> = {
  overview: 'Overview',
  timeline: 'Memory Timeline',
  handoff: 'MedCanon Handoff',
  graph: 'Family Graph',
  clusters: 'Condition Clusters',
  questions: 'Questions',
};

function updateFactForStatus(fact: FamilyHistoryFact, status: FactStatus): FamilyHistoryFact | null {
  if (status === 'unanswered') {
    return null;
  }

  const defaults = createFactRecord(fact.memberId, fact.conditionId, status);
  return touchFact(fact, {
    status,
    ageAtOnset: status === 'present' ? fact.ageAtOnset : '',
    source: status === 'unknown' ? defaults.source : fact.source === 'unknown' ? defaults.source : fact.source,
    confidence: status === 'unknown' ? defaults.confidence : fact.confidence === 'uncertain' ? defaults.confidence : fact.confidence,
    reviewStatus:
      status === 'unknown'
        ? defaults.reviewStatus
        : fact.reviewStatus === 'needs_followup' && !fact.note?.trim()
          ? defaults.reviewStatus
          : fact.reviewStatus,
  });
}

function App() {
  const [profile, setProfile] = useState<FamilyHistoryProfile>(() => loadProfile());
  const [step, setStep] = useState<StepId>('intro');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [summaryTab, setSummaryTab] = useState<SummaryTab>('overview');
  const [activeGraphCluster, setActiveGraphCluster] = useState<GraphClusterFilter>('all');
  const [handoffVisitMode, setHandoffVisitMode] = useState<VisitMode>('general_intake');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const trackedMembers = useMemo(() => getTrackedMembers(profile), [profile]);
  const artifact = useMemo(() => buildSummaryArtifact(profile), [profile]);
  const doctorNote = useMemo(() => buildDoctorNote(profile, artifact), [profile, artifact]);
  const medCanonHandoff = useMemo(
    () => buildMedCanonHandoffPackage(profile, artifact, handoffVisitMode),
    [profile, artifact, handoffVisitMode],
  );
  const currentStepIndex = STEP_ORDER.indexOf(step);

  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!trackedMembers.some((member) => member.id === selectedMemberId)) {
      setSelectedMemberId(trackedMembers[0]?.id ?? '');
    }
  }, [trackedMembers, selectedMemberId]);

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setFeedbackMessage(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [feedbackMessage]);

  const handlePersonalChange = (field: keyof FamilyHistoryProfile['personal'], value: string) => {
    setProfile((current) =>
      touchProfile({
        ...current,
        personal: {
          ...current.personal,
          [field]: value,
        },
      }),
    );
  };

  const handleMemberChange = (memberId: string, patch: Partial<FamilyMember>) => {
    setProfile((current) =>
      touchProfile({
        ...current,
        members: current.members.map((member) => (member.id === memberId ? { ...member, ...patch } : member)),
      }),
    );
  };

  const addSibling = () => {
    setProfile((current) => {
      const siblingCount = current.members.filter((member) => member.relationship === 'sibling').length + 1;
      return touchProfile({
        ...current,
        members: [...current.members, createSibling(siblingCount)],
      });
    });
  };

  const removeSibling = (memberId: string) => {
    setProfile((current) =>
      touchProfile({
        ...current,
        members: current.members.filter((member) => member.id !== memberId),
        facts: current.facts.filter((fact) => fact.memberId !== memberId),
      }),
    );
  };

  const setFactStatus = (memberId: string, conditionId: ConditionId, status: FactStatus) => {
    setProfile((current) => {
      const existing = getFact(current, memberId, conditionId);
      if (status === 'unanswered') {
        if (!existing) {
          return current;
        }

        return touchProfile({
          ...current,
          facts: current.facts.filter((fact) => fact.id !== existing.id),
        });
      }

      const nextFacts = existing
        ? current.facts.map((fact) => (fact.id === existing.id ? updateFactForStatus(existing, status)! : fact))
        : [...current.facts, createFactRecord(memberId, conditionId, status)];

      return touchProfile({
        ...current,
        facts: nextFacts,
      });
    });
  };

  const bulkSetCluster = (memberId: string, clusterId: ClusterId, status: FactStatus) => {
    const clusterConditionIds = CONDITIONS.filter((condition) => condition.cluster === clusterId).map((condition) => condition.id);
    setProfile((current) => {
      let nextFacts = [...current.facts];

      for (const conditionId of clusterConditionIds) {
        const existing = nextFacts.find((fact) => fact.memberId === memberId && fact.conditionId === conditionId);
        if (existing) {
          nextFacts = nextFacts.map((fact) => (fact.id === existing.id ? updateFactForStatus(existing, status)! : fact));
        } else {
          nextFacts.push(createFactRecord(memberId, conditionId, status));
        }
      }

      return touchProfile({
        ...current,
        facts: nextFacts,
      });
    });
  };

  const clearCluster = (memberId: string, clusterId: ClusterId) => {
    const clusterConditionIds = CONDITIONS.filter((condition) => condition.cluster === clusterId).map((condition) => condition.id);
    setProfile((current) =>
      touchProfile({
        ...current,
        facts: current.facts.filter((fact) => !(fact.memberId === memberId && clusterConditionIds.includes(fact.conditionId))),
      }),
    );
  };

  const setFactAge = (memberId: string, conditionId: ConditionId, ageAtOnset: string) => {
    setProfile((current) => {
      const existing = getFact(current, memberId, conditionId);
      if (!existing) {
        return current;
      }

      return touchProfile({
        ...current,
        facts: current.facts.map((fact) => (fact.id === existing.id ? touchFact(fact, { ageAtOnset }) : fact)),
      });
    });
  };

  const setFactReviewMeta = (
    memberId: string,
    conditionId: ConditionId,
    patch: Partial<Pick<FamilyHistoryFact, 'source' | 'confidence' | 'reviewStatus' | 'note'>>,
  ) => {
    setProfile((current) => {
      const existing = getFact(current, memberId, conditionId);
      if (!existing) {
        return current;
      }

      return touchProfile({
        ...current,
        facts: current.facts.map((fact) => (fact.id === existing.id ? touchFact(fact, patch) : fact)),
      });
    });
  };

  const addPersonalContextEntry = (collection: PersonalCollectionKey, kind: PersonalContextKind) => {
    setProfile((current) =>
      touchProfile({
        ...current,
        personal: {
          ...current.personal,
          [collection]: [...current.personal[collection], createPersonalContextItem(kind)],
        },
      }),
    );
  };

  const updatePersonalContextEntry = (
    collection: PersonalCollectionKey,
    itemId: string,
    patch: Partial<Omit<PersonalContextItem, 'id' | 'kind'>>,
  ) => {
    setProfile((current) =>
      touchProfile({
        ...current,
        personal: {
          ...current.personal,
          [collection]: current.personal[collection].map((item) => (item.id === itemId ? touchPersonalContextItem(item, patch) : item)),
        },
      }),
    );
  };

  const removePersonalContextEntry = (collection: PersonalCollectionKey, itemId: string) => {
    setProfile((current) =>
      touchProfile({
        ...current,
        personal: {
          ...current.personal,
          [collection]: current.personal[collection].filter((item) => item.id !== itemId),
        },
      }),
    );
  };

  const goNext = () => {
    const next = STEP_ORDER[currentStepIndex + 1];
    if (next) {
      setStep(next);
    }
  };

  const goBack = () => {
    const previous = STEP_ORDER[currentStepIndex - 1];
    if (previous) {
      setStep(previous);
    }
  };

  const resetAll = () => {
    const confirmed = window.confirm('Reset the current draft and start over?');
    if (!confirmed) {
      return;
    }

    clearSavedProfile();
    setProfile(createBlankProfile());
    setSelectedMemberId('');
    setSummaryTab('overview');
    setStep('intro');
    setActiveGraphCluster('all');
    setHandoffVisitMode('general_intake');
    setFeedbackMessage('Draft reset');
  };

  const exportJson = () => {
    const payload = {
      profile,
      artifact,
      doctorNote,
      medcanonHandoff: medCanonHandoff,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'first-degree-family-history.json';
    anchor.click();
    window.URL.revokeObjectURL(url);
    setFeedbackMessage('Profile JSON downloaded');
  };

  const exportDoctorNote = () => {
    const blob = new Blob([doctorNote], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'first-degree-doctor-note.txt';
    anchor.click();
    window.URL.revokeObjectURL(url);
    setFeedbackMessage('Doctor note downloaded');
  };

  const copyDoctorNote = async () => {
    try {
      await navigator.clipboard.writeText(doctorNote);
      setFeedbackMessage('Doctor note copied');
    } catch {
      setFeedbackMessage('Clipboard access failed');
    }
  };

  const copyMedCanonPackage = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(medCanonHandoff, null, 2));
      setFeedbackMessage('MedCanon package copied');
    } catch {
      setFeedbackMessage('Clipboard access failed');
    }
  };

  const exportMedCanonPackage = () => {
    const blob = new Blob([JSON.stringify(medCanonHandoff, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'first-degree-medcanon-handoff.json';
    anchor.click();
    window.URL.revokeObjectURL(url);
    setFeedbackMessage('MedCanon handoff downloaded');
  };

  const shareSummary = async () => {
    const shareText = `${artifact.plainLanguageSummary}\n\nDoctor visit note:\n${doctorNote}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'First Degree family history summary',
          text: shareText,
        });
        setFeedbackMessage('Summary shared');
        return;
      }

      await navigator.clipboard.writeText(shareText);
      setFeedbackMessage('Summary copied for sharing');
    } catch {
      setFeedbackMessage('Share was cancelled');
    }
  };

  const triggerImport = () => {
    importRef.current?.click();
  };

  const importProfileFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const parsedJson = JSON.parse(raw);
      const candidate = parseProfile(parsedJson?.profile ?? parsedJson);
      if (!candidate) {
        setFeedbackMessage('Could not read that JSON profile');
        return;
      }

      setProfile(candidate);
      setStep('summary');
      setSummaryTab('overview');
      setFeedbackMessage('Profile imported');
    } catch {
      setFeedbackMessage('Import failed');
    } finally {
      event.target.value = '';
    }
  };

  const loadSample = (sampleId: string, destination: 'conditions' | 'summary', nextSummaryTab?: SummaryTab) => {
    const sample = SAMPLE_PROFILES.find((entry) => entry.id === sampleId);
    if (!sample) {
      return;
    }

    const cloned = structuredClone(sample.profile) as FamilyHistoryProfile;
    setProfile(cloned);
    setSelectedMemberId(getTrackedMembers(cloned)[0]?.id ?? '');
    setStep(destination);
    setSummaryTab(nextSummaryTab ?? (destination === 'summary' ? 'overview' : summaryTab));
    setActiveGraphCluster('all');
    setHandoffVisitMode('general_intake');
    setFeedbackMessage(`${sample.label} loaded`);
  };

  const formattedTimestamp = formatTimestamp(profile.updatedAt);

  return (
    <div className="app-shell">
      <input ref={importRef} type="file" accept="application/json" className="hidden-input" onChange={importProfileFile} />

      <header className="app-header">
        <div className="header-brand">
          <img className="brand-lockup" src={logo} alt="First Degree" />
          <div>
            <p className="eyebrow">Clinical context workspace</p>
            <h1>Build health context you can actually reuse</h1>
            <p className="lede">
              Start with family history, then add the current medications, allergies, conditions, and care preferences that make future visits more personalized.
            </p>
          </div>
        </div>
        <div className="header-chip-panel">
          <MetricChip label="Tracked relatives" value={trackedMembers.length.toString()} />
          <MetricChip label="Context items" value={artifact.documentedFactCount.toString()} />
          <MetricChip label="Open follow-ups" value={artifact.missingQuestions.length.toString()} />
        </div>
        <div className="header-meta-row">
          <div className="save-state-pill">Autosaved locally · {formattedTimestamp}</div>
          {feedbackMessage ? <div className="feedback-pill">{feedbackMessage}</div> : null}
        </div>
      </header>

      {step !== 'intro' ? (
        <nav className="stepper">
          {STEP_ORDER.slice(1).map((stepId, index) => {
            const label = stepId.replace('-', ' ');
            const absoluteIndex = index + 1;
            const state = absoluteIndex < currentStepIndex ? 'done' : absoluteIndex === currentStepIndex ? 'active' : 'idle';
            return (
              <button key={stepId} className={`step-pill ${state}`} onClick={() => setStep(stepId)}>
                <span className="step-index">{absoluteIndex}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      ) : null}

      <main className="workspace">
        {step === 'intro' ? (
          <section className="panel intro-panel">
            <div className="intro-grid">
              <div>
                <p className="eyebrow">Start simple</p>
                <h2>Most useful health context lives in memory, not in charts.</h2>
                <p>
                  First Degree is built to turn that memory into structured health context. The current app captures what you know, keeps uncertainty explicit, and turns it into a clearer artifact for future care.
                </p>
                <div className="intro-actions">
                  <button className="primary-button" onClick={() => setStep('about-you')}>
                    Start the profile
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => loadSample(FEATURED_DEMO_SAMPLE_ID, 'summary', 'handoff')}
                  >
                    Open featured patient
                  </button>
                  <button className="secondary-button" onClick={() => setStep('summary')}>
                    Jump into the summary view
                  </button>
                </div>
                <div className="sample-grid">
                  {SAMPLE_PROFILES.map((sample) => (
                    <article key={sample.id} className={`sample-card ${sample.featured ? 'featured' : ''}`}>
                      <div>
                        <p className="eyebrow">{sample.featured ? 'Featured patient' : 'Sample family'}</p>
                        <h3>{sample.label}</h3>
                        <p className="muted-copy">{sample.blurb}</p>
                      </div>
                      <div className="sample-actions">
                        <button className="secondary-button compact-button" onClick={() => loadSample(sample.id, 'conditions')}>
                          Load to edit
                        </button>
                        <button
                          className="ghost-button compact-button"
                          onClick={() => loadSample(sample.id, 'summary', sample.featured ? 'handoff' : 'overview')}
                        >
                          {sample.featured ? 'Open handoff' : 'Open summary'}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
              <div className="intro-side-panel">
                <h3>What this build includes</h3>
                <ul className="clean-list">
                  <li>Guided family member onboarding</li>
                  <li>Lightweight patient memory capture</li>
                  <li>A patient memory timeline for longitudinal context</li>
                  <li>Bulk condition entry by cluster</li>
                  <li>A graph-style family and cluster view</li>
                  <li>A MedCanon handoff view for clinician context</li>
                  <li>Share, import, and export flows</li>
                </ul>
                <h3>Scope boundaries</h3>
                <ul className="clean-list muted-list">
                  <li>No diagnosis generation</li>
                  <li>No live journal lookup per user</li>
                  <li>No hidden risk scoring</li>
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {step === 'about-you' ? (
          <section className="panel form-panel">
            <SectionHeader
              eyebrow="Step 1"
              title="About you and current context"
              description="Capture the minimum current-context details that will make future MedCanon handoffs more useful."
            />
            <div className="form-grid two-up">
              <label className="field">
                <span>Your name or label</span>
                <input
                  value={profile.personal.nameOrLabel}
                  onChange={(event) => handlePersonalChange('nameOrLabel', event.target.value)}
                  placeholder="Ex: Joe"
                />
              </label>
              <label className="field">
                <span>Your age range</span>
                <select value={profile.personal.ageRange} onChange={(event) => handlePersonalChange('ageRange', event.target.value)}>
                  {AGE_RANGES.map((option) => (
                    <option key={option || 'blank'} value={option}>
                      {option || 'Select age range'}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Your sex</span>
                <select value={profile.personal.sex} onChange={(event) => handlePersonalChange('sex', event.target.value)}>
                  <option value="unknown">Prefer not to say / unknown</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="intersex">Intersex</option>
                </select>
              </label>
              <label className="field wide">
                <span>Why are you starting this now?</span>
                <input
                  value={profile.personal.reasonForStarting}
                  onChange={(event) => handlePersonalChange('reasonForStarting', event.target.value)}
                  placeholder="Ex: Annual physical, family planning, just getting organized"
                />
              </label>
            </div>
            <div className="about-context-grid">
              <article className="data-card">
                <p className="eyebrow">Care preferences</p>
                <h3>Add the details you would want carried into a visit</h3>
                <div className="form-grid two-up">
                  <label className="field">
                    <span>Pronouns</span>
                    <input
                      value={profile.personal.pronouns}
                      onChange={(event) => handlePersonalChange('pronouns', event.target.value)}
                      placeholder="Ex: she/her"
                    />
                  </label>
                  <label className="field">
                    <span>Preferred language</span>
                    <input
                      value={profile.personal.preferredLanguage}
                      onChange={(event) => handlePersonalChange('preferredLanguage', event.target.value)}
                      placeholder="Ex: English"
                    />
                  </label>
                  <label className="field">
                    <span>Timezone</span>
                    <input
                      value={profile.personal.timezone}
                      onChange={(event) => handlePersonalChange('timezone', event.target.value)}
                      placeholder="Ex: America/New_York"
                    />
                  </label>
                  <label className="field">
                    <span>Preferred pharmacy</span>
                    <input
                      value={profile.personal.preferredPharmacy}
                      onChange={(event) => handlePersonalChange('preferredPharmacy', event.target.value)}
                      placeholder="Ex: Walgreens on 14th Street"
                    />
                  </label>
                  <label className="field wide">
                    <span>Main goal for the next visit</span>
                    <input
                      value={profile.personal.visitGoal}
                      onChange={(event) => handlePersonalChange('visitGoal', event.target.value)}
                      placeholder="Ex: Keep migraine management and family cancer context visible in my intake"
                    />
                  </label>
                </div>
              </article>

              <article className="data-card">
                <p className="eyebrow">Patient memory</p>
                <h3>Build the durable context you usually end up repeating every visit</h3>
                <ul className="clean-list compact-list muted-list">
                  <li>Current medications and how you take them</li>
                  <li>Allergies and the reaction if you know it</li>
                  <li>Chronic conditions you want a clinician to keep in view</li>
                  <li>Pregnancy context, substance summary, barriers, and the worries you want surfaced</li>
                </ul>
              </article>
            </div>

            <article className="data-card">
              <p className="eyebrow">Higher-value personal context</p>
              <h3>Add the context that often changes telehealth care, triage, and follow-up</h3>
              <div className="form-grid three-up">
                <label className="field">
                  <span>Pregnancy relevance</span>
                  <select value={profile.personal.pregnancyContext} onChange={(event) => handlePersonalChange('pregnancyContext', event.target.value)}>
                    {PREGNANCY_CONTEXT_OPTIONS.map((option) => (
                      <option key={option.value || 'blank'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Tobacco or nicotine</span>
                  <select
                    value={profile.personal.tobaccoNicotineStatus}
                    onChange={(event) => handlePersonalChange('tobaccoNicotineStatus', event.target.value)}
                  >
                    {TOBACCO_NICOTINE_OPTIONS.map((option) => (
                      <option key={option.value || 'blank'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Alcohol use</span>
                  <select value={profile.personal.alcoholUse} onChange={(event) => handlePersonalChange('alcoholUse', event.target.value)}>
                    {ALCOHOL_USE_OPTIONS.map((option) => (
                      <option key={option.value || 'blank'} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field wide">
                  <span>Other substance context</span>
                  <input
                    value={profile.personal.substanceContext}
                    onChange={(event) => handlePersonalChange('substanceContext', event.target.value)}
                    placeholder="Ex: Occasional cannabis edible, in recovery, none"
                  />
                </label>
                <label className="field wide">
                  <span>Care barriers</span>
                  <input
                    value={profile.personal.accessBarriers}
                    onChange={(event) => handlePersonalChange('accessBarriers', event.target.value)}
                    placeholder="Ex: Cost-sensitive prescriptions, transportation issues, childcare"
                  />
                </label>
                <label className="field wide">
                  <span>Main health worry to carry forward</span>
                  <input
                    value={profile.personal.healthWorries}
                    onChange={(event) => handlePersonalChange('healthWorries', event.target.value)}
                    placeholder="Ex: Worried this chest pressure could be heart-related because of family history"
                  />
                </label>
              </div>
            </article>

            <div className="patient-memory-editor-grid">
              <PersonalContextListEditor
                title="Current medications"
                description="Keep this fast. Add the medication name, then note the dose or frequency only if it helps."
                items={profile.personal.medications}
                addLabel="Add medication"
                emptyState="No medications added yet."
                nameLabel="Medication"
                namePlaceholder="Ex: Rosuvastatin"
                detailLabel="Dose or frequency"
                detailPlaceholder="Ex: 10 mg nightly"
                onAdd={() => addPersonalContextEntry('medications', 'medication')}
                onChange={(itemId, patch) => updatePersonalContextEntry('medications', itemId, patch)}
                onRemove={(itemId) => removePersonalContextEntry('medications', itemId)}
              />
              <PersonalContextListEditor
                title="Allergies"
                description="List what you react to and what the reaction was if you know it."
                items={profile.personal.allergies}
                addLabel="Add allergy"
                emptyState="No allergies added yet."
                nameLabel="Allergy"
                namePlaceholder="Ex: Penicillin"
                detailLabel="Reaction"
                detailPlaceholder="Ex: Rash"
                onAdd={() => addPersonalContextEntry('allergies', 'allergy')}
                onChange={(itemId, patch) => updatePersonalContextEntry('allergies', itemId, patch)}
                onRemove={(itemId) => removePersonalContextEntry('allergies', itemId)}
              />
              <PersonalContextListEditor
                title="Chronic conditions"
                description="Track the ongoing conditions you want visible in intake and follow-up visits."
                items={profile.personal.chronicConditions}
                addLabel="Add condition"
                emptyState="No chronic conditions added yet."
                nameLabel="Condition"
                namePlaceholder="Ex: Asthma"
                detailLabel="Current detail"
                detailPlaceholder="Ex: Mild intermittent"
                onAdd={() => addPersonalContextEntry('chronicConditions', 'condition')}
                onChange={(itemId, patch) => updatePersonalContextEntry('chronicConditions', itemId, patch)}
                onRemove={(itemId) => removePersonalContextEntry('chronicConditions', itemId)}
              />
            </div>
            <StepActions onBack={goBack} onNext={goNext} nextLabel="Continue to family members" />
          </section>
        ) : null}

        {step === 'family-members' ? (
          <section className="panel form-panel">
            <SectionHeader
              eyebrow="Step 2"
              title="Add family members"
              description="Start with the relatives you know best. You can skip anyone you do not know yet and fill them in later."
            />
            <div className="member-sections">
              <div className="member-section">
                <h3>Core relatives</h3>
                <div className="member-grid">
                  {profile.members
                    .filter((member) => member.relationship !== 'sibling')
                    .map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onChange={handleMemberChange}
                        onToggleInclude={() => handleMemberChange(member.id, { included: !member.included })}
                      />
                    ))}
                </div>
              </div>
              <div className="member-section">
                <div className="section-row">
                  <h3>Siblings</h3>
                  <button className="secondary-button compact-button" onClick={addSibling}>
                    Add sibling
                  </button>
                </div>
                <div className="member-grid sibling-grid">
                  {profile.members.filter((member) => member.relationship === 'sibling').length === 0 ? (
                    <div className="empty-card">No siblings added yet. Add one only if it helps the history feel more complete.</div>
                  ) : null}
                  {profile.members
                    .filter((member) => member.relationship === 'sibling')
                    .map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onChange={handleMemberChange}
                        onToggleInclude={() => handleMemberChange(member.id, { included: !member.included })}
                        onRemove={() => removeSibling(member.id)}
                      />
                    ))}
                </div>
              </div>
            </div>
            <StepActions onBack={goBack} onNext={goNext} nextLabel="Continue to conditions" />
          </section>
        ) : null}

        {step === 'conditions' ? (
          <section className="panel condition-panel">
            <SectionHeader
              eyebrow="Step 3"
              title="Mark known conditions"
              description="Work person by person. Use the bulk cluster actions to move quickly through clean histories and leave uncertainty explicit where needed."
            />
            {trackedMembers.length === 0 ? (
              <div className="empty-card">Add at least one family member in the previous step to start capturing condition history.</div>
            ) : (
              <div className="condition-layout">
                <aside className="member-list">
                  {trackedMembers.map((member) => {
                    const answeredCount = countAnsweredFactsForMember(profile, member.id);
                    const presentCount = countPresentFactsForMember(profile, member.id);
                    return (
                      <button
                        key={member.id}
                        className={`member-list-item ${selectedMemberId === member.id ? 'selected' : ''}`}
                        onClick={() => setSelectedMemberId(member.id)}
                      >
                        <div>
                          <strong>{member.nameOptional?.trim() || member.displayLabel}</strong>
                          <span>
                            {member.degree === 'first' ? 'First-degree' : 'Second-degree'} · {answeredCount}/{CONDITIONS.length} mapped
                          </span>
                        </div>
                        <span className="count-badge">{presentCount}</span>
                      </button>
                    );
                  })}
                </aside>
                <div className="condition-editor">
                  {trackedMembers
                    .filter((member) => member.id === selectedMemberId)
                    .map((member) => (
                      <div key={member.id} className="condition-member-panel">
                        <div className="member-editor-header member-editor-stacked">
                          <div>
                            <p className="eyebrow">Editing relative</p>
                            <h3>{member.nameOptional?.trim() || member.displayLabel}</h3>
                            <p className="muted-copy">
                              {countAnsweredFactsForMember(profile, member.id)} of {CONDITIONS.length} conditions mapped · {countPresentFactsForMember(profile, member.id)} positive findings
                            </p>
                          </div>
                          <div className="micro-bar-track">
                            <div
                              className="micro-bar-fill"
                              style={{ width: `${(countAnsweredFactsForMember(profile, member.id) / CONDITIONS.length) * 100}%` }}
                            />
                          </div>
                        </div>
                        {CLUSTER_ORDER.map((clusterId) => (
                          <ConditionClusterEditor
                            key={clusterId}
                            clusterId={clusterId}
                            member={member}
                            profile={profile}
                            setFactStatus={setFactStatus}
                            setFactAge={setFactAge}
                            setFactReviewMeta={setFactReviewMeta}
                            bulkSetCluster={bulkSetCluster}
                            clearCluster={clearCluster}
                          />
                        ))}
                      </div>
                    ))}
                </div>
              </div>
            )}
            <StepActions onBack={goBack} onNext={goNext} nextLabel="Review missing details" />
          </section>
        ) : null}

        {step === 'missing-details' ? (
          <section className="panel form-panel">
            <SectionHeader
              eyebrow="Step 4"
              title="Review the highest-value missing details"
              description="This is where the app starts creating value, even when the family history is incomplete."
            />
            <div className="question-grid">
              {artifact.missingQuestions.length === 0 ? (
                <div className="empty-card">No high-priority follow-up questions yet. You have enough to generate a clean first summary.</div>
              ) : (
                artifact.missingQuestions.map((question) => <MissingQuestionCard key={question.id} question={question} />)
              )}
            </div>
            <StepActions onBack={goBack} onNext={goNext} nextLabel="Open the summary workspace" />
          </section>
        ) : null}

        {step === 'summary' ? (
          <section className="panel summary-panel">
            <div className="summary-header">
              <SectionHeader
                eyebrow="Summary workspace"
                title="Patient memory, family graph, and clinician-ready artifacts"
                description="This workspace combines durable patient context with family-history structure so the eventual MedCanon handoff is easier to trust."
              />
              <div className="summary-actions wrap-actions">
                <button className="secondary-button compact-button" onClick={copyDoctorNote}>
                  Copy doctor note
                </button>
                <button className="secondary-button compact-button" onClick={copyMedCanonPackage}>
                  Copy handoff JSON
                </button>
                <button className="secondary-button compact-button" onClick={shareSummary}>
                  Share summary
                </button>
                <button className="secondary-button compact-button" onClick={exportDoctorNote}>
                  Download note
                </button>
                <button className="secondary-button compact-button" onClick={exportMedCanonPackage}>
                  Download handoff
                </button>
                <button className="secondary-button compact-button" onClick={exportJson}>
                  Export JSON
                </button>
                <button className="ghost-button compact-button" onClick={triggerImport}>
                  Import JSON
                </button>
                <button className="ghost-button compact-button" onClick={resetAll}>
                  Reset draft
                </button>
              </div>
            </div>

            <div className="summary-tab-strip">
              {SUMMARY_TABS.map((tab) => (
                <button
                  key={tab}
                  className={`summary-tab ${summaryTab === tab ? 'active' : ''}`}
                  onClick={() => setSummaryTab(tab)}
                >
                  {SUMMARY_TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {summaryTab === 'overview' ? <OverviewTab profile={profile} artifact={artifact} doctorNote={doctorNote} /> : null}
            {summaryTab === 'timeline' ? <MemoryTimelineTab profile={profile} artifact={artifact} /> : null}
            {summaryTab === 'handoff' ? (
              <MedCanonHandoffTab handoff={medCanonHandoff} visitMode={handoffVisitMode} setVisitMode={setHandoffVisitMode} />
            ) : null}
            {summaryTab === 'graph' ? (
              <FamilyGraphTab
                profile={profile}
                selectedMemberId={selectedMemberId}
                setSelectedMemberId={setSelectedMemberId}
                activeGraphCluster={activeGraphCluster}
                setActiveGraphCluster={setActiveGraphCluster}
              />
            ) : null}
            {summaryTab === 'clusters' ? <ClusterTab profile={profile} artifact={artifact} /> : null}
            {summaryTab === 'questions' ? <QuestionsTab artifact={artifact} /> : null}

            <StepActions onBack={goBack} onNext={() => setStep('summary')} nextLabel="Stay in summary" hideNext />
          </section>
        ) : null}
      </main>
    </div>
  );
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="section-description">{description}</p>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StepActions({
  onBack,
  onNext,
  nextLabel,
  hideNext,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  hideNext?: boolean;
}) {
  return (
    <div className="step-actions">
      <button className="ghost-button" onClick={onBack}>
        Back
      </button>
      {!hideNext ? (
        <button className="primary-button" onClick={onNext}>
          {nextLabel}
        </button>
      ) : null}
    </div>
  );
}

function MemberCard({
  member,
  onChange,
  onToggleInclude,
  onRemove,
}: {
  member: FamilyMember;
  onChange: (memberId: string, patch: Partial<FamilyMember>) => void;
  onToggleInclude: () => void;
  onRemove?: () => void;
}) {
  return (
    <article className={`member-card ${member.included ? 'active' : 'inactive'}`}>
      <div className="member-card-header">
        <div>
          <p className="member-kicker">{member.degree === 'first' ? 'First-degree' : 'Second-degree'} relative</p>
          <h4>{member.displayLabel}</h4>
        </div>
        <div className="member-header-actions">
          {member.included ? (
            <button className="toggle-button on" onClick={onToggleInclude}>
              Remove for now
            </button>
          ) : (
            <button className="secondary-button compact-button" onClick={onToggleInclude}>
              Add details
            </button>
          )}
          {onRemove ? (
            <button className="ghost-button compact-button" onClick={onRemove}>
              Remove sibling
            </button>
          ) : null}
        </div>
      </div>

      {member.included ? (
        <div className="member-fields">
          <label className="field">
            <span>Name or label</span>
            <input
              value={member.nameOptional ?? ''}
              onChange={(event) => onChange(member.id, { nameOptional: event.target.value })}
              placeholder={member.displayLabel}
            />
          </label>
          <label className="field">
            <span>Approximate age</span>
            <input
              value={member.approximateAge ?? ''}
              onChange={(event) => onChange(member.id, { approximateAge: event.target.value })}
              placeholder="Ex: 68"
            />
          </label>
          <label className="field">
            <span>Alive status</span>
            <select value={member.aliveStatus} onChange={(event) => onChange(member.id, { aliveStatus: event.target.value as FamilyMember['aliveStatus'] })}>
              <option value="unknown">Unknown</option>
              <option value="alive">Alive</option>
              <option value="deceased">Deceased</option>
            </select>
          </label>
          {member.aliveStatus === 'deceased' ? (
            <label className="field">
              <span>Age at death</span>
              <input
                value={member.ageAtDeath ?? ''}
                onChange={(event) => onChange(member.id, { ageAtDeath: event.target.value })}
                placeholder="Ex: 59"
              />
            </label>
          ) : null}
        </div>
      ) : (
        <div className="member-card-idle">
          <p className="muted-copy">This relative is not part of the current draft yet. Add details to start capturing their history.</p>
          <button className="primary-button compact-button member-card-action" onClick={onToggleInclude}>
            Add {member.displayLabel.toLowerCase()}
          </button>
        </div>
      )}
    </article>
  );
}

function PersonalContextListEditor({
  title,
  description,
  items,
  addLabel,
  emptyState,
  nameLabel,
  namePlaceholder,
  detailLabel,
  detailPlaceholder,
  onAdd,
  onChange,
  onRemove,
}: {
  title: string;
  description: string;
  items: PersonalContextItem[];
  addLabel: string;
  emptyState: string;
  nameLabel: string;
  namePlaceholder: string;
  detailLabel: string;
  detailPlaceholder: string;
  onAdd: () => void;
  onChange: (itemId: string, patch: Partial<Omit<PersonalContextItem, 'id' | 'kind'>>) => void;
  onRemove: (itemId: string) => void;
}) {
  return (
    <article className="data-card personal-context-card">
      <div className="section-row personal-context-header">
        <div>
          <p className="eyebrow">Patient memory</p>
          <h3>{title}</h3>
          <p className="muted-copy">{description}</p>
        </div>
        <button className="secondary-button compact-button" onClick={onAdd}>
          {addLabel}
        </button>
      </div>

      {items.length === 0 ? <div className="empty-card personal-context-empty">{emptyState}</div> : null}

      <div className="personal-context-stack">
        {items.map((item) => (
          <article key={item.id} className="personal-context-item-card">
            <div className="section-row personal-context-item-top">
              <strong>{item.label.trim() || nameLabel}</strong>
              <button className="ghost-button compact-button" onClick={() => onRemove(item.id)}>
                Remove
              </button>
            </div>
            <div className="personal-context-field-grid">
              <label className="field">
                <span>{nameLabel}</span>
                <input
                  value={item.label}
                  onChange={(event) => onChange(item.id, { label: event.target.value })}
                  placeholder={namePlaceholder}
                />
              </label>
              <label className="field">
                <span>{detailLabel}</span>
                <input
                  value={item.detail ?? ''}
                  onChange={(event) => onChange(item.id, { detail: event.target.value })}
                  placeholder={detailPlaceholder}
                />
              </label>
            </div>
            <div className="fact-review-grid">
              <label className="field compact-field">
                <span>Source</span>
                <select value={item.source} onChange={(event) => onChange(item.id, { source: event.target.value as FactSource })}>
                  {FACT_SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field compact-field">
                <span>Confidence</span>
                <select value={item.confidence} onChange={(event) => onChange(item.id, { confidence: event.target.value as FactConfidence })}>
                  {FACT_CONFIDENCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field compact-field">
                <span>Share status</span>
                <select value={item.reviewStatus} onChange={(event) => onChange(item.id, { reviewStatus: event.target.value as FactReviewStatus })}>
                  {FACT_REVIEW_STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field fact-note-field">
              <span>Note for later review</span>
              <input
                value={item.note ?? ''}
                onChange={(event) => onChange(item.id, { note: event.target.value })}
                placeholder="Ex: Dose from memory, confirm in chart later"
              />
            </label>
          </article>
        ))}
      </div>
    </article>
  );
}

function ConditionClusterEditor({
  clusterId,
  member,
  profile,
  setFactStatus,
  setFactAge,
  setFactReviewMeta,
  bulkSetCluster,
  clearCluster,
}: {
  clusterId: ClusterId;
  member: FamilyMember;
  profile: FamilyHistoryProfile;
  setFactStatus: (memberId: string, conditionId: ConditionId, status: FactStatus) => void;
  setFactAge: (memberId: string, conditionId: ConditionId, ageAtOnset: string) => void;
  setFactReviewMeta: (
    memberId: string,
    conditionId: ConditionId,
    patch: Partial<Pick<FamilyHistoryFact, 'source' | 'confidence' | 'reviewStatus' | 'note'>>,
  ) => void;
  bulkSetCluster: (memberId: string, clusterId: ClusterId, status: FactStatus) => void;
  clearCluster: (memberId: string, clusterId: ClusterId) => void;
}) {
  const cluster = CLUSTERS[clusterId];
  const conditions = CONDITIONS.filter((condition) => condition.cluster === clusterId);
  const answeredCount = conditions.filter((condition) => {
    const fact = getFact(profile, member.id, condition.id);
    return Boolean(fact && fact.status !== 'unanswered');
  }).length;

  return (
    <section className="cluster-editor-card">
      <div className="cluster-editor-header cluster-editor-stacked">
        <div>
          <div className="cluster-badge" style={{ background: cluster.accent, color: cluster.color }}>
            {cluster.label}
          </div>
          <p>{cluster.description}</p>
        </div>
        <div className="cluster-toolbar">
          <div className="cluster-progress-label">{answeredCount}/{conditions.length} mapped</div>
          <button className="small-pill action-pill" onClick={() => bulkSetCluster(member.id, clusterId, 'absent')}>
            All clear
          </button>
          <button className="small-pill action-pill" onClick={() => bulkSetCluster(member.id, clusterId, 'unknown')}>
            All not sure
          </button>
          <button className="small-pill ghost-pill" onClick={() => clearCluster(member.id, clusterId)}>
            Reset
          </button>
        </div>
      </div>
      <div className="condition-card-grid">
        {conditions.map((condition) => {
          const fact = getFact(profile, member.id, condition.id);
          const status = fact?.status ?? 'unanswered';
          return (
            <article key={condition.id} className="condition-card" style={{ borderColor: cluster.accent }}>
              <div className="condition-card-top">
                <div>
                  <h4>{condition.label}</h4>
                  <p>{condition.doctorPrompt}</p>
                </div>
                <div className="status-buttons">
                  {[
                    ['present', 'Has it'],
                    ['absent', 'No known history'],
                    ['unknown', 'Not sure'],
                    ['unanswered', 'Clear'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={`status-pill ${status === value ? 'selected' : ''}`}
                      onClick={() => setFactStatus(member.id, condition.id, value as FactStatus)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {status === 'present' ? (
                <label className="field inline-field">
                  <span>Age at diagnosis if known</span>
                  <input
                    value={fact?.ageAtOnset ?? ''}
                    onChange={(event) => setFactAge(member.id, condition.id, event.target.value)}
                    placeholder="Ex: 48"
                  />
                </label>
              ) : null}
              {status !== 'unanswered' && fact ? (
                <div className="fact-review-block">
                  <div className="fact-review-header">
                    <div>
                      <strong>Evidence and review</strong>
                      <p>Keep source and certainty explicit so this can be handed off cleanly later.</p>
                    </div>
                    <span className={`review-state-pill ${fact.reviewStatus}`}>
                      {fact.reviewStatus === 'ready_to_share' ? 'Ready to share' : 'Needs follow-up'}
                    </span>
                  </div>
                  <div className="fact-review-grid">
                    <label className="field compact-field">
                      <span>Source</span>
                      <select
                        value={fact.source}
                        onChange={(event) =>
                          setFactReviewMeta(member.id, condition.id, { source: event.target.value as FactSource })
                        }
                      >
                        {FACT_SOURCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field compact-field">
                      <span>Confidence</span>
                      <select
                        value={fact.confidence}
                        onChange={(event) =>
                          setFactReviewMeta(member.id, condition.id, { confidence: event.target.value as FactConfidence })
                        }
                      >
                        {FACT_CONFIDENCE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field compact-field">
                      <span>Share status</span>
                      <select
                        value={fact.reviewStatus}
                        onChange={(event) =>
                          setFactReviewMeta(member.id, condition.id, { reviewStatus: event.target.value as FactReviewStatus })
                        }
                      >
                        {FACT_REVIEW_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="field fact-note-field">
                    <span>Note for later review</span>
                    <input
                      value={fact.note ?? ''}
                      onChange={(event) => setFactReviewMeta(member.id, condition.id, { note: event.target.value })}
                      placeholder="Ex: Age is approximate, confirmed over phone, record still needed"
                    />
                  </label>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MissingQuestionCard({ question }: { question: MissingQuestion }) {
  return (
    <article className="question-card">
      <div className="question-card-top">
        <span className={`priority-badge ${question.priority}`}>{question.priority}</span>
        <span className="cluster-tag" style={{ color: CLUSTERS[question.cluster].color }}>
          {CLUSTERS[question.cluster].label}
        </span>
      </div>
      <h4>{question.prompt}</h4>
      <p>{question.reason}</p>
    </article>
  );
}

function OverviewTab({ profile, artifact, doctorNote }: { profile: FamilyHistoryProfile; artifact: SummaryArtifact; doctorNote: string }) {
  const clusterSignals = CLUSTER_ORDER.filter(
    (clusterId) => artifact.clusterCounts[clusterId].first + artifact.clusterCounts[clusterId].second > 0,
  );
  const medications = getCompletePersonalContextItems(profile.personal.medications);
  const allergies = getCompletePersonalContextItems(profile.personal.allergies);
  const chronicConditions = getCompletePersonalContextItems(profile.personal.chronicConditions);
  const patientMemoryChips = [
    ...medications.map((item) => `Med: ${item.label}`),
    ...allergies.map((item) => `Allergy: ${item.label}`),
    ...chronicConditions.map((item) => `Condition: ${item.label}`),
  ];

  return (
    <div className="overview-layout">
      <div className="metric-grid">
        <MetricCard label="First-degree flags" value={artifact.firstDegreeFlags.length} />
        <MetricCard label="Second-degree flags" value={artifact.secondDegreeFlags.length} />
        <MetricCard label="Cluster signals" value={clusterSignals.length} />
        <MetricCard label="Patient memory items" value={artifact.patientContextCounts.total} />
        <MetricCard label="Review-ready facts" value={artifact.readyToShareFactCount} />
        <MetricCard label="Needs review" value={artifact.needsFollowupFactCount} />
        <MetricCard label="Follow-up prompts" value={artifact.missingQuestions.length} />
      </div>

      <div className="overview-hero-grid">
        <article className="data-card summary-hero-card">
          <p className="eyebrow">Family summary</p>
          <h3>{artifact.plainLanguageSummary}</h3>
          <div className="key-pattern-list">
            {artifact.keyPatterns.map((pattern) => (
              <div key={pattern} className="pattern-row">
                <span className="pattern-dot" />
                <span>{pattern}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="data-card accent-card doctor-note-card">
          <p className="eyebrow">Clinician note</p>
          <p className="artifact-copy">{doctorNote}</p>
          <div className="note-callouts">
            {artifact.doctorVisitNotes.map((note) => (
              <div key={note} className="note-chip">
                {note}
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="overview-visual-grid">
        <article className="data-card chart-card chart-card-workbench">
          <p className="eyebrow">Knowledge graph</p>
          <h3>Inspect each family-health cluster and the follow-up questions it creates</h3>
          <ClusterKnowledgeWorkbench artifact={artifact} />
        </article>
        <article className="data-card chart-card signal-card">
          <p className="eyebrow">Signal bars</p>
          <h3>Where the strongest family signals are clustering</h3>
          <ClusterSignalBars artifact={artifact} />
        </article>
      </div>

      <div className="overview-detail-grid">
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

        <div className="overview-side-stack">
          <article className="data-card">
            <p className="eyebrow">Patient memory</p>
            <dl className="profile-facts">
              <div>
                <dt>Medications</dt>
                <dd>{artifact.patientContextCounts.medications}</dd>
              </div>
              <div>
                <dt>Allergies</dt>
                <dd>{artifact.patientContextCounts.allergies}</dd>
              </div>
              <div>
                <dt>Chronic conditions</dt>
                <dd>{artifact.patientContextCounts.chronicConditions}</dd>
              </div>
              <div>
                <dt>Preferred pharmacy</dt>
                <dd>{profile.personal.preferredPharmacy || 'Not set'}</dd>
              </div>
              <div>
                <dt>Language / pronouns</dt>
                <dd>
                  {[profile.personal.preferredLanguage, profile.personal.pronouns].filter(Boolean).join(' · ') || 'Not set'}
                </dd>
              </div>
              <div>
                <dt>Pregnancy context</dt>
                <dd>{profile.personal.pregnancyContext ? formatPregnancyContextLabel(profile.personal.pregnancyContext) : 'Not set'}</dd>
              </div>
              <div>
                <dt>Tobacco / alcohol</dt>
                <dd>
                  {[
                    profile.personal.tobaccoNicotineStatus ? formatTobaccoNicotineStatusLabel(profile.personal.tobaccoNicotineStatus) : '',
                    profile.personal.alcoholUse ? formatAlcoholUseLabel(profile.personal.alcoholUse) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Not set'}
                </dd>
              </div>
              <div>
                <dt>Other substance context</dt>
                <dd>{profile.personal.substanceContext || 'Not set'}</dd>
              </div>
              <div>
                <dt>Care barriers</dt>
                <dd>{profile.personal.accessBarriers || 'Not set'}</dd>
              </div>
              <div>
                <dt>Main worry</dt>
                <dd>{profile.personal.healthWorries || 'Not set'}</dd>
              </div>
            </dl>
            {patientMemoryChips.length > 0 ? (
              <div className="chip-row compact-note-list">
                {patientMemoryChips.map((chip) => (
                  <span key={chip} className="chip">
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            <ul className="clean-list compact-list compact-note-list">
              {artifact.patientContextNotes.slice(0, 6).map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>

          <article className="data-card">
            <p className="eyebrow">Review readiness</p>
            <dl className="profile-facts">
              <div>
                <dt>Documented facts</dt>
                <dd>{artifact.documentedFactCount}</dd>
              </div>
              <div>
                <dt>Ready to share</dt>
                <dd>{artifact.readyToShareFactCount}</dd>
              </div>
              <div>
                <dt>Need follow-up</dt>
                <dd>{artifact.needsFollowupFactCount}</dd>
              </div>
            </dl>
            <ul className="clean-list compact-list compact-note-list">
              {artifact.reviewabilityNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </article>

          <article className="data-card">
            <p className="eyebrow">Profile context</p>
            <dl className="profile-facts">
              <div>
                <dt>Profile name</dt>
                <dd>{profile.personal.nameOrLabel || 'Not set'}</dd>
              </div>
              <div>
                <dt>Age range</dt>
                <dd>{profile.personal.ageRange || 'Not set'}</dd>
              </div>
              <div>
                <dt>Reason for starting</dt>
                <dd>{profile.personal.reasonForStarting || 'Not set'}</dd>
              </div>
              <div>
                <dt>Care barriers</dt>
                <dd>{profile.personal.accessBarriers || 'Not set'}</dd>
              </div>
              <div>
                <dt>Main worry</dt>
                <dd>{profile.personal.healthWorries || 'Not set'}</dd>
              </div>
            </dl>
          </article>

          <article className="data-card">
            <p className="eyebrow">Open issues</p>
            {artifact.incompletenessNotes.length === 0 ? (
              <p className="muted-copy">No major incompleteness notes right now.</p>
            ) : (
              <ul className="clean-list compact-list">
                {artifact.incompletenessNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}

function MemoryTimelineTab({ profile, artifact }: { profile: FamilyHistoryProfile; artifact: SummaryArtifact }) {
  const recentChanges = artifact.memoryTimeline.sections.find((section) => section.id === 'recent_changes')!;
  const durableFacts = artifact.memoryTimeline.sections.find((section) => section.id === 'durable_facts')!;
  const familyDiscoveries = artifact.memoryTimeline.sections.find((section) => section.id === 'family_discoveries')!;
  const openQuestions = artifact.memoryTimeline.sections.find((section) => section.id === 'open_questions')!;

  return (
    <div className="summary-grid timeline-grid">
      <div className="summary-main-column">
        <article className="data-card accent-card timeline-hero-card">
          <p className="eyebrow">Patient memory timeline</p>
          <h3>Track what changed, what stays durable, and what still needs confirmation</h3>
          <p className="muted-copy">
            This view turns the profile into a longitudinal context record that can keep getting better between visits instead of restarting
            from scratch each time.
          </p>
          <div className="snapshot-grid">
            <div className="snapshot-card">
              <span>Recent changes</span>
              <strong>{artifact.memoryTimeline.recentChangeCount}</strong>
            </div>
            <div className="snapshot-card">
              <span>Durable facts</span>
              <strong>{artifact.memoryTimeline.durableFactCount}</strong>
            </div>
            <div className="snapshot-card">
              <span>Family discoveries</span>
              <strong>{artifact.memoryTimeline.familyDiscoveryCount}</strong>
            </div>
            <div className="snapshot-card">
              <span>Open questions</span>
              <strong>{artifact.memoryTimeline.openQuestionCount}</strong>
            </div>
            <div className="snapshot-card">
              <span>Ready to share</span>
              <strong>{artifact.memoryTimeline.readyToShareCount}</strong>
            </div>
            <div className="snapshot-card">
              <span>Need follow-up</span>
              <strong>{artifact.memoryTimeline.needsFollowupCount}</strong>
            </div>
          </div>
          <p className="muted-copy">Latest profile update: {formatTimestamp(artifact.memoryTimeline.lastUpdatedAt)}.</p>
        </article>

        <article className="data-card">
          <p className="eyebrow">{recentChanges.label}</p>
          <h3>{recentChanges.description}</h3>
          <TimelineSectionList
            items={recentChanges.items}
            emptyMessage="No recent fact-level changes yet. Add or edit family history, medications, allergies, or chronic conditions to start the timeline."
          />
        </article>

        <div className="timeline-section-grid">
          <article className="data-card">
            <p className="eyebrow">{durableFacts.label}</p>
            <h3>{durableFacts.description}</h3>
            <TimelineSectionList
              items={durableFacts.items}
              emptyMessage="No durable facts are stored yet. Add patient memory items and profile context to build a reusable memory layer."
            />
          </article>

          <article className="data-card">
            <p className="eyebrow">{familyDiscoveries.label}</p>
            <h3>{familyDiscoveries.description}</h3>
            <TimelineSectionList
              items={familyDiscoveries.items}
              emptyMessage="No family discoveries are recorded yet. Add relatives and present conditions to start building family context."
            />
          </article>
        </div>

        <article className="data-card">
          <p className="eyebrow">{openQuestions.label}</p>
          <h3>{openQuestions.description}</h3>
          <TimelineSectionList
            items={openQuestions.items}
            emptyMessage="No open questions right now. The current profile has enough detail to carry forward without obvious follow-up prompts."
          />
        </article>
      </div>

      <aside className="summary-side-column">
        <article className="data-card">
          <p className="eyebrow">How to use it</p>
          <ul className="clean-list compact-list">
            <li>Use `Recent changes` to show what the patient added or updated most recently.</li>
            <li>Use `Durable facts` as the compact memory layer that should keep following the patient into future visits.</li>
            <li>Use `Family discoveries` to separate patient facts from family-history findings.</li>
            <li>Use `Open questions` to show where MedCanon or a clinician should ask one more question instead of guessing.</li>
          </ul>
        </article>

        <article className="data-card">
          <p className="eyebrow">Context freshness</p>
          <dl className="profile-facts">
            <div>
              <dt>Latest draft update</dt>
              <dd>{formatTimestamp(profile.updatedAt)}</dd>
            </div>
            <div>
              <dt>Tracked relatives</dt>
              <dd>{getTrackedMembers(profile).length}</dd>
            </div>
            <div>
              <dt>Patient memory items</dt>
              <dd>{artifact.patientContextCounts.total}</dd>
            </div>
            <div>
              <dt>Visit goal</dt>
              <dd>{profile.personal.visitGoal || 'Not set'}</dd>
            </div>
          </dl>
        </article>

        <article className="data-card">
          <p className="eyebrow">Profile snapshot</p>
          <dl className="profile-facts">
            <div>
              <dt>Profile name</dt>
              <dd>{profile.personal.nameOrLabel || 'Not set'}</dd>
            </div>
            <div>
              <dt>Age range</dt>
              <dd>{profile.personal.ageRange || 'Not set'}</dd>
            </div>
            <div>
              <dt>Reason for starting</dt>
              <dd>{profile.personal.reasonForStarting || 'Not set'}</dd>
            </div>
            <div>
              <dt>Main worry</dt>
              <dd>{profile.personal.healthWorries || 'Not set'}</dd>
            </div>
          </dl>
        </article>
      </aside>
    </div>
  );
}

function TimelineSectionList({
  items,
  emptyMessage,
}: {
  items: SummaryArtifact['memoryTimeline']['sections'][number]['items'];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="muted-copy">{emptyMessage}</p>;
  }

  return (
    <div className="timeline-list">
      {items.map((item) => (
        <div key={item.id} className="timeline-item">
          <div className="timeline-rail">
            <span className={`timeline-dot ${item.status}`} />
          </div>
          <article className="handoff-signal-card timeline-card">
            <div className="question-card-top">
              <span className="cluster-tag">{formatTimestamp(item.timestamp)}</span>
              <span className={`cluster-tag ${item.status === 'needs_followup' ? 'warning-chip' : item.status === 'open_question' ? 'muted-chip' : ''}`}>
                {formatTimelineStatus(item.status)}
              </span>
            </div>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
            <div className="chip-row">
              {item.tags.slice(0, 4).map((tag) => (
                <span key={`${item.id}-${tag}`} className="chip">
                  {tag.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </article>
        </div>
      ))}
    </div>
  );
}

function MedCanonHandoffTab({
  handoff,
  visitMode,
  setVisitMode,
}: {
  handoff: MedCanonHandoffPackage;
  visitMode: VisitMode;
  setVisitMode: (visitMode: VisitMode) => void;
}) {
  return (
    <div className="summary-grid handoff-grid">
      <div className="summary-main-column">
        <article className="data-card">
          <p className="eyebrow">Visit focus</p>
          <div className="graph-filter-row">
            {VISIT_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`summary-tab mini-tab ${visitMode === option.value ? 'active' : ''}`}
                onClick={() => setVisitMode(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <h3>{handoff.visit_focus.label}</h3>
          <p className="muted-copy">{handoff.visit_focus.summary}</p>
          <div className="chip-row">
            {handoff.visit_focus.priority_labels.map((label) => (
              <span key={label} className="chip">
                {label}
              </span>
            ))}
          </div>
        </article>

        <article className="data-card accent-card handoff-hero-card">
          <p className="eyebrow">MedCanon-ready handoff</p>
          <h3>{handoff.profile_brief}</h3>
          <p className="muted-copy">{handoff.package_purpose}</p>
          <div className="chip-row">
            {handoff.family_snapshot.notable_clusters.length === 0 ? (
              <span className="chip muted-chip">No notable clusters yet</span>
            ) : (
              handoff.family_snapshot.notable_clusters.map((cluster) => (
                <span key={cluster} className="chip">
                  {cluster}
                </span>
              ))
            )}
          </div>
          <div className="snapshot-grid">
            <div className="snapshot-card">
              <span>Tracked relatives</span>
              <strong>{handoff.family_snapshot.tracked_relative_count}</strong>
            </div>
            <div className="snapshot-card">
              <span>First-degree flags</span>
              <strong>{handoff.family_snapshot.first_degree_flag_count}</strong>
            </div>
            <div className="snapshot-card">
              <span>Durable facts</span>
              <strong>{handoff.family_snapshot.durable_fact_count}</strong>
            </div>
            <div className="snapshot-card">
              <span>Ready to share</span>
              <strong>{handoff.family_snapshot.ready_to_share_fact_count}</strong>
            </div>
            <div className="snapshot-card">
              <span>Need review</span>
              <strong>{handoff.family_snapshot.needs_followup_fact_count}</strong>
            </div>
            <div className="snapshot-card">
              <span>Recent changes</span>
              <strong>{handoff.family_snapshot.recent_change_count}</strong>
            </div>
            <div className="snapshot-card">
              <span>Context entries</span>
              <strong>{handoff.clinical_context.length}</strong>
            </div>
            <div className="snapshot-card">
              <span>Open follow-ups</span>
              <strong>{handoff.open_questions.length}</strong>
            </div>
          </div>
          <p className="muted-copy">Generated from the latest saved context draft at {formatTimestamp(handoff.generated_at)}.</p>
        </article>

        <article className="data-card">
          <p className="eyebrow">Durable facts</p>
          {handoff.durable_facts.length === 0 ? (
            <p className="muted-copy">No durable facts have been packaged yet. Add patient memory or family-history items to make the handoff more useful.</p>
          ) : (
            <div className="handoff-signal-stack">
              {handoff.durable_facts.map((fact) => (
                <div key={fact.id} className="handoff-signal-card">
                  <div className="question-card-top">
                    <span className="cluster-tag">{fact.domain.replace(/_/g, ' ')}</span>
                    <span className={`cluster-tag ${fact.review_required ? 'warning-chip' : ''}`}>
                      {fact.review_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h4>{fact.label}</h4>
                  <p>{fact.value}</p>
                  <p className="muted-copy">{fact.relevance_reason}</p>
                  <div className="chip-row">
                    <span className="chip">{fact.source.replace(/_/g, ' ')}</span>
                    <span className="chip">{fact.confidence} confidence</span>
                    {fact.tags.slice(0, 3).map((tag) => (
                      <span key={`${fact.id}-${tag}`} className="chip">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="data-card">
          <p className="eyebrow">Clinician-facing family signals</p>
          {handoff.family_history_flags.length === 0 ? (
            <p className="muted-copy">No family-history flags have been packaged yet. Add relatives and conditions to make the handoff more useful.</p>
          ) : (
            <div className="handoff-signal-stack">
              {handoff.family_history_flags.map((signal) => (
                <div key={signal.id} className="handoff-signal-card">
                  <div className="question-card-top">
                    <span className="cluster-tag">{signal.degree}</span>
                    <span className="cluster-tag" style={{ color: CLUSTERS[signal.cluster_id].color }}>
                      {signal.cluster}
                    </span>
                  </div>
                  <h4>{signal.relative}</h4>
                  <p>{signal.handoff_line}</p>
                  <p className="muted-copy">{signal.relevance_reason}</p>
                  <div className="chip-row">
                    <span className="chip">{signal.source.replace(/_/g, ' ')}</span>
                    <span className="chip">{signal.confidence} confidence</span>
                    <span className={`chip ${signal.review_required ? 'warning-chip' : ''}`}>
                      {signal.review_status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="data-card">
          <p className="eyebrow">Recent changes</p>
          {handoff.recent_changes.length === 0 ? (
            <p className="muted-copy">No recent changes have been packaged yet.</p>
          ) : (
            <div className="handoff-signal-stack">
              {handoff.recent_changes.map((change) => (
                <div key={change.id} className="handoff-signal-card">
                  <div className="question-card-top">
                    <span className="cluster-tag">{change.domain.replace(/_/g, ' ')}</span>
                    <span className={`cluster-tag ${change.review_required ? 'warning-chip' : ''}`}>
                      {change.review_required ? 'needs review' : formatTimestamp(change.changed_at)}
                    </span>
                  </div>
                  <h4>{change.label}</h4>
                  <p>{change.summary}</p>
                  <p className="muted-copy">Relevance score {change.relevance_score}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="data-card">
          <p className="eyebrow">MedCanon `clinical_context`</p>
          <div className="context-entry-list">
            {handoff.clinical_context.map((entry) => (
              <article key={`${entry.type}-${entry.source_id ?? entry.value}`} className="context-entry-card">
                <div className="context-entry-top">
                  <span className="context-type-pill">{entry.type}</span>
                  <span className="cluster-tag">{entry.status.replace(/_/g, ' ')}</span>
                </div>
                <h4>{entry.label || entry.type}</h4>
                <p>{entry.value}</p>
                <div className="context-entry-meta">
                  <span>origin: {entry.origin}</span>
                  <span>review: {entry.review_required ? 'required' : 'not required'}</span>
                </div>
                <div className="chip-row">
                  {entry.tags.map((tag) => (
                    <span key={`${entry.source_id ?? entry.type}-${tag}`} className="chip">
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </article>

        <article className="data-card">
          <p className="eyebrow">Raw JSON package</p>
          <pre className="code-block">{JSON.stringify(handoff, null, 2)}</pre>
        </article>
      </div>

      <aside className="summary-side-column">
        <article className="data-card">
          <p className="eyebrow">Handoff notes</p>
          <ul className="clean-list compact-list">
            <li>This package is structured around `profile_brief`, `durable_facts`, `recent_changes`, `open_questions`, and downstream `clinical_context`.</li>
            <li>The selected visit mode changes which facts rise to the top and which context entries MedCanon sees first.</li>
            {handoff.guardrails.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </article>

        <article className="data-card">
          <p className="eyebrow">Visit scenarios</p>
          <div className="scenario-stack">
            {handoff.visit_scenarios.map((scenario) => (
              <article key={scenario.id} className="scenario-card">
                <h4>{scenario.title}</h4>
                <p className="scenario-prompt">Patient says: “{scenario.patient_prompt}”</p>
                <p>{scenario.why_context_matters}</p>
                <p className="muted-copy">MedCanon goal: {scenario.medcanon_goal}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="data-card">
          <p className="eyebrow">Open questions still worth carrying</p>
          {handoff.open_questions.length === 0 ? (
            <p className="muted-copy">No major follow-up questions are currently packaged.</p>
          ) : (
            <div className="question-list-stack">
              {handoff.open_questions.map((question) => (
                <article key={question.id} className="question-card">
                  <div className="question-card-top">
                    <span className={`priority-badge ${question.priority}`}>{question.priority}</span>
                    <span className="cluster-tag" style={{ color: CLUSTERS[question.cluster].color }}>
                      {CLUSTERS[question.cluster].label}
                    </span>
                  </div>
                  <h4>{question.prompt}</h4>
                  <p>{question.reason}</p>
                  <p className="muted-copy">{question.relevance_reason}</p>
                </article>
              ))}
            </div>
          )}
        </article>
      </aside>
    </div>
  );
}

function FamilyGraphTab({
  profile,
  selectedMemberId,
  setSelectedMemberId,
  activeGraphCluster,
  setActiveGraphCluster,
}: {
  profile: FamilyHistoryProfile;
  selectedMemberId: string;
  setSelectedMemberId: (memberId: string) => void;
  activeGraphCluster: GraphClusterFilter;
  setActiveGraphCluster: (clusterId: GraphClusterFilter) => void;
}) {
  const activeMembers = getTrackedMembers(profile);
  const selectedMember = activeMembers.find((member) => member.id === selectedMemberId) ?? activeMembers[0];

  const center = { x: 340, y: 332 };
  const clusterAnchorX = 1080;
  const clusterStartY = 118;
  const positions = layoutFamilyMembers(activeMembers, center);
  const clusterPositions = new Map(
    CLUSTER_ORDER.map((clusterId, index) => [clusterId, { x: clusterAnchorX, y: clusterStartY + index * 88 }]),
  );

  const memberClusters = new Map<string, ClusterId[]>();
  for (const member of activeMembers) {
    const clusters = new Set<ClusterId>();
    for (const fact of profile.facts.filter((entry) => entry.memberId === member.id && entry.status === 'present')) {
      clusters.add(CONDITIONS_BY_ID[fact.conditionId].cluster);
    }
    memberClusters.set(member.id, [...clusters]);
  }

  const filteredClusterMembers =
    activeGraphCluster === 'all'
      ? activeMembers
      : activeMembers.filter((member) => memberClusters.get(member.id)?.includes(activeGraphCluster));

  const clusterTitle = activeGraphCluster === 'all' ? 'All clusters' : CLUSTERS[activeGraphCluster].label;

  return (
    <div className="graph-layout">
      <div className="graph-card data-card">
        <div className="graph-filter-row">
          {GRAPH_CLUSTER_FILTERS.map((clusterId) => (
            <button
              key={clusterId}
              className={`summary-tab mini-tab ${activeGraphCluster === clusterId ? 'active' : ''}`}
              onClick={() => setActiveGraphCluster(clusterId)}
            >
              {clusterId === 'all' ? 'All clusters' : CLUSTERS[clusterId].label}
            </button>
          ))}
        </div>
        <svg viewBox="0 0 1320 700" className="family-graph-svg" role="img" aria-label="Family graph and cluster graph">
          <defs>
            <filter id="softShadow">
              <feDropShadow dx="0" dy="10" stdDeviation="10" floodOpacity="0.12" />
            </filter>
          </defs>
          <circle cx={center.x} cy={center.y} r="190" className="ring ring-first" />
          <circle cx={center.x} cy={center.y} r="330" className="ring ring-second" />
          <g transform={`translate(${center.x}, ${center.y})`} filter="url(#softShadow)">
            <circle r="54" className="self-node" />
            <text y="-6" textAnchor="middle" className="node-label primary invert-text">
              {profile.personal.nameOrLabel || 'You'}
            </text>
            <text y="18" textAnchor="middle" className="node-label secondary invert-text-secondary">
              Center node
            </text>
          </g>

          {CLUSTER_ORDER.map((clusterId) => {
            const position = clusterPositions.get(clusterId)!;
            const cluster = CLUSTERS[clusterId];
            const selected = activeGraphCluster === clusterId;
            const dimmed = activeGraphCluster !== 'all' && activeGraphCluster !== clusterId;
              return (
                <g key={clusterId} className={`cluster-node-group ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`} onClick={() => setActiveGraphCluster(clusterId)}>
                  <rect
                    x={position.x - 90}
                    y={position.y - 30}
                    width="180"
                    height="60"
                    rx="18"
                    fill={cluster.accent}
                    stroke={selected ? cluster.color : '#cedaf0'}
                  strokeWidth={selected ? 2.8 : 1.4}
                />
                <text x={position.x} y={position.y - 2} textAnchor="middle" className="cluster-node-label" fill={cluster.color}>
                  {cluster.label}
                </text>
                <text x={position.x} y={position.y + 16} textAnchor="middle" className="cluster-node-subtext">
                  {profile.facts.filter((fact) => fact.status === 'present' && CONDITIONS_BY_ID[fact.conditionId].cluster === clusterId).length} signals
                </text>
              </g>
            );
          })}

          {[...positions.entries()].flatMap(([memberId, point]) => {
            const clusters = memberClusters.get(memberId) ?? [];
            return clusters.map((clusterId) => {
              const cluster = CLUSTERS[clusterId];
              const clusterPoint = clusterPositions.get(clusterId)!;
              const visible = activeGraphCluster === 'all' || activeGraphCluster === clusterId;
              return (
                <path
                  key={`${memberId}-${clusterId}`}
                  d={`M ${point.x} ${point.y} C ${point.x + 120} ${point.y}, ${clusterPoint.x - 120} ${clusterPoint.y}, ${clusterPoint.x - 80} ${clusterPoint.y}`}
                  className={`cluster-link ${visible ? '' : 'dimmed'}`}
                  stroke={cluster.color}
                />
              );
            });
          })}

          {[...positions.entries()].map(([memberId, point]) => {
            const member = activeMembers.find((entry) => entry.id === memberId)!;
            const clusters = memberClusters.get(member.id) ?? [];
            const selected = selectedMember?.id === member.id;
            const highlighted = activeGraphCluster === 'all' || clusters.includes(activeGraphCluster);

            return (
              <g key={member.id} className={`graph-node-group ${highlighted ? '' : 'dimmed'}`} onClick={() => setSelectedMemberId(member.id)}>
                <line x1={center.x} y1={center.y} x2={point.x} y2={point.y} className="graph-link" />
                <g transform={`translate(${point.x}, ${point.y})`} filter="url(#softShadow)">
                  <circle r="38" className={`graph-node ${selected ? 'selected' : ''}`} />
                  <text y="-2" textAnchor="middle" className="node-label primary">
                    {truncateLabel(member.nameOptional?.trim() || member.displayLabel, 15)}
                  </text>
                  <text y="18" textAnchor="middle" className="node-label secondary">
                    {member.degree === 'first' ? 'First-degree' : 'Second-degree'}
                  </text>
                </g>
                {clusters.slice(0, 2).map((clusterId, index) => {
                  const cluster = CLUSTERS[clusterId];
                  return (
                    <g key={`${member.id}-${clusterId}-chip`}>
                      <rect x={point.x + 46} y={point.y - 18 + index * 24} rx="12" ry="12" width="92" height="20" fill={cluster.accent} />
                      <text x={point.x + 55} y={point.y - 4 + index * 24} className="graph-chip-text">
                        {cluster.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="graph-detail-grid">
        <article className="data-card">
          <p className="eyebrow">Active cluster</p>
          <h3>{clusterTitle}</h3>
          <p className="muted-copy">
            {activeGraphCluster === 'all'
              ? 'Showing the entire family graph and all cluster connections.'
              : CLUSTERS[activeGraphCluster].whyItMatters}
          </p>
          <div className="chip-row">
            {filteredClusterMembers.length === 0 ? (
              <span className="chip muted-chip">No relatives linked to this cluster yet</span>
            ) : (
              filteredClusterMembers.map((member) => (
                <button key={`side-${member.id}`} className="chip interactive-chip" onClick={() => setSelectedMemberId(member.id)}>
                  {member.nameOptional?.trim() || member.displayLabel}
                </button>
              ))
            )}
          </div>
        </article>
        <article className="data-card">
          <p className="eyebrow">Selected relative</p>
          {selectedMember ? (
            <>
              <h3>{selectedMember.nameOptional?.trim() || selectedMember.displayLabel}</h3>
              <p className="muted-copy">
                {selectedMember.degree === 'first' ? 'First-degree' : 'Second-degree'} relative · {selectedMember.branch} branch
              </p>
              <div className="selected-condition-list">
                {profile.facts.filter((fact) => fact.memberId === selectedMember.id && fact.status === 'present').length === 0 ? (
                  <p className="muted-copy">No known conditions marked yet for this person.</p>
                ) : (
                  profile.facts
                    .filter((fact) => fact.memberId === selectedMember.id && fact.status === 'present')
                    .map((fact) => {
                      const condition = CONDITIONS_BY_ID[fact.conditionId];
                      return (
                        <div key={fact.id} className="selected-condition-item">
                          <span className="cluster-tag" style={{ color: CLUSTERS[condition.cluster].color }}>
                            {CLUSTERS[condition.cluster].label}
                          </span>
                          <strong>{condition.label}</strong>
                          <span>{fact.ageAtOnset ? `Age ${fact.ageAtOnset}` : 'Age not yet recorded'}</span>
                        </div>
                      );
                    })
                )}
              </div>
            </>
          ) : (
            <p className="muted-copy">Add relatives to populate the family graph.</p>
          )}
        </article>
      </div>
    </div>
  );
}

function ClusterTab({ profile, artifact }: { profile: FamilyHistoryProfile; artifact: SummaryArtifact }) {
  return <ConditionClusterGraph profile={profile} artifact={artifact} />;
}

function QuestionsTab({ artifact }: { artifact: SummaryArtifact }) {
  return (
    <div className="cluster-card-grid question-cluster-grid">
      {CLUSTER_ORDER.map((clusterId) => {
        const grouped = artifact.missingQuestions.filter((question) => question.cluster === clusterId);
        const cluster = CLUSTERS[clusterId];
        return (
          <article key={clusterId} className="cluster-insight-card data-card">
            <div className="cluster-card-top">
              <div>
                <div className="cluster-badge" style={{ background: cluster.accent, color: cluster.color }}>
                  {cluster.label}
                </div>
                <h3>{grouped.length === 0 ? 'No open prompts in this cluster' : `${grouped.length} question${grouped.length === 1 ? '' : 's'} to ask next`}</h3>
              </div>
            </div>
            {grouped.length === 0 ? (
              <p className="muted-copy">Nothing urgent to ask next in this cluster.</p>
            ) : (
              <div className="question-list-stack">
                {grouped.map((question) => (
                  <MissingQuestionCard key={question.id} question={question} />)
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function layoutRing(
  members: FamilyMember[],
  radius: number,
  center: { x: number; y: number },
  startAngle: number,
  endAngle: number,
): Array<[string, { x: number; y: number }]> {
  if (members.length === 0) {
    return [];
  }

  if (members.length === 1) {
    const angle = ((startAngle + endAngle) / 2) * (Math.PI / 180);
    return [[members[0].id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }]];
  }

  return members.map((member, index) => {
    const ratio = index / (members.length - 1);
    const angle = (startAngle + (endAngle - startAngle) * ratio) * (Math.PI / 180);
    return [member.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }] as const;
  });
}

function layoutFamilyMembers(
  members: FamilyMember[],
  center: { x: number; y: number },
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const firstRadius = 190;
  const secondRadius = 330;

  const firstAngleByRelationship: Partial<Record<FamilyMember['relationship'], number>> = {
    mother: -138,
    father: -14,
  };

  const secondAngleByRelationship: Partial<Record<FamilyMember['relationship'], number>> = {
    maternal_grandmother: -164,
    maternal_grandfather: -106,
    paternal_grandmother: 104,
    paternal_grandfather: 162,
  };

  const siblings = members.filter((member) => member.relationship === 'sibling');
  const siblingPositions = distributeAngles(siblings.length, 118, 158);
  siblings.forEach((member, index) => {
    positions.set(member.id, polarToPoint(center, firstRadius, siblingPositions[index]));
  });

  for (const member of members) {
    if (positions.has(member.id)) {
      continue;
    }

    if (member.degree === 'first') {
      const angle = firstAngleByRelationship[member.relationship] ?? -72;
      positions.set(member.id, polarToPoint(center, firstRadius, angle));
      continue;
    }

    if (member.degree === 'second') {
      const angle = secondAngleByRelationship[member.relationship] ?? 140;
      positions.set(member.id, polarToPoint(center, secondRadius, angle));
    }
  }

  return positions;
}

function distributeAngles(count: number, start: number, end: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (count === 1) {
    return [(start + end) / 2];
  }

  return Array.from({ length: count }, (_, index) => start + ((end - start) * index) / (count - 1));
}

function polarToPoint(center: { x: number; y: number }, radius: number, angleDegrees: number): { x: number; y: number } {
  const angle = angleDegrees * (Math.PI / 180);
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function truncateLabel(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function formatTimestamp(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return 'draft active';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatTimelineStatus(status: SummaryArtifact['memoryTimeline']['sections'][number]['items'][number]['status']): string {
  if (status === 'ready_to_share') {
    return 'ready to share';
  }
  if (status === 'needs_followup') {
    return 'needs follow-up';
  }
  return 'open question';
}

export default App;
