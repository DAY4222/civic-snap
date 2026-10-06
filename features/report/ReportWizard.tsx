import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Screen, StickyActionBar } from '@/components/ui';

import {
  CategoryStep,
  DetailsStep,
  DoneStep,
  FallbackStep,
  LocationStep,
  PreviewStep,
  Progress,
} from './ReportWizardStepViews';
import { EmailPolishConsentSheet } from './EmailPolishConsentSheet';
import { styles } from './reportWizardStyles';
import { getTrackerIndex, isPhotoVisionFailure } from './reportWizardState';
import { SuggestStep } from './SuggestStep';
import { photoSuggestionFallbackText } from './suggestionCopy';
import { useReportWizard } from './useReportWizard';
import type { ReportWizardParams } from './wizardTypes';

export function ReportWizard() {
  const params = useLocalSearchParams<ReportWizardParams>();
  const wizard = useReportWizard(params);
  const { actions, category, email, hasIssue, state } = wizard;
  const { draft } = state;
  const previewRequirementText = !draft.description.trim()
    ? 'Add a short description to preview the email.'
    : !wizard.canContinueLocation
      ? 'Add an address or GPS pin before previewing the email.'
      : '';
  // Apple Mail opens prefilled; without it the share sheet picks an email app; web uses fallbacks.
  const sendButtonTitle =
    Platform.OS === 'web'
      ? 'Send by email'
      : wizard.mailComposerAvailable === false
        ? 'Choose email app'
        : 'Open Mail';
  const stickyFooter =
    state.step === 'details' ? (
      <StickyActionBar>
        <Button
          disabled={state.busy || !wizard.canPreviewEmail}
          loading={state.busy}
          onPress={actions.previewEmail}
          title="Preview email"
        />
      </StickyActionBar>
    ) : state.step === 'preview' ? (
      <StickyActionBar>
        <Button
          disabled={state.busy || !state.savedReportId}
          onPress={actions.sendReport}
          title={sendButtonTitle}
        />
      </StickyActionBar>
    ) : null;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      {/* Keyed by step so each step opens scrolled to the top. */}
      <Screen
        key={state.step}
        safeBottom
        scroll={state.step !== 'category'}
        stickyFooter={stickyFooter}>
        {state.step !== 'start' && state.step !== 'done' ? (
          <Progress activeIndex={getTrackerIndex(state)} />
        ) : null}

        {state.step === 'start' ? (
          <View style={styles.startLoading}>
            <ActivityIndicator />
          </View>
        ) : null}

        {state.step === 'done' && state.lastHandoff ? (
          <DoneStep
            handoff={state.lastHandoff}
            onConfirmSent={actions.confirmLastHandoffSent}
            onNewReport={actions.startNewReport}
            onViewReport={actions.viewLastHandoff}
            recipient={email.recipient}
          />
        ) : null}

        {state.step === 'suggest' ? (
          <SuggestStep
            mode={wizard.suggestMode}
            onBack={actions.goBack}
            onChooseLater={actions.skipIssue}
            onChooseTopic={actions.chooseSuggestedTopic}
            onDecline={actions.declinePhotoAnalysis}
            onEnable={actions.enablePhotoAnalysis}
            onExit={actions.confirmExit}
            onRetry={actions.analyzeCurrentPhoto}
            onSearch={() => actions.openCategory('location')}
            photoUri={draft.photoUri}
            selectedTopic={draft.photoIssueTopic}
            status={state.photoVisionStatus}
            topics={wizard.photoIssueSuggestions}
          />
        ) : null}

        {state.step === 'category' ? (
          <CategoryStep
            filteredIssueCategories={wizard.filteredIssueCategories}
            issueSearchQuery={state.issueSearchQuery}
            notice={
              state.issueStep === 'suggest' &&
              state.categoryReturnStep === 'location' &&
              isPhotoVisionFailure(state.photoVisionStatus)
                ? photoSuggestionFallbackText(state.photoVisionStatus)
                : null
            }
            onBack={actions.goBack}
            onChooseCategory={actions.chooseCategory}
            onExit={actions.confirmExit}
            onSearchChange={actions.setIssueSearchQuery}
            selectedCategoryId={draft.categoryId}
          />
        ) : null}

        {state.step === 'location' ? (
          <LocationStep
            address={draft.address}
            busy={state.busy}
            canContinue={wizard.canContinueLocation}
            locationNote={draft.locationNote}
            onAddressChange={actions.setAddress}
            onBack={actions.goBack}
            onContinue={() => actions.setStep('details')}
            onExit={actions.confirmExit}
            onLocationNoteChange={actions.setLocationNote}
            onUseCurrentLocation={actions.useCurrentLocation}
            onUpdatePin={actions.updatePinFromMap}
            photoUri={draft.photoUri}
            pinRegion={wizard.pinRegion}
          />
        ) : null}

        {state.step === 'details' ? (
          <DetailsStep
            answers={draft.answers}
            category={category}
            description={draft.description}
            descriptionPlaceholder={wizard.descriptionPlaceholder}
            selectedCategory={hasIssue ? category : null}
            onAnalyze={actions.analyzeCurrentPhoto}
            onBack={actions.goBack}
            onDescriptionChange={actions.setDescription}
            onExit={actions.confirmExit}
            onInsertSuggestedDescription={actions.insertSuggestedDescription}
            onOpenIssueSearch={() => actions.openCategory('details')}
            onSetAnswer={actions.setAnswer}
            onToggleTopic={actions.togglePhotoIssueTopic}
            photoLabelsEnabled={wizard.photoLabelsEnabled}
            photoUri={draft.photoUri}
            photoVisionResult={draft.photoVisionResult}
            photoVisionStatus={state.photoVisionStatus}
            previewRequirementText={previewRequirementText}
            selectedPhotoIssueTopic={draft.photoIssueTopic}
            topics={wizard.photoIssueSuggestions}
          />
        ) : null}

        {state.step === 'preview' ? (
          <PreviewStep
            dismissedContactPrompt={state.dismissedContactPrompt}
            emailBody={email.body}
            emailOutOfDate={wizard.emailOutOfDate}
            emailRecipient={email.recipient}
            emailSubject={email.subject}
            onBack={actions.goBack}
            onDismissContactPrompt={actions.dismissContactPrompt}
            onEmailBodyChange={actions.setEmailBody}
            onEmailSubjectChange={actions.setEmailSubject}
            onRebuildEmail={actions.rebuildEmail}
            polish={{
              available: wizard.emailPolishAvailable,
              hasPendingAi: Boolean(state.email.pendingAi),
              message: state.emailPolish.message,
              onAcceptPendingAi: actions.acceptPendingAiEmail,
              onCancel: actions.cancelEmailPolish,
              onDismissPendingAi: actions.dismissPendingAiEmail,
              onPolish: actions.polishEmail,
              onUndoAi: actions.undoAiEmail,
              source: state.email.source,
              status: state.emailPolish.status,
            }}
            onExit={actions.confirmExit}
            photoUri={draft.photoUri}
            profile={state.profile}
            usesShareSheet={Platform.OS !== 'web' && wizard.mailComposerAvailable === false}
          />
        ) : null}

        {state.step === 'fallback' ? (
          <FallbackStep
            onBack={actions.goBack}
            onConfirmSent={actions.confirmSentManually}
            onCopyEmail={actions.copyEmail}
            onCopyRecipient={actions.copyRecipient}
            onExit={actions.confirmExit}
            onOpenMailto={actions.openMailto}
            recipient={email.recipient}
          />
        ) : null}
      </Screen>
      <EmailPolishConsentSheet
        onAllow={actions.allowEmailPolish}
        onDismiss={actions.dismissEmailPolishConsent}
        visible={state.emailPolish.status === 'consent'}
      />
      {state.busy ? (
        <View pointerEvents="none" style={styles.busyOverlay}>
          <ActivityIndicator />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Both paths show Issue, Location, Details, Email. Searching for an issue from Details stays
 * on Details instead of jumping back to the first step.
 */
