import Reflux from 'reflux';
import {hashHistory} from 'react-router';
import type {Location} from 'history';
import {FORM_PROCESSING_BASE} from 'js/router/routerConstants';
import {
  isFormSingleProcessingRoute,
  getSingleProcessingRouteParameters,
} from 'js/router/routerUtils';
import {
  getSurveyFlatPaths,
  getAssetProcessingRows,
  isAssetProcessingActivated,
  getAssetAdvancedFeatures,
} from 'js/assetUtils';
import type {SurveyFlatPaths} from 'js/assetUtils';
import assetStore from 'js/assetStore';
import {actions} from 'js/actions';
import processingActions from 'js/components/processing/processingActions';
import type {ProcessingDataResponse} from 'js/components/processing/processingActions';

export enum SingleProcessingTabs {
  Transcript = 'trc',
  Translations = 'trl',
  Analysis = 'an',
}

/** Shared interface for transcript and translations. */
export interface Transx {
  value: string;
  languageCode: string;
  dateCreated: string;
  dateModified: string;
}

/** Transcript or translation draft. */
interface TransxDraft {
  value?: string;
  languageCode?: string;
}

/**
 * This contains a list of submissions for every processing-enabled question.
 * In a list: for every submission we store either an `uuid` (when given
 * submission has a response to the question) or a `null` (when given submission
 * doesn't have a response to the question).
 *
 * We use it to navigate through submissions with meaningful data in context of
 * a question.
 *
 * We also use it to navigate through questions - making sure we only allow
 * ones with any meaningful data.
 */
interface SubmissionsUuids {
  [questionName: string]: Array<string | null>;
}

interface SingleProcessingStoreData {
  transcript?: Transx;
  transcriptDraft?: TransxDraft;
  translations: Transx[];
  translationDraft?: TransxDraft;
  /** Being displayed on the left side of the screen during translation editing. */
  source?: string;
  activeTab: SingleProcessingTabs;
  submissionData?: SubmissionResponse;
  /**
   * A list of all submissions ids, we store `null` for submissions that don't
   * have a response for the question.
   */
  submissionsUuids?: SubmissionsUuids;
}

class SingleProcessingStore extends Reflux.Store {
  /**
   * A method for aborting current XHR fetch request.
   * It doesn't need to be defined upfront, but I'm adding it here for clarity.
   */
  private abortFetchData?: Function;
  private previousPath: string | undefined;
  // For the store to work we need all three: asset, submission, and uuids. The
  // (ability to fetch) processing data is being unlocked by having'em all.
  private areUuidsLoaded = false;
  private isSubmissionLoaded = false;
  private isProcessingDataLoaded = false;

  // We want to give access to this only through methods.
  private data: SingleProcessingStoreData = {
    translations: [],
    activeTab: SingleProcessingTabs.Transcript,
  };
  /** Marks some backend calls being in progress. */
  public isFetchingData = false;

  private resetProcessingData() {
    this.isProcessingDataLoaded = false;

    this.data.transcript = undefined;
    this.data.transcriptDraft = undefined;
    this.data.translations = [];
    this.data.translationDraft = undefined;
    this.data.source = undefined;
    this.data.activeTab = SingleProcessingTabs.Transcript;
  }

  private get currentAssetUid(): string {
    return getSingleProcessingRouteParameters().uid;
  }

  private get currentQuestionName(): string {
    return getSingleProcessingRouteParameters().questionName;
  }

  private get currentSubmissionUuid(): string {
    return getSingleProcessingRouteParameters().submissionUuid;
  }

