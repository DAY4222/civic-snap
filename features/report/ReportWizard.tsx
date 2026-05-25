import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import MapView, { type Region } from '@/components/CivicMap';
import {
  Button,
  Card,
  Field,
  Notice,
  Screen,
  StickyActionBar,
  colors,
  radius,
} from '@/components/ui';
import {
  getSuggestedAnswerOptions,
  toggleMultiAnswer,
} from '@/lib/issueSuggestions';
import {
  CategoryQuestion,
  IssueCategory,
  PhotoIssueCandidate,
  PhotoVisionResult,
} from '@/lib/types';

import {
  GENERAL_CATEGORY,
  PhotoVisionStatus,
  ReportWizardStep,
} from './reportWizardState';
import { RACCOON_SWEEPER_FRAMES, useReportWizard } from './useReportWizard';

export function ReportWizard() {
  const { resumeId } = useLocalSearchParams<{ resumeId?: string }>();
  const wizard = useReportWizard(resumeId);
  const { actions, category, email, manualCategory, state } = wizard;
  const stickyFooter =
    state.step === 'details' ? (
      <StickyActionBar>
        <Button
          disabled={state.busy}
          loading={state.busy}
          onPress={actions.previewEmail}
          title="Preview email"
        />
      </StickyActionBar>
    ) : state.step === 'preview' ? (
      <StickyActionBar>
        <Button
          disabled={state.busy || !state.savedReportId}
          onPress={actions.openMail}
          title="Open Mail"
        />
      </StickyActionBar>
    ) : null;

  return (
    <View style={styles.root}>
      <Screen stickyFooter={stickyFooter}>
        {state.savedBannerId ? (
          <View style={styles.banner}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Report saved</Text>
              <Text style={styles.muted}>Mail was opened. Tracking is local.</Text>
            </View>
            <Button
              onPress={() =>
                router.push({ pathname: '/report/[id]', params: { id: state.savedBannerId } })
              }
              style={styles.bannerButton}
              textStyle={styles.bannerButtonText}
              title="View"
            />
          </View>
        ) : null}
        {state.step !== 'start' ? <Progress currentStep={state.step} /> : null}

        {state.step === 'start' ? (
          <StartStep
            busy={state.busy}
            frameIndex={wizard.raccoonFrameIndex}
            onChoosePhoto={actions.choosePhoto}
            onChooseIssueType={() => actions.openCategory('location')}
            onReportWithoutPhoto={actions.reportWithoutPhoto}
            onTakePhoto={actions.takePhoto}
          />
        ) : null}

        {state.step === 'category' ? (
          <CategoryStep
            filteredIssueCategories={wizard.filteredIssueCategories}
            issueSearchQuery={state.issueSearchQuery}
            onBack={actions.backFromCategory}
            onChooseCategory={actions.chooseCategory}
            onSearchChange={actions.setIssueSearchQuery}
            selectedCategoryId={state.selectedCategoryId}
          />
        ) : null}

        {state.step === 'location' ? (
          <LocationStep
            address={state.address}
            busy={state.busy}
            locationNote={state.locationNote}
            onAddressChange={actions.setAddress}
            onBack={actions.backFromLocation}
            onContinue={() => actions.setStep('details')}
            onLocationNoteChange={actions.setLocationNote}
            onUseCurrentLocation={actions.useCurrentLocation}
            onUpdatePin={actions.updatePinFromMap}
            photoUri={state.photoUri}
            pinRegion={wizard.pinRegion}
          />
        ) : null}

        {state.step === 'details' ? (
          <DetailsStep
            answers={state.answers}
            category={category}
            currentIssueTitle={wizard.currentIssueTitle}
            description={state.description}
            descriptionPlaceholder={wizard.descriptionPlaceholder}
            manualCategory={manualCategory}
            onAnalyze={actions.analyzeCurrentPhoto}
            onBack={() => actions.setStep('location')}
            onDescriptionChange={actions.setDescription}
            onInsertSuggestedDescription={actions.insertSuggestedDescription}
            onOpenIssueSearch={() => actions.openCategory('details')}
            onSetAnswer={actions.setAnswer}
            onToggleTopic={actions.togglePhotoIssueTopic}
            photoLabelsEnabled={wizard.photoLabelsEnabled}
            photoUri={state.photoUri}
            photoVisionResult={state.photoVisionResult}
            photoVisionStatus={state.photoVisionStatus}
            selectedPhotoIssueTopic={state.selectedPhotoIssueTopic}
            topics={wizard.photoIssueSuggestions}
          />
        ) : null}

        {state.step === 'preview' ? (
          <PreviewStep
            dismissedContactPrompt={state.dismissedContactPrompt}
            emailBody={state.emailBody}
            emailRecipient={email.recipient}
            emailSubject={state.emailSubject}
            onBack={() => actions.setStep('details')}
            onDismissContactPrompt={actions.dismissContactPrompt}
            onEmailBodyChange={actions.setEmailBody}
            onEmailSubjectChange={actions.setEmailSubject}
            photoUri={state.photoUri}
            profile={state.profile}
          />
        ) : null}

        {state.step === 'fallback' ? (
          <FallbackStep
            onBack={() => actions.setStep('preview')}
            onCopyEmail={actions.copyEmail}
            onOpenMailto={actions.openMailto}
          />
        ) : null}
      </Screen>
      {state.busy ? (
        <View pointerEvents="none" style={styles.busyOverlay}>
          <ActivityIndicator />
        </View>
      ) : null}
    </View>
  );
}

