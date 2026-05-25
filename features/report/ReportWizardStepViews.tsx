import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
} from 'react-native';

import MapView, { type Region } from '@/components/CivicMap';
import { Button, Card, Field, Notice, colors } from '@/components/ui';
import { getSuggestedAnswerOptions, toggleMultiAnswer } from '@/lib/issueSuggestions';
import type {
  CategoryQuestion,
  IssueCategory,
  PhotoIssueCandidate,
  PhotoVisionResult,
} from '@/lib/types';

import { GENERAL_CATEGORY, type PhotoVisionStatus, type ReportWizardStep } from './reportWizardState';
import { styles } from './reportWizardStyles';
import { RACCOON_SWEEPER_FRAMES } from './raccoonFrames';

export function StartStep({
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

export function CategoryStep({
  filteredIssueCategories,
  issueSearchQuery,
  onBack,
  onChooseCategory,
  onExitToStart,
  onSearchChange,
  selectedCategoryId,
}: {
  filteredIssueCategories: IssueCategory[];
  issueSearchQuery: string;
  onBack: () => void;
  onChooseCategory: (categoryId: string | null) => void;
  onExitToStart: () => void;
  onSearchChange: (value: string) => void;
  selectedCategoryId: string | null;
}) {
  return (
    <FlatList
      contentContainerStyle={styles.categoryListContent}
      data={filteredIssueCategories}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.stack}>
          <Header title="Search issue types" onBack={onBack} onExitToStart={onExitToStart} />
          <Field
            label="Search"
            onChangeText={onSearchChange}
            placeholder="Example: pothole, graffiti, sidewalk"
            returnKeyType="search"
            value={issueSearchQuery}
          />
          <Pressable
            accessibilityLabel="Choose General 311 report"
            accessibilityRole="button"
            accessibilityState={{ selected: selectedCategoryId == null }}
            onPress={() => onChooseCategory(null)}>
            <Card selected={selectedCategoryId == null}>
              <Text style={styles.cardTitle}>General 311 report</Text>
              <Text style={styles.muted}>Continue with a general 311 report.</Text>
            </Card>
          </Pressable>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.muted}>No issue types found. Try a different search term.</Text>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityLabel={`Choose ${item.title}`}
          accessibilityRole="button"
          accessibilityState={{ selected: item.id === selectedCategoryId }}
          onPress={() => onChooseCategory(item.id)}>
          <Card selected={item.id === selectedCategoryId}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.muted}>{categorySourceMatchText(item)}</Text>
          </Card>
        </Pressable>
      )}
      style={styles.categoryList}
    />
  );
}