  init() {
    this.resetProcessingData();

    hashHistory.listen(this.onRouteChange.bind(this));

    actions.submissions.getSubmissionByUuid.completed.listen(this.onGetSubmissionByUuidCompleted.bind(this));
    actions.submissions.getSubmissionByUuid.failed.listen(this.onGetSubmissionByUuidFailed.bind(this));
    actions.submissions.getProcessingSubmissions.completed.listen(this.onGetProcessingSubmissionsCompleted.bind(this));
    actions.submissions.getProcessingSubmissions.failed.listen(this.onGetProcessingSubmissionsFailed.bind(this));

    processingActions.getProcessingData.started.listen(this.onFetchProcessingDataStarted.bind(this));
    processingActions.getProcessingData.completed.listen(this.onFetchProcessingDataCompleted.bind(this));
    processingActions.getProcessingData.failed.listen(this.onAnyCallFailed.bind(this));
    processingActions.setTranscript.completed.listen(this.onSetTranscriptCompleted.bind(this));
    processingActions.setTranscript.failed.listen(this.onAnyCallFailed.bind(this));
    processingActions.deleteTranscript.completed.listen(this.onDeleteTranscriptCompleted.bind(this));
    processingActions.deleteTranscript.failed.listen(this.onAnyCallFailed.bind(this));
    processingActions.setTranslation.completed.listen(this.onSetTranslationCompleted.bind(this));
    processingActions.setTranslation.failed.listen(this.onAnyCallFailed.bind(this));
    // NOTE: deleteTranslation endpoint is sending whole processing data in response.
    processingActions.deleteTranslation.completed.listen(this.onFetchProcessingDataCompleted.bind(this));
    processingActions.deleteTranslation.failed.listen(this.onAnyCallFailed.bind(this));
    processingActions.activateAsset.completed.listen(this.onActivateAssetCompleted.bind(this));

    // We need the asset to be loaded for the store to work (we get the
    // processing endpoint url from asset JSON). We try to startup store
    // immediately and also listen to asset loads.
    this.startupStore();

    // This comes back with data after `processingActions.activateAsset` call.
    assetStore.whenLoaded(this.currentAssetUid, this.onAssetLoad.bind(this));
  }

  /** This is making sure the asset processing features are activated. */
  onAssetLoad(asset: AssetResponse) {
    if (
      isFormSingleProcessingRoute(
        this.currentAssetUid,
        this.currentQuestionName,
        this.currentSubmissionUuid,
      ) &&
      this.currentAssetUid === asset.uid
    ) {
      if (!isAssetProcessingActivated(this.currentAssetUid)) {
        this.activateAsset();
      } else {
        this.fetchAllInitialDataForAsset();
      }
    }
  }

  onActivateAssetCompleted() {
    this.fetchAllInitialDataForAsset();
  }

  activateAsset() {
    processingActions.activateAsset(this.currentAssetUid, true, []);
  }

  /**
   * This initialisation is mainly needed because in the case when user loads
   * the processing route URL directly the asset data might not be here yet.
   */
  private startupStore() {
    if (
      isFormSingleProcessingRoute(
        this.currentAssetUid,
        this.currentQuestionName,
        this.currentSubmissionUuid,
      )
    ) {
      this.fetchAllInitialDataForAsset();
    }
  }

  /**
   * This does a few things:
   * 1. checks if asset is processing-activated and activates if not
   * 2. fetches all data needed when processing view is opened (in comparison to
   *    fetching data needed when switching processing question or submission)
   */
  private fetchAllInitialDataForAsset() {
    // JUST A NOTE: we don't need to load asset ourselves, as it is already
    // taken care of in `PermProtectedRoute`. It can happen so that this method
    // is being called sooner than the mentioned component does its thing.
    const isAssetLoaded = Boolean(assetStore.getAsset(this.currentAssetUid));

    // Without asset we can't do anything yet.
    if (!isAssetLoaded) {
      return;
    }

    if (!isAssetProcessingActivated(this.currentAssetUid)) {
      this.activateAsset();
    } else {
      this.fetchSubmissionData();
      this.fetchUuids();
      this.fetchProcessingData();
    }
  }