function StartStep({
  busy,
  frameIndex,
  onChooseIssueType,
  onChoosePhoto,
  onReportWithoutPhoto,
  onTakePhoto,
}: {
  busy: boolean;
  frameIndex: number;
  onChooseIssueType: () => void;
  onChoosePhoto: () => void;
  onReportWithoutPhoto: () => void;
  onTakePhoto: () => void;
}) {
  return (
    <View style={styles.stack}>
      <View>
        <Text style={styles.eyebrow}>Civic Snap</Text>
        <View style={styles.raccoonStage}>
          <Image
            resizeMode="contain"
            source={RACCOON_SWEEPER_FRAMES[frameIndex]}
            style={styles.raccoonSprite}
          />
        </View>
        <Text style={styles.title}>Snap. Pin. Send to 311.</Text>
        <Text style={styles.subtitle}>Create a strong report in a few focused steps.</Text>
      </View>
      <Notice text="For emergencies or immediate danger, use emergency services instead of this app." />
      <Button
        disabled={busy}
        icon={<FontAwesome name="camera" size={22} color="#fff" />}
        onPress={onTakePhoto}
        title="Take photo"
      />
      <View style={styles.buttonRow}>
        <Button
          disabled={busy}
          onPress={onReportWithoutPhoto}
          style={styles.rowButton}
          title="Report without photo"
          variant="secondary"
        />
        <Button
          disabled={busy}
          onPress={onChoosePhoto}
          style={styles.rowButton}
          title="Choose photo"
          variant="secondary"
        />
      </View>
      <Button
        disabled={busy}
        onPress={onChooseIssueType}
        title="Choose issue type"
        variant="secondary"
      />
    </View>
  );
}

function CategoryStep({
  filteredIssueCategories,
  issueSearchQuery,
  onBack,
  onChooseCategory,
  onSearchChange,
  selectedCategoryId,
}: {
  filteredIssueCategories: IssueCategory[];
  issueSearchQuery: string;
  onBack: () => void;
  onChooseCategory: (categoryId: string | null) => void;
  onSearchChange: (value: string) => void;
  selectedCategoryId: string | null;
}) {
  return (
    <View style={styles.stack}>
      <Header title="Search issue types" onBack={onBack} />
      <Field
        label="Search"
        onChangeText={onSearchChange}
        placeholder="Example: pothole, graffiti, sidewalk"
        value={issueSearchQuery}
      />
      <Pressable onPress={() => onChooseCategory(null)}>
        <Card selected={selectedCategoryId == null}>
          <Text style={styles.cardTitle}>General 311 report</Text>
          <Text style={styles.muted}>Continue with a general 311 report.</Text>
        </Card>
      </Pressable>
      {filteredIssueCategories.map((item) => (
        <Pressable key={item.id} onPress={() => onChooseCategory(item.id)}>
          <Card selected={item.id === selectedCategoryId}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.muted}>{categorySourceMatchText(item)}</Text>
          </Card>
        </Pressable>
      ))}
      {filteredIssueCategories.length === 0 ? (
        <Text style={styles.muted}>No issue types found. Try a different search term.</Text>
      ) : null}
    </View>
  );
}

