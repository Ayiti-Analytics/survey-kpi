import React from 'react';
import bem, {makeBem} from 'js/bem';
import type {AnyRowTypeName} from 'js/constants';
import {
  getRowType,
  getRowTypeIcon,
  getTranslatedRowLabel,
} from 'js/assetUtils';
import {ROUTES} from 'js/router/routerConstants';
import {hashHistory} from 'react-router';
import Button from 'js/components/common/button';
import singleProcessingStore from 'js/components/processing/singleProcessingStore';
import KoboSelect from 'js/components/common/koboSelect';
import type {KoboSelectOption} from 'js/components/common/koboSelect';
import './singleProcessingHeader.scss';

bem.SingleProcessingHeader = makeBem(null, 'single-processing-header', 'header');
bem.SingleProcessingHeader__column = makeBem(bem.SingleProcessingHeader, 'column', 'section');
bem.SingleProcessingHeader__submissions = makeBem(bem.SingleProcessingHeader, 'submissions', 'nav');
bem.SingleProcessingHeader__count = makeBem(bem.SingleProcessingHeader, 'count');
bem.SingleProcessingHeader__number = makeBem(bem.SingleProcessingHeader, 'number');

interface SingleProcessingHeaderProps {
  questionType: AnyRowTypeName | undefined;
  questionName: string;
  submissionUuid: string;
  assetUid: string;
  assetContent: AssetContent;
}

/**
 * Component with the current question label and the UI for switching between
 * submissions.
 */
export default class SingleProcessingHeader extends React.Component<
  SingleProcessingHeaderProps