  private onRouteChange(data: Location) {
    if (this.previousPath === data.pathname) {
      return;
    }

    const baseProcessingRoute = FORM_PROCESSING_BASE.replace(':uid', this.currentAssetUid);

    // Case 1: switching from a processing route to a processing route.
    // This means that we are changing either the question and the submission
    // or just the submission.
    if (
      this.previousPath !== data.pathname &&
      this.previousPath !== undefined &&
      this.previousPath.startsWith(baseProcessingRoute) &&
      data.pathname.startsWith(baseProcessingRoute)
    ) {
      this.fetchProcessingData();
      this.fetchSubmissionData();
    } else if (
      // Case 2: switching into processing route out of other place (most
      // probably from assets data table route).
      this.previousPath !== data.pathname &&
      isFormSingleProcessingRoute(
        this.currentAssetUid,
        this.currentQuestionName,
        this.currentSubmissionUuid,
      )
    ) {
      this.fetchAllInitialDataForAsset();
    }

    this.previousPath = data.pathname;
  }

  private fetchSubmissionData(): void {
    this.isSubmissionLoaded = false;
    this.data.submissionData = undefined;
    this.trigger(this.data);

    actions.submissions.getSubmissionByUuid(this.currentAssetUid, this.currentSubmissionUuid);
  }

  private onGetSubmissionByUuidCompleted(response: SubmissionResponse): void {
    this.isSubmissionLoaded = true;
    this.data.submissionData = response;
    this.trigger(this.data);
  }

  private onGetSubmissionByUuidFailed(): void {
    this.isSubmissionLoaded = true;
    this.trigger(this.data);
  }

  /**
   * NOTE: We only need to call this once for given asset. We assume that while
   * processing view is opened, submissions will not be deleted or added.
   */
  private fetchUuids(): void {
    this.areUuidsLoaded = false;
    this.data.submissionsUuids = undefined;
    this.trigger(this.data);

    const processingRows = getAssetProcessingRows(this.currentAssetUid);
    const asset = assetStore.getAsset(this.currentAssetUid);
    let flatPaths: SurveyFlatPaths = {};

    if (asset?.content?.survey) {
      flatPaths = getSurveyFlatPaths(asset.content.survey);
    }

    const processingRowsPaths: string[] = [];
    if (processingRows) {
      processingRows.forEach((row) => {
        if (flatPaths[row]) {
          processingRowsPaths.push(flatPaths[row]);
        }
      });
    }

    actions.submissions.getProcessingSubmissions(
      this.currentAssetUid,
      processingRowsPaths
    );
  }

  private onGetProcessingSubmissionsCompleted(
    response: GetProcessingSubmissionsResponse
  ) {
    const submissionsUuids: SubmissionsUuids = {};
    const processingRows = getAssetProcessingRows(this.currentAssetUid);

    const asset = assetStore.getAsset(this.currentAssetUid);
    let flatPaths: SurveyFlatPaths = {};

    if (asset?.content?.survey) {
      flatPaths = getSurveyFlatPaths(asset.content.survey);
    }

    if (processingRows !== undefined) {
      processingRows.forEach((processingRow) => {
        submissionsUuids[processingRow] = [];
      });

      response.results.forEach((result) => {
        processingRows.forEach((processingRow) => {
          if (Object.keys(result).includes(flatPaths[processingRow])) {
            submissionsUuids[processingRow].push(result._uuid);
          } else {
            submissionsUuids[processingRow].push(null);
          }
        });
      });
    }

    this.areUuidsLoaded = true;
    this.data.submissionsUuids = submissionsUuids;
    this.trigger(this.data);
  }

  private onGetProcessingSubmissionsFailed(): void {
    this.areUuidsLoaded = true;
    this.trigger(this.data);
  }

  private fetchProcessingData() {
    if (this.abortFetchData !== undefined) {
      this.abortFetchData();
    }

    this.resetProcessingData();

    processingActions.getProcessingData(
      this.currentAssetUid,
      this.currentSubmissionUuid
    );
  }

  private onFetchProcessingDataStarted(abort: () => void) {
    this.abortFetchData = abort;
    this.isFetchingData = true;
    this.trigger(this.data);
  }