function LocationStep({
  address,
  busy,
  locationNote,
  onAddressChange,
  onBack,
  onContinue,
  onLocationNoteChange,
  onUpdatePin,
  onUseCurrentLocation,
  photoUri,
  pinRegion,
}: {
  address: string;
  busy: boolean;
  locationNote: string;
  onAddressChange: (value: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onLocationNoteChange: (value: string) => void;
  onUpdatePin: (region: Region) => void;
  onUseCurrentLocation: () => void;
  photoUri: string | null;
  pinRegion: Region | null;
}) {
  return (
    <View style={styles.stack}>
      <Header title="Confirm location" onBack={onBack} />
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photo} /> : null}
      <Button
        disabled={busy}
        loading={busy}
        onPress={onUseCurrentLocation}
        title="Use current location"
        variant="secondary"
      />
      <Field
        label="Address or nearest landmark"
        onChangeText={onAddressChange}
        placeholder="Example: outside library entrance"
        value={address}
      />
      {pinRegion ? (
        <View style={styles.pinCard}>
          <MapView style={styles.pinMap} region={pinRegion} onRegionChangeComplete={onUpdatePin} />
          <View pointerEvents="none" style={styles.centerPin}>
            <FontAwesome name="map-marker" size={38} color={colors.danger} />
          </View>
          <Text style={styles.mapHelp}>Move the map under the pin. The view is zoomed to about one block.</Text>
        </View>
      ) : (
        <Notice text="Use current location to place an adjustable pin, or enter the address manually." />
      )}
      <Field
        label="Location note"
        onChangeText={onLocationNoteChange}
        placeholder="Example: south curb, beside the park entrance"
        value={locationNote}
      />
      <Button onPress={onContinue} title="Use this spot" />
    </View>
  );
}

