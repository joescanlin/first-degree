import { useEffect, useMemo, useRef, useState } from 'react';
import logo from '../assets/first-degree-logo.svg';
import {
  AGE_RANGES,
  countAnsweredFactsForMember,
  countPresentFactsForMember,
  createBlankProfile,
  createSibling,
  getFact,
  getTrackedMembers,
  parseProfile,
  touchProfile,
  type FamilyHistoryProfile,
  type FamilyMember,
  type FactStatus,
  type StepId,
} from './lib/profile';
import { SAMPLE_PROFILES } from './lib/samples';
import { clearSavedProfile, loadProfile, saveProfile } from './lib/storage';
import { buildMedCanonHandoffPackage, type MedCanonHandoffPackage } from './lib/handoff';
import { buildDoctorNote, buildSummaryArtifact, type MissingQuestion, type SummaryArtifact } from './lib/summary';
import { ClusterKnowledgeWorkbench, ClusterSignalBars, ConditionClusterGraph } from './lib/visuals';
import { CLUSTERS, CLUSTER_ORDER, CONDITIONS, CONDITIONS_BY_ID, type ClusterId, type ConditionId } from './lib/taxonomy';

const STEP_ORDER: StepId[] = ['intro', 'about-you', 'family-members', 'conditions', 'missing-details', 'summary'];
const SUMMARY_TABS = ['overview', 'handoff', 'graph', 'clusters', 'questions'] as const;
const GRAPH_CLUSTER_FILTERS = ['all', ...CLUSTER_ORDER] as const;
const FEATURED_DEMO_SAMPLE_ID = 'medcanon-demo';

type SummaryTab = (typeof SUMMARY_TABS)[number];
type GraphClusterFilter = (typeof GRAPH_CLUSTER_FILTERS)[number];

const SUMMARY_TAB_LABELS: Record<SummaryTab, string> = {
  overview: 'Overview',
  handoff: 'MedCanon Handoff',
  graph: 'Family Graph',
  clusters: 'Condition Clusters',
  questions: 'Questions',
};

function App() {
  const [profile, setProfile] = useState<FamilyHistoryProfile>(() => loadProfile());
  const [step, setStep] = useState<StepId>('intro');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [summaryTab, setSummaryTab] = useState<SummaryTab>('overview');
  const [activeGraphCluster, setActiveGraphCluster] = useState<GraphClusterFilter>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const trackedMembers = useMemo(() => getTrackedMembers(profile), [profile]);
  const artifact = useMemo(() => buildSummaryArtifact(profile), [profile]);
  const doctorNote = useMemo(() => buildDoctorNote(profile, artifact), [profile, artifact]);
  const medCanonHandoff = useMemo(() => buildMedCanonHandoffPackage(profile, artifact), [profile, artifact]);
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
      const nextFacts = existing
        ? current.facts.map((fact) =>
            fact.id === existing.id
              ? {
                  ...fact,
                  status,
                  ageAtOnset: status === 'present' ? fact.ageAtOnset : '',
                }
              : fact,
          )
        : [
            ...current.facts,
            {
              id: `${memberId}-${conditionId}`,
              memberId,
              conditionId,
              status,
              ageAtOnset: '',
            },
          ];

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
          nextFacts = nextFacts.map((fact) =>
            fact.id === existing.id
              ? {
                  ...fact,
                  status,
                  ageAtOnset: status === 'present' ? fact.ageAtOnset : '',
                }
              : fact,
          );
        } else {
          nextFacts.push({
            id: `${memberId}-${conditionId}`,
            memberId,
            conditionId,
            status,
            ageAtOnset: '',
          });
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
        facts: current.facts.map((fact) => (fact.id === existing.id ? { ...fact, ageAtOnset } : fact)),
      });
    });
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
            <p className="eyebrow">Family health context workspace</p>
            <h1>Build a family history you can actually use</h1>
            <p className="lede">
              Start with parents, siblings, and grandparents. Capture what you know, surface what is missing, and turn it into a clear health-context artifact.
            </p>
          </div>
        </div>
        <div className="header-chip-panel">
          <MetricChip label="Tracked relatives" value={trackedMembers.length.toString()} />
          <MetricChip label="Known condition flags" value={(artifact.firstDegreeFlags.length + artifact.secondDegreeFlags.length).toString()} />
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
                <h2>Most family history lives in memory, not in charts.</h2>
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
              title="About you"
              description="This is just enough context to personalize the summary and the final artifact."
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
                title="Family graph, clustered patterns, and clinician-ready artifacts"
                description="This view is intentionally information-dense and more scientific than a typical consumer wellness UI."
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
            {summaryTab === 'handoff' ? <MedCanonHandoffTab handoff={medCanonHandoff} /> : null}
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