  private onFetchProcessingDataCompleted(response: ProcessingDataResponse) {
    const transcriptResponse = response[this.currentQuestionName]?.transcript;
    // NOTE: we treat empty transcript object same as nonexistent one
    this.data.transcript = undefined;
    if (
      transcriptResponse?.value &&
      transcriptResponse?.languageCode
    ) {
      this.data.transcript = transcriptResponse;
    }

    const translationsResponse = response[this.currentQuestionName]?.translated;
    const translationsArray: Transx[] = [];
    if (translationsResponse) {
      Object.keys(translationsResponse).forEach((languageCode: string) => {
        const translation = translationsResponse[languageCode];
        if (translation.languageCode) {
          translationsArray.push({
            value: translation.value,
            languageCode: translation.languageCode,
            dateModified: translation.dateModified,
            dateCreated: translation.dateCreated,
          });
        }
      });
    }
    this.data.translations = translationsArray;

    delete this.abortFetchData;
    this.isProcessingDataLoaded = true;
    this.isFetchingData = false;

    this.trigger(this.data);
  }

  private onAnyCallFailed() {
    delete this.abortFetchData;
    this.isFetchingData = false;
    this.trigger(this.data);
  }

  private onSetTranscriptCompleted(response: ProcessingDataResponse) {
    const transcriptResponse = response[this.currentQuestionName]?.transcript;

    this.isFetchingData = false;

    if (transcriptResponse) {
      this.data.transcript = transcriptResponse;
    }
    // discard draft after saving (exit the editor)
    this.data.transcriptDraft = undefined;
    this.trigger(this.data);
  }

  private onDeleteTranscriptCompleted() {
    this.isFetchingData = false;
    this.data.transcript = undefined;
    this.trigger(this.data);
  }

  private onSetTranslationCompleted(newTranslations: Transx[]) {
    this.isFetchingData = false;
    this.data.translations = newTranslations;
    // discard draft after saving (exit the editor)
    this.data.translationDraft = undefined;
    this.trigger(this.data);
  }

  /**
   * Returns a list of selectable language codes.
   * Omits the one currently being edited.
   */
  getSources(): string[] {
    const sources = [];

    if (this.data.transcript?.languageCode) {
      sources.push(this.data.transcript?.languageCode);
    }

    this.data.translations.forEach((translation: Transx) => {
      if (translation.languageCode !== this.data.translationDraft?.languageCode) {
        sources.push(translation.languageCode);
      }
    });

    return sources;
  }

  setSource(languageCode: string) {
    this.data.source = languageCode;
    this.trigger(this.data);
  }

  /** Returns whole transcript/translation for selected source. */
  getSourceData(): Transx | undefined {
    if (!this.data.source) {
      return undefined;
    }

    if (this.data.source === this.data.transcript?.languageCode) {
      return this.data.transcript;
    } else {
      const found = this.data.translations.find((translation) =>
        translation.languageCode === this.data.source
      );
      return found;
    }
  }

  /** Returns a local cached transcript data. */
  getTranscript() {
    return this.data.transcript;
  }

  setTranscript(languageCode: string, value: string) {
    this.isFetchingData = true;
    processingActions.setTranscript(
      this.currentAssetUid,
      this.currentQuestionName,
      this.currentSubmissionUuid,
      languageCode,
      value
    );
    this.trigger(this.data);
  }

  deleteTranscript() {
    this.isFetchingData = true;
    processingActions.deleteTranscript(
      this.currentAssetUid,
      this.currentQuestionName,
      this.currentSubmissionUuid
    );
    this.trigger(this.data);
  }

  getTranscriptDraft() {
    return this.data.transcriptDraft;
  }

  setTranscriptDraft(newTranscriptDraft: TransxDraft) {
    this.data.transcriptDraft = newTranscriptDraft;
    this.trigger(this.data);
  }