export function LocationStep({
  address,
  busy,
  locationNote,
  onAddressChange,
  onBack,
  onContinue,
  onExitToStart,
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
  onExitToStart: () => void;
  onLocationNoteChange: (value: string) => void;
  onUpdatePin: (region: Region) => void;
  onUseCurrentLocation: () => void;
  photoUri: string | null;
  pinRegion: Region | null;
}) {
  return (
    <View style={styles.stack}>
      <Header title="Confirm location" onBack={onBack} onExitToStart={onExitToStart} />
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

export function DetailsStep({
  answers,
  category,
  currentIssueTitle,
  description,
  descriptionPlaceholder,
  manualCategory,
  onAnalyze,
  onBack,
  onDescriptionChange,
  onExitToStart,
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
  onExitToStart: () => void;
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
      <Header title="Add details" onBack={onBack} onExitToStart={onExitToStart} />
      <Text style={styles.categoryTitle}>{currentIssueTitle}</Text>
      {photoLabelsEnabled && photoUri ? (
        <SuggestedTopicsPanel
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
          accessibilityHint="Adds this sentence to the report description"
          accessibilityLabel="Insert suggested sentence"
          accessibilityRole="button"
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

export function PreviewStep({
  dismissedContactPrompt,
  emailBody,
  emailRecipient,
  emailSubject,
  onBack,
  onDismissContactPrompt,
  onEmailBodyChange,
  onEmailSubjectChange,
  onExitToStart,
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
  onExitToStart: () => void;
  photoUri: string | null;
  profile: { name: string; phone: string };
}) {
  return (
    <View style={styles.stack}>
      <Header title="Email preview" onBack={onBack} onExitToStart={onExitToStart} />
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

export function FallbackStep({
  onBack,
  onCopyEmail,
  onExitToStart,
  onOpenMailto,
}: {
  onBack: () => void;
  onCopyEmail: () => void;
  onExitToStart: () => void;
  onOpenMailto: () => void;
}) {
  return (
    <View style={styles.stack}>
      <Header title="Mail unavailable" onBack={onBack} onExitToStart={onExitToStart} />
      <Notice
        text="The iOS mail composer is unavailable. Copy the draft, then attach the photo manually if needed."
        tone="warning"
      />
      <Button onPress={onCopyEmail} title="Copy email text" variant="secondary" />
      <Button onPress={onOpenMailto} title="Open mailto link" variant="secondary" />
    </View>
  );
}

function Header({
  title,
  onBack,
  onExitToStart,
}: {
  title: string;
  onBack: () => void;
  onExitToStart: () => void;
}) {
  return (
    <View style={styles.headerRow}>
      <Pressable
        accessibilityLabel="Go back"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onBack}
        style={styles.headerIconButton}>
        <FontAwesome name="chevron-left" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <Pressable
        accessibilityLabel="Return to start"
        accessibilityRole="button"
        hitSlop={10}
        onPress={onExitToStart}
        style={styles.headerIconButton}>
        <FontAwesome name="times" size={18} color={colors.text} />
      </Pressable>
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

export function Progress({ currentStep }: { currentStep: ReportWizardStep }) {
  const steps: { key: ReportWizardStep; label: string }[] = [
    { key: 'category', label: 'Issue' },
    { key: 'location', label: 'Location' },
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
                accessibilityLabel={`${selected ? 'Remove' : 'Choose'} ${option.label}`}
                accessibilityRole={question.answerType === 'multipicklist' ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: selected }}
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
  onAnalyze,
  onOpenIssueSearch,
  onToggleTopic,
  selectedTopic,
  status,
  topics,
}: {
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
          <Text style={styles.sectionTitle}>Photo suggestions</Text>
          <Text style={styles.muted}>Choose one if it fits, or search manually.</Text>
        </View>
        {status === 'loading' ? <ActivityIndicator /> : null}
      </View>
      {topics.map((topic) => {
        const selected = selectedTopic?.issueId === topic.issueId;

        return (
          <Pressable
            accessibilityHint={topic.reason}
            accessibilityLabel={`${selected ? 'Unselect' : 'Select'} ${topic.title}, ${confidenceTierText(topic.confidenceTier)}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
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
      {status === 'loading' ? (
        <Text style={styles.muted}>Checking the photo for likely 311 topics. You can keep writing.</Text>
      ) : null}
      {showQuietFallback ? (
        <View style={styles.quietFallback}>
          <Text style={[styles.muted, styles.quietFallbackText]}>
            {photoSuggestionFallbackText(status)}
          </Text>
          {status === 'error' ? (
            <Pressable
              accessibilityLabel="Retry photo suggestions"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onAnalyze}
              style={styles.retryButton}>
              <Text style={styles.inlineActionText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityLabel="Search all issue types"
        accessibilityRole="button"
        style={styles.inlineButton}
        onPress={onOpenIssueSearch}>
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
      <Pressable
        accessibilityLabel="Search all issue types"
        accessibilityRole="button"
        style={styles.inlineButton}
        onPress={onOpenIssueSearch}>
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

function photoSuggestionFallbackText(status: PhotoVisionStatus) {
  if (status === 'rate-limited') {
    return 'Daily photo analysis limit reached. Search all issue types to continue.';
  }

  if (status === 'payload-too-large') {
    return 'This photo is too large for analysis. Search all issue types to continue.';
  }

  if (status === 'error') {
    return 'Photo suggestions are unavailable. Search all issue types to continue.';
  }

  return 'No suggested topics available. Search all issue types to continue.';
}