> {
  private unlisteners: Function[] = [];

  componentDidMount() {
    this.unlisteners.push(
      singleProcessingStore.listen(this.onSingleProcessingStoreChange, this)
    );
  }

  componentWillUnmount() {
    this.unlisteners.forEach((clb) => {clb();});
  }

  /**
  * Don't want to store a duplicate of store data here just for the sake of
  * comparison, so we need to make the component re-render itself when the
  * store changes :shrug:.
  */
  onSingleProcessingStoreChange() {
    this.forceUpdate();
  }

  onQuestionSelectChange(newQuestionName: string) {
    const uuids = singleProcessingStore.getSubmissionsUuids();
    if (uuids) {
      const questionUuids = uuids[newQuestionName];
      // We use the first available one as the default one. User can select
      // other submission after question is loaded.
      const firstUuid = questionUuids.find((uuidOrNull) => uuidOrNull !== null);
      if (firstUuid) {
        this.goToSubmission(newQuestionName, firstUuid);
      }
    }
  }

  getQuestionSelectorOptions() {
    const options: KoboSelectOption[] = [];
    const uuids = singleProcessingStore.getSubmissionsUuids();
    if (uuids) {
      Object.keys(uuids).forEach((questionName) => {
        // At this point we want to find out whether the question has at least
        // one uuid (i.e. there is at least one transcriptable response to
        // the question). Otherwise there's no point in having the question as
        // selectable option.
        const questionUuids = uuids[questionName];
        const hasAtLeastOneUuid = Boolean(questionUuids.find((uuidOrNull) => uuidOrNull !== null));
        if (hasAtLeastOneUuid) {
          const questionType = getRowType(this.props.assetContent, questionName);
          const translatedLabel = getTranslatedRowLabel(
            questionName,
            this.props.assetContent.survey,
            0
          );
          options.push({
            id: questionName,
            label: translatedLabel !== null ? translatedLabel : questionName,
            icon: getRowTypeIcon(questionType),
          });
        }
      });
    }
    return options;
  }

  /** Goes back to table view for given asset. */
  onDone() {
    const newRoute = ROUTES.FORM_TABLE.replace(':uid', this.props.assetUid);
    hashHistory.push(newRoute);
  }

  /** Goes to another submission. */
  goToSubmission(questionName: string, targetSubmissionUuid: string) {
    const newRoute = ROUTES.FORM_PROCESSING
      .replace(':uid', this.props.assetUid)
      .replace(':questionName', questionName)
      .replace(':submissionUuid', targetSubmissionUuid);
    hashHistory.push(newRoute);
  }

  goPrev() {
    const prevUuid = this.getPrevSubmissionUuid();
    if (prevUuid !== null) {
      this.goToSubmission(this.props.questionName, prevUuid);
    }
  }

  goNext() {
    const nextUuid = this.getNextSubmissionUuid();
    if (nextUuid !== null) {
      this.goToSubmission(this.props.questionName, nextUuid);
    }
  }

  /**
   * Returns a natural number (beginning with 1, not 0) or `null` when store
   * is not ready yet.
   */
  getCurrentSubmissionNumber(): number | null {
    const uuids = singleProcessingStore.getCurrentQuestionSubmissionsUuids();
    if (Array.isArray(uuids)) {
      return uuids.indexOf(this.props.submissionUuid) + 1;
    }
    return null;
  }

  /**
   * Looks for closest previous submissionUuid that has data - i.e. it omits all
   * `null`s in `submissionsUuids` array. If there is no such `submissionUuid`
   * found, simply returns `null`.
   */
  getPrevSubmissionUuid(): string | null {
    const uuids = singleProcessingStore.getCurrentQuestionSubmissionsUuids();
    if (!Array.isArray(uuids)) {
      return null;
    }
    const currentIndex = uuids.indexOf(this.props.submissionUuid);

    // If not found current submissionUuid in the array,
    // we don't know what is next.
    if (currentIndex === -1) {
      return null;
    }
    // If on first element already, there is no previous.
    if (currentIndex === 0) {
      return null;
    }

    // Finds the closest non-`null` submissionUuid going backwards from
    // the current one.
    const leftSubmissionsIds = uuids.slice(0, currentIndex);
    let foundId: string | null = null;
    leftSubmissionsIds.forEach((id) => {
      if (id !== null) {
        foundId = id;
      }
    });

    return foundId;
  }

  /**
   * Looks for closest next submissionUuid that has data - i.e. it omits all
   * `null`s in `submissionsUuids` array. If there is no such `submissionUuid`
   * found, simply returns `null`.
   */
  getNextSubmissionUuid(): string | null {
    const uuids = singleProcessingStore.getCurrentQuestionSubmissionsUuids();
    if (!Array.isArray(uuids)) {
      return null;
    }
    const currentIndex = uuids.indexOf(this.props.submissionUuid);

    // If not found current submissionUuid in the array,
    // we don't know what is next.
    if (currentIndex === -1) {
      return null;
    }
    // If on last element already, there is no next.
    if (currentIndex === uuids.length - 1) {
      return null;
    }

    // Finds the closest non-`null` submissionUuid going forwards from
    // the current one.
    const rightSubmissionsIds = uuids.slice(currentIndex + 1);
    let foundId: string | null = null;
    rightSubmissionsIds.find((id) => {
      if (id !== null) {
        foundId = id;
        return true;
      }
      return false;
    });

    return foundId;
  }

  render() {
    const uuids = singleProcessingStore.getCurrentQuestionSubmissionsUuids();

    return (
      <bem.SingleProcessingHeader>
        <bem.SingleProcessingHeader__column m='main'>
          <KoboSelect
            name='single-processing-question-selector'
            type='gray'
            size='l'
            options={this.getQuestionSelectorOptions()}
            selectedOption={this.props.questionName}
            onChange={this.onQuestionSelectChange.bind(this)}
          />
        </bem.SingleProcessingHeader__column>

        <bem.SingleProcessingHeader__column>
          <bem.SingleProcessingHeader__submissions>
            <Button
              type='bare'
              size='s'
              color='storm'
              startIcon='caret-left'
              onClick={this.goPrev.bind(this)}
              isDisabled={this.getPrevSubmissionUuid() === null}
            />

            <bem.SingleProcessingHeader__count>
              <strong>
                {t('Submission')}
                &nbsp;
                {this.getCurrentSubmissionNumber()}
              </strong>
              &nbsp;
              {Array.isArray(uuids) &&
                t('of ##total_count##').replace('##total_count##', String(uuids.length))
              }
            </bem.SingleProcessingHeader__count>

            <Button
              type='bare'
              size='s'
              color='storm'
              endIcon='caret-right'
              onClick={this.goNext.bind(this)}
              isDisabled={this.getNextSubmissionUuid() === null}
            />
          </bem.SingleProcessingHeader__submissions>
        </bem.SingleProcessingHeader__column>

        <bem.SingleProcessingHeader__column>
          <Button
            type='frame'
            size='l'
            color='blue'
            label={t('DONE')}
            onClick={this.onDone.bind(this)}
          />
        </bem.SingleProcessingHeader__column>
      </bem.SingleProcessingHeader>
    );
  }
}