function ConditionClusterEditor({
  clusterId,
  member,
  profile,
  setFactStatus,
  setFactAge,
  bulkSetCluster,
  clearCluster,
}: {
  clusterId: ClusterId;
  member: FamilyMember;
  profile: FamilyHistoryProfile;
  setFactStatus: (memberId: string, conditionId: ConditionId, status: FactStatus) => void;
  setFactAge: (memberId: string, conditionId: ConditionId, ageAtOnset: string) => void;
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

  return (
    <div className="overview-layout">
      <div className="metric-grid">
        <MetricCard label="First-degree flags" value={artifact.firstDegreeFlags.length} />
        <MetricCard label="Second-degree flags" value={artifact.secondDegreeFlags.length} />
        <MetricCard label="Cluster signals" value={clusterSignals.length} />
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

function MedCanonHandoffTab({ handoff }: { handoff: MedCanonHandoffPackage }) {
  return (
    <div className="summary-grid handoff-grid">
      <div className="summary-main-column">
        <article className="data-card accent-card handoff-hero-card">
          <p className="eyebrow">MedCanon-ready handoff</p>
          <h3>{handoff.clinician_brief}</h3>
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
              <span>Context entries</span>
              <strong>{handoff.medcanon_clinical_context.length}</strong>
            </div>
            <div className="snapshot-card">
              <span>Open follow-ups</span>
              <strong>{handoff.open_questions.length}</strong>
            </div>
          </div>
          <p className="muted-copy">Generated from the latest saved family-history draft at {formatTimestamp(handoff.generated_at)}.</p>
        </article>

        <article className="data-card">
          <p className="eyebrow">Clinician-facing family signals</p>
          {handoff.salient_family_history.length === 0 ? (
            <p className="muted-copy">No family-history flags have been packaged yet. Add relatives and conditions to make the handoff more useful.</p>
          ) : (
            <div className="handoff-signal-stack">
              {handoff.salient_family_history.map((signal) => (
                <div key={signal.id} className="handoff-signal-card">
                  <div className="question-card-top">
                    <span className="cluster-tag">{signal.degree}</span>
                    <span className="cluster-tag" style={{ color: CLUSTERS[signal.cluster_id].color }}>
                      {signal.cluster}
                    </span>
                  </div>
                  <h4>{signal.relative}</h4>
                  <p>{signal.handoff_line}</p>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="data-card">
          <p className="eyebrow">MedCanon `clinical_context`</p>
          <div className="context-entry-list">
            {handoff.medcanon_clinical_context.map((entry) => (
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
            <li>This is the compact package First Degree would hand to MedCanon, not the full raw family graph.</li>
            {handoff.guardrails.map((guardrail) => (
              <li key={guardrail}>{guardrail}</li>
            ))}
          </ul>
        </article>

        <article className="data-card">
          <p className="eyebrow">Visit scenarios</p>
          <div className="scenario-stack">
            {handoff.encounter_scenarios.map((scenario) => (
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
                    <span className="cluster-tag">Family detail</span>
                  </div>
                  <h4>{question.prompt}</h4>
                  <p>{question.reason}</p>
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

export default App;
