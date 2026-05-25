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
            onExitToStart={actions.confirmExitToStart}
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
            onExitToStart={actions.confirmExitToStart}
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
            onExitToStart={actions.confirmExitToStart}
            photoUri={state.photoUri}
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