function DetailsStep({
  answers,
  category,
  currentIssueTitle,
  description,
  descriptionPlaceholder,
  manualCategory,
  onAnalyze,
  onBack,
  onDescriptionChange,
  onInsertSuggestedDescription,
  onOpenIssueSearch,
  onSetAnswer,
  onToggleTopic,
  photoLabelsEnabled,
  photoUri,
  photoVisionResult,
  photoVisionStatus,
  selectedPhotoIssueTopic,
  topics,
}: {
  answers: Record<string, string>;
  category: IssueCategory;
  currentIssueTitle: string;
  description: string;
  descriptionPlaceholder: string;
  manualCategory: IssueCategory | null;
  onAnalyze: () => void;
  onBack: () => void;
  onDescriptionChange: (value: string) => void;
  onInsertSuggestedDescription: (value: string) => void;
  onOpenIssueSearch: () => void;
  onSetAnswer: (questionId: string, value: string) => void;
  onToggleTopic: (topic: PhotoIssueCandidate) => void;
  photoLabelsEnabled: boolean;
  photoUri: string | null;
  photoVisionResult: PhotoVisionResult | null;
  photoVisionStatus: PhotoVisionStatus;
  selectedPhotoIssueTopic: PhotoIssueCandidate | null;
  topics: PhotoIssueCandidate[];
}) {
  return (
    <View style={styles.stack}>
      <Header title="Add details" onBack={onBack} />
      <Text style={styles.categoryTitle}>{currentIssueTitle}</Text>
      {photoLabelsEnabled && photoUri ? (
        <SuggestedTopicsPanel
          labels={photoVisionResult?.suggestedLabels ?? []}
          manualCategory={manualCategory}
          onAnalyze={onAnalyze}
          onOpenIssueSearch={onOpenIssueSearch}
          onToggleTopic={onToggleTopic}
          selectedTopic={selectedPhotoIssueTopic}
          status={photoVisionStatus}
          topics={topics}
        />
      ) : (
        <ManualIssuePanel manualCategory={manualCategory} onOpenIssueSearch={onOpenIssueSearch} />
      )}
      {selectedPhotoIssueTopic && photoUri ? (
        <EvidencePhoto
          photoUri={photoUri}
          result={photoVisionResult}
          selectedCandidate={selectedPhotoIssueTopic}
        />
      ) : null}
      {selectedPhotoIssueTopic?.suggestedDescription ? (
        <Pressable
          onPress={() => onInsertSuggestedDescription(selectedPhotoIssueTopic.suggestedDescription)}
          style={styles.suggestedSentence}>
          <Text style={styles.promptTitle}>Suggested sentence</Text>
          <Text style={styles.evidenceText}>{selectedPhotoIssueTopic.suggestedDescription}</Text>
          <Text style={styles.inlineActionText}>Insert sentence</Text>
        </Pressable>
      ) : null}
      <Field
        label="Short description"
        multiline
        onChangeText={onDescriptionChange}
        placeholder={descriptionPlaceholder}
        value={description}
      />
      {category.id !== GENERAL_CATEGORY.id ? (
        <>
          {category.questions.length > 0 ? <Text style={styles.sectionTitle}>Checklist</Text> : null}
          {category.questions.map((question) => (
            <QuestionField
              key={question.id}
              onChangeText={(value) => onSetAnswer(question.id, value)}
              question={question}
              selectedCandidate={selectedPhotoIssueTopic}
              value={answers[question.id] ?? ''}
            />
          ))}
          <Text style={styles.sectionTitle}>Useful observations</Text>
          {category.observations.map((observation) => (
            <View key={observation} style={styles.observationRow}>
              <FontAwesome name="check-circle" size={16} color={colors.primary} />
              <Text style={styles.observationText}>{observation}</Text>
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

function PreviewStep({
  dismissedContactPrompt,
  emailBody,
  emailRecipient,
  emailSubject,
  onBack,
  onDismissContactPrompt,
  onEmailBodyChange,
  onEmailSubjectChange,
  photoUri,
  profile,
}: {
  dismissedContactPrompt: boolean;
  emailBody: string;
  emailRecipient: string;
  emailSubject: string;
  onBack: () => void;
  onDismissContactPrompt: () => void;
  onEmailBodyChange: (value: string) => void;
  onEmailSubjectChange: (value: string) => void;
  photoUri: string | null;
  profile: { name: string; phone: string };
}) {
  return (
    <View style={styles.stack}>
      <Header title="Email preview" onBack={onBack} />
      <Notice text="This draft is saved locally as Draft. You still send it from your own email." />
      {(!profile.name.trim() || !profile.phone.trim()) && !dismissedContactPrompt ? (
        <Card style={styles.warningCard} tone="warning">
          <View style={styles.warningCardHeader}>
            <Text style={[styles.cardTitle, styles.warningCardTitle]}>Add contact info?</Text>
            <Pressable
              accessibilityLabel="Dismiss contact info prompt"
              accessibilityRole="button"
              hitSlop={10}
              onPress={onDismissContactPrompt}
              style={styles.dismissButton}>
              <FontAwesome name="times" size={16} color={colors.mutedStrong} />
            </Pressable>
          </View>
          <Text style={styles.muted}>311 may use it to follow up. You can still send this report without it.</Text>
          <Button
            onPress={() => router.push('/settings')}
            style={styles.smallButton}
            textStyle={styles.smallButtonText}
            title="Edit profile"
          />
        </Card>
      ) : null}
      <Card style={styles.emailBox}>
        <View style={styles.emailToRow}>
          <Text style={styles.emailToLabel}>To:</Text>
          <Text numberOfLines={1} style={styles.emailTo}>{emailRecipient}</Text>
        </View>
        <Field label="Subject" onChangeText={onEmailSubjectChange} value={emailSubject} />
        <Field label="Body" multiline onChangeText={onEmailBodyChange} value={emailBody} />
      </Card>
      <Text style={styles.muted}>{photoUri ? 'Photo will be attached.' : 'No photo attached.'}</Text>
    </View>
  );
}

function FallbackStep({
  onBack,
  onCopyEmail,
  onOpenMailto,
}: {
  onBack: () => void;
  onCopyEmail: () => void;
  onOpenMailto: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Header title="Mail unavailable" onBack={onBack} />
      <Notice
        text="The iOS mail composer is unavailable. Copy the draft, then attach the photo manually if needed."
        tone="warning"
      />
      <Button onPress={onCopyEmail} title="Copy email text" variant="secondary" />
      <Button onPress={onOpenMailto} title="Open mailto link" variant="secondary" />
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.headerRow}>
      <Pressable hitSlop={10} onPress={onBack}>
        <FontAwesome name="chevron-left" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={{ width: 18 }} />
    </View>
  );
}

function categorySourceMatchText(category: IssueCategory) {
  if (category.sourceMatchStatus === 'unmatched') {
    return 'No exact Toronto 311 source match; review before sending.';
  }

  if (category.sourceMatchStatus === 'ambiguous') {
    return 'Multiple exact Toronto 311 source matches; review before sending.';
  }

  return 'Use these prompts to shape your description.';
}

function Progress({ currentStep }: { currentStep: ReportWizardStep }) {
  const steps: { key: ReportWizardStep; label: string }[] = [
    { key: 'category', label: 'Issue' },
    { key: 'location', label: 'Pin' },
    { key: 'details', label: 'Details' },
    { key: 'preview', label: 'Email' },
  ];
  const currentIndex = Math.max(
    steps.findIndex((step) => step.key === (currentStep === 'fallback' ? 'preview' : currentStep)),
    0
  );

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressDotsRow}>
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isDone = index < currentIndex;

          return (
            <View key={step.key} style={styles.progressDotItem}>
              {index > 0 ? (
                <View
                  style={[
                    styles.progressConnector,
                    styles.progressConnectorLeft,
                    index <= currentIndex && styles.progressConnectorActive,
                  ]}
                />
              ) : null}
              {index < steps.length - 1 ? (
                <View
                  style={[
                    styles.progressConnector,
                    styles.progressConnectorRight,
                    index < currentIndex && styles.progressConnectorActive,
                  ]}
                />
              ) : null}
              <View style={[styles.progressDot, (isActive || isDone) && styles.progressDotActive]}>
                <Text style={[styles.progressNumber, (isActive || isDone) && styles.progressNumberActive]}>
                  {index + 1}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.progressLabelRow}>
        {steps.map((step, index) => {
          const isActive = index === currentIndex;

          return (
            <Text key={step.key} style={[styles.progressLabel, isActive && styles.progressLabelActive]}>
              {step.label}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

function QuestionField({
  onChangeText,
  question,
  selectedCandidate,
  value,
}: {
  onChangeText: (value: string) => void;
  question: CategoryQuestion;
  selectedCandidate: PhotoIssueCandidate | null;
  value: string;
}) {
  const suggestions = getSuggestedAnswerOptions(question, selectedCandidate);
  const selectedValues = value
    .split(', ')
    .map((item) => item.trim())
    .filter(Boolean);

  if (question.options.length > 0) {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{question.label}</Text>
        <View style={styles.optionWrap}>
          {question.options.map((option) => {
            const selected =
              question.answerType === 'multipicklist'
                ? selectedValues.includes(option.label)
                : value === option.label;
            const suggested = suggestions.some((suggestion) => suggestion.value === option.value);

            return (
              <Pressable
                key={option.value}
                onPress={() =>
                  onChangeText(
                    question.answerType === 'multipicklist'
                      ? toggleMultiAnswer(value, option)
                      : option.label
                  )
                }
                style={[
                  styles.optionChip,
                  selected && styles.optionChipSelected,
                  suggested && !selected && styles.optionChipSuggested,
                ]}>
                <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {suggestions.length > 0 ? (
          <Text style={styles.suggestionText}>
            Suggested by photo: {suggestions.map((option) => option.label).join(', ')}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <Field
      label={question.label}
      multiline={question.answerType === 'text'}
      onChangeText={onChangeText}
      placeholder={question.placeholder}
      value={value}
    />
  );
}

function EvidencePhoto({
  photoUri,
  result,
  selectedCandidate,
}: {
  photoUri: string;
  result: PhotoVisionResult | null;
  selectedCandidate: PhotoIssueCandidate;
}) {
  const aspectRatio =
    result?.image.width && result.image.height ? result.image.width / result.image.height : 4 / 3;

  return (
    <View style={[styles.evidencePhotoFrame, { aspectRatio }]}>
      <Image source={{ uri: photoUri }} resizeMode="stretch" style={styles.evidencePhoto} />
      {selectedCandidate.boundingBoxes.map((box) => (
        <View
          key={`${box.labelId}-${box.boundingBox.x}-${box.boundingBox.y}`}
          style={[
            styles.evidenceBox,
            {
              height: `${box.boundingBox.height * 100}%`,
              left: `${box.boundingBox.x * 100}%`,
              top: `${box.boundingBox.y * 100}%`,
              width: `${box.boundingBox.width * 100}%`,
            },
          ]}>
          <Text style={styles.evidenceBoxLabel}>{box.label}</Text>
        </View>
      ))}
    </View>
  );
}

function SuggestedTopicsPanel({
  labels,
  manualCategory,
  onAnalyze,
  onOpenIssueSearch,
  onToggleTopic,
  selectedTopic,
  status,
  topics,
}: {
  labels: PhotoVisionResult['suggestedLabels'];
  manualCategory: IssueCategory | null;
  onAnalyze: () => void;
  onOpenIssueSearch: () => void;
  onToggleTopic: (topic: PhotoIssueCandidate) => void;
  selectedTopic: PhotoIssueCandidate | null;
  status: PhotoVisionStatus;
  topics: PhotoIssueCandidate[];
}) {
  const showQuietFallback =
    status === 'empty' ||
    status === 'error' ||
    status === 'rate-limited' ||
    status === 'payload-too-large' ||
    (status === 'ready' && topics.length === 0);

  return (
    <Card style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Suggested issues</Text>
          <Text style={styles.muted}>Pick one if it matches, or search all issue types.</Text>
        </View>
        {status === 'loading' ? <ActivityIndicator /> : null}
      </View>
      {topics.map((topic) => {
        const selected = selectedTopic?.issueId === topic.issueId;

        return (
          <Pressable
            key={topic.issueId}
            onPress={() => onToggleTopic(topic)}
            style={[styles.topicCard, selected && styles.topicCardSelected]}>
            <View style={styles.topicRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.topicTitle}>{topic.title}</Text>
                <Text style={styles.matchText}>{confidenceTierText(topic.confidenceTier)}</Text>
              </View>
              <FontAwesome
                color={selected ? colors.primary : '#8e8e93'}
                name={selected ? 'check-circle' : 'circle-o'}
                size={20}
              />
            </View>
            <View style={styles.chipRow}>
              {topic.evidenceChips.map((chip) => (
                <Text key={chip} style={styles.evidenceChip}>{chip}</Text>
              ))}
            </View>
            <Text style={styles.evidenceText}>{topic.reason}</Text>
          </Pressable>
        );
      })}
      {labels.length > 0 ? (
        <View style={styles.promptGroup}>
          <Text style={styles.promptTitle}>Detected evidence</Text>
          <View style={styles.chipRow}>
            {labels.map((label) => (
              <Text key={label.id} style={styles.evidenceChip}>
                {label.label} {Math.round(label.confidence * 100)}%
              </Text>
            ))}
          </View>
        </View>
      ) : null}
      {status === 'loading' ? (
        <Text style={styles.muted}>Looking for likely 311 topics. You can keep writing.</Text>
      ) : null}
      {showQuietFallback ? (
        <View style={styles.quietFallback}>
          <Text style={[styles.muted, styles.quietFallbackText]}>
            No suggested topics available. You can still choose an issue type.
          </Text>
          <Pressable hitSlop={8} onPress={onAnalyze} style={styles.retryButton}>
            <Text style={styles.inlineActionText}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable style={styles.inlineButton} onPress={onOpenIssueSearch}>
        <FontAwesome name="search" size={15} color={colors.text} />
        <Text style={styles.inlineButtonText}>Search all issue types</Text>
      </Pressable>
    </Card>
  );
}

function ManualIssuePanel({
  manualCategory,
  onOpenIssueSearch,
}: {
  manualCategory: IssueCategory | null;
  onOpenIssueSearch: () => void;
}) {
  return (
    <Card style={styles.suggestionCard}>
      <View style={styles.suggestionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Issue type</Text>
          <Text style={styles.muted}>
            {manualCategory ? manualCategory.title : 'Choose a topic, or keep this as a general report.'}
          </Text>
        </View>
      </View>
      <Pressable style={styles.inlineButton} onPress={onOpenIssueSearch}>
        <FontAwesome name="search" size={15} color={colors.text} />
        <Text style={styles.inlineButtonText}>Search all issue types</Text>
      </Pressable>
    </Card>
  );
}

function confidenceTierText(tier: PhotoIssueCandidate['confidenceTier']) {
  if (tier === 'strong') return 'Strong match';
  if (tier === 'likely') return 'Likely match';
  return 'Possible match';
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: colors.infoBackground,
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    padding: 14,
  },
  bannerButton: {
    borderRadius: radius.sm,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  bannerButtonText: {
    fontSize: 14,
  },
  bannerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    backgroundColor: 'rgba(245,245,247,0.35)',
    justifyContent: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
  },
  categoryTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  centerPin: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -24,
    marginTop: -34,
    position: 'absolute',
    top: 130,
    width: 48,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dismissButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: 28,
    justifyContent: 'center',
    marginRight: -4,
    marginTop: -4,
    width: 28,
  },
  emailBox: {
    gap: 12,
    padding: 14,
  },
  emailTo: {
    color: colors.text,
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  emailToLabel: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '800',
  },
  emailToRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  evidenceBox: {
    borderColor: colors.primary,
    borderRadius: 6,
    borderWidth: 2,
    position: 'absolute',
  },
  evidenceBoxLabel: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 5,
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  evidenceChip: {
    backgroundColor: colors.infoBackground,
    borderRadius: radius.pill,
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  evidencePhoto: {
    height: '100%',
    width: '100%',
  },
  evidencePhotoFrame: {
    backgroundColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  evidenceText: {
    color: colors.mutedStrong,
    fontSize: 14,
    lineHeight: 20,
  },
  eyebrow: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  field: {
    gap: 7,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  inlineActionText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  inlineButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  inlineButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  mapHelp: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
  },
  matchText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  muted: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  observationRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  observationText: {
    color: colors.mutedStrong,
    flex: 1,
    fontSize: 15,
  },
  optionChip: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  optionChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  optionChipSuggested: {
    borderColor: colors.primary,
  },
  optionChipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  optionChipTextSelected: {
    color: '#fff',
  },
  optionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photo: {
    backgroundColor: colors.border,
    borderRadius: radius.xl,
    height: 220,
    width: '100%',
  },
  pinCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  pinMap: {
    height: 260,
    width: '100%',
  },
  progressCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginBottom: 16,
    padding: 12,
  },
  progressConnector: {
    backgroundColor: '#e5e5ea',
    borderRadius: radius.pill,
    height: 3,
    position: 'absolute',
    top: 12,
  },
  progressConnectorActive: {
    backgroundColor: colors.primary,
  },
  progressConnectorLeft: {
    left: 0,
    right: '50%',
  },
  progressConnectorRight: {
    left: '50%',
    right: 0,
  },
  progressDot: {
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderRadius: radius.pill,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  progressDotActive: {
    backgroundColor: colors.primary,
  },
  progressDotItem: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    position: 'relative',
  },
  progressDotsRow: {
    flexDirection: 'row',
  },
  progressLabel: {
    color: colors.muted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressLabelActive: {
    color: colors.text,
  },
  progressLabelRow: {
    flexDirection: 'row',
  },
  progressNumber: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  progressNumberActive: {
    color: '#fff',
  },
  promptGroup: {
    gap: 8,
  },
  promptTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  quietFallback: {
    alignItems: 'flex-start',
    gap: 8,
  },
  quietFallbackText: {
    flexShrink: 1,
    width: '100%',
  },
  raccoonSprite: {
    height: '100%',
    width: '100%',
  },
  raccoonStage: {
    aspectRatio: 1,
    marginTop: 12,
    maxWidth: 92,
    minWidth: 64,
    overflow: 'visible',
    position: 'relative',
    width: '20%',
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  root: {
    flex: 1,
  },
  rowButton: {
    flex: 1,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  smallButton: {
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  smallButtonText: {
    fontSize: 14,
  },
  stack: {
    gap: 16,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 17,
    lineHeight: 24,
    marginTop: 10,
  },
  suggestionCard: {
    gap: 12,
    padding: 14,
  },
  suggestionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  suggestionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  suggestedSentence: {
    backgroundColor: colors.selectedBackground,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 14,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    marginTop: 8,
  },
  topicCard: {
    backgroundColor: colors.selectedBackground,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 12,
  },
  topicCardSelected: {
    borderColor: colors.primary,
  },
  topicRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  topicTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  warningCard: {
    gap: 10,
    padding: 14,
  },
  warningCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  warningCardTitle: {
    flex: 1,
    marginBottom: 0,
  },
});