  deleteTranscriptDraft() {
    this.data.transcriptDraft = undefined;
    this.trigger(this.data);
  }

  /**
   * Returns a list of language codes of languages that are activated within
   * advanced_features.transcript
   */
  getAssetTranscriptableLanguages() {
    const advancedFeatures = getAssetAdvancedFeatures(this.currentAssetUid);
    if (advancedFeatures?.transcript?.languages) {
      return advancedFeatures.transcript.languages;
    }
    return [];
  }

  /** Returns a local cached translation data. */
  getTranslation(languageCode: string | undefined) {
    return this.data.translations.find(
      (translation) => translation.languageCode === languageCode
    );
  }

  /** Returns a local cached translations list. */
  getTranslations() {
    return this.data.translations;
  }

  /** This stores the translation on backend. */
  setTranslation(languageCode: string, value: string) {
    this.isFetchingData = true;
    processingActions.setTranslation(
      this.currentAssetUid,
      this.currentQuestionName,
      this.currentSubmissionUuid,
      languageCode,
      value
    );
    this.trigger(this.data);
  }

  deleteTranslation(languageCode: string) {
    this.isFetchingData = true;
    processingActions.deleteTranslation(
      this.currentAssetUid,
      this.currentQuestionName,
      this.currentSubmissionUuid,
      languageCode
    );
    this.trigger(this.data);
  }

  getTranslationDraft() {
    return this.data.translationDraft;
  }

  setTranslationDraft(newTranslationDraft: TransxDraft) {
    this.data.translationDraft = newTranslationDraft;
    // We use transcript as source by default.
    this.data.source = this.data.transcript?.languageCode;
    this.trigger(this.data);
  }

  deleteTranslationDraft() {
    this.data.translationDraft = undefined;
    // If we clear the draft, we remove the source too.
    this.data.source = undefined;
    this.trigger(this.data);
  }

  /**
   * Returns a list of language codes of languages that are activated within
   * advanced_features.translated
   */
  getAssetTranslatableLanguages() {
    const advancedFeatures = getAssetAdvancedFeatures(this.currentAssetUid);
    if (advancedFeatures?.translated?.languages) {
      return advancedFeatures.translated.languages;
    }
    return [];
  }

  activateTab(tab: SingleProcessingTabs) {
    this.data.activeTab = tab;

    // When changing tab, discard all drafts and the selected source.
    this.data.transcriptDraft = undefined;
    this.data.translationDraft = undefined;
    this.data.source = undefined;

    this.trigger(this.data);
  }

  getSubmissionData() {
    return this.data.submissionData;
  }

  /** NOTE: Returns uuids for current question name, not for all of them. */
  getCurrentQuestionSubmissionsUuids() {
    if (this.data.submissionsUuids !== undefined) {
      return this.data.submissionsUuids[this.currentQuestionName];
    }
    return undefined;
  }

  getSubmissionsUuids() {
    return this.data.submissionsUuids;
  }

  getActiveTab() {
    return this.data.activeTab;
  }

  hasUnsavedTranscriptDraftValue() {
    const draft = this.getTranscriptDraft();
    return (
      draft?.value !== undefined &&
      draft.value !== this.getTranscript()?.value
    );
  }

  hasUnsavedTranslationDraftValue() {
    const draft = this.getTranslationDraft();
    return (
      draft?.value !== undefined &&
      draft.value !== this.getTranslation(draft?.languageCode)?.value
    );
  }

  hasAnyUnsavedWork() {
    return (
      this.hasUnsavedTranscriptDraftValue() ||
      this.hasUnsavedTranslationDraftValue()
    );
  }

  isReady() {
    return (
      isAssetProcessingActivated(this.currentAssetUid) &&
      this.areUuidsLoaded &&
      this.isSubmissionLoaded &&
      this.isProcessingDataLoaded
    );
  }
}

/** Handles content state and data for editors */
const singleProcessingStore = new SingleProcessingStore();
singleProcessingStore.init();

export default singleProcessingStore;
