import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Screen, StickyActionBar } from '@/components/ui';

import {
  CategoryStep,
  DetailsStep,
  FallbackStep,
  LocationStep,
  PreviewStep,
  Progress,
  StartStep,
} from './ReportWizardStepViews';
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
          onPress={actions.openMail}
          title="Open Mail"
        />
      </StickyActionBar>
    ) : null;

  return (
    <View style={styles.root}>
      <Screen scroll={state.step !== 'category'} stickyFooter={stickyFooter}>
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
            onExitToStart={actions.confirmExitToStart}
            photoUri={draft.photoUri}
            profile={state.profile}
          />
        ) : null}

        {state.step === 'fallback' ? (
          <FallbackStep
            onBack={() => actions.setStep('preview')}
            onCopyEmail={actions.copyEmail}
            onExitToStart={actions.confirmExitToStart}
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
