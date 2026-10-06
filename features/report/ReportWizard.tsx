import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Platform, Text, View } from 'react-native';

import { Button, Screen, StickyActionBar } from '@/components/ui';

import {
  CategoryStep,
  DetailsStep,
  DoneStep,
  FallbackStep,
  LocationStep,
  PreviewStep,
  Progress,
  StartStep,
} from './ReportWizardStepViews';
import { EmailPolishConsentSheet } from './EmailPolishConsentSheet';
import { styles } from './reportWizardStyles';
import { useReportWizard } from './useReportWizard';

export function ReportWizard() {
  const { resumeId } = useLocalSearchParams<{ resumeId?: string }>();
  const wizard = useReportWizard(resumeId);
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
    <View style={styles.root}>
      <Screen scroll={state.step !== 'category'} stickyFooter={stickyFooter}>
        {state.step !== 'start' && state.step !== 'done' ? (
          <Progress currentStep={state.step} />
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

        {state.step === 'start' ? (
          <StartStep
            busy={state.busy}
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
            onExitToStart={actions.confirmExitToStart}
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
            onBack={actions.backFromLocation}
            onContinue={() => actions.setStep('details')}
            onExitToStart={actions.confirmExitToStart}
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
            onBack={() => actions.setStep('location')}
            onDescriptionChange={actions.setDescription}
            onExitToStart={actions.confirmExitToStart}
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
            onBack={() => actions.setStep('details')}
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
            onExitToStart={actions.confirmExitToStart}
            photoUri={draft.photoUri}
            profile={state.profile}
            usesShareSheet={Platform.OS !== 'web' && wizard.mailComposerAvailable === false}
          />
        ) : null}

        {state.step === 'fallback' ? (
          <FallbackStep
            onBack={() => actions.setStep('preview')}
            onConfirmSent={actions.confirmSentManually}
            onCopyEmail={actions.copyEmail}
            onCopyRecipient={actions.copyRecipient}
            onExitToStart={actions.confirmExitToStart}
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
    </View>
  );
}
