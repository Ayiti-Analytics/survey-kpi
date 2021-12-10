import React from 'react'
import bem, {makeBem} from 'js/bem'
import {
  AnyRowTypeName,
  QUESTION_TYPES,
  META_QUESTION_TYPES,
  ADDITIONAL_SUBMISSION_PROPS,
} from 'js/constants'
import SubmissionDataList from 'js/components/submissions/submissionDataList'
import {
  getRowData,
  getMediaAttachment,
} from 'js/components/submissions/submissionUtils'
import AudioPlayer from 'js/components/common/audioPlayer'
import './singleProcessingSubmissionDetails.scss'

bem.SingleProcessingMediaWrapper = makeBem(
  null,
  'single-processing-media-wrapper',
  'section'
)
bem.SingleProcessingDataListWrapper = makeBem(
  null,
  'single-processing-data-list-wrapper',
  'section'
)

type SingleProcessingSubmissionDetailsProps = {
  questionType: AnyRowTypeName | undefined
  questionName: string
  assetContent: AssetContent
  submissionData: SubmissionResponse
}

export default class SingleProcessingSubmissionDetails extends React.Component<
  SingleProcessingSubmissionDetailsProps
> {
  constructor(props: SingleProcessingSubmissionDetailsProps) {
    super(props)
  }

  renderMedia() {
    // Only allow audio types for now
    if (
      !this.props.assetContent.survey ||
      (
        this.props.questionType !== QUESTION_TYPES.audio.id &&
        this.props.questionType !== META_QUESTION_TYPES['background-audio']
      )
    ) {
      return null
    }

    const rowData = getRowData(
      this.props.questionName,
      this.props.assetContent.survey,
      this.props.submissionData
    )

    if (rowData === null) {
      return null
    }

    const attachment = getMediaAttachment(this.props.submissionData, rowData)

    if (typeof attachment === 'string') {
      return
    }

    return (
      <bem.SingleProcessingMediaWrapper key='media'>
        <AudioPlayer mediaURL={attachment.download_url} />
      </bem.SingleProcessingMediaWrapper>
    )
  }

  /** We want only the processing related data (the actual form questions) */
  getQuestionsToHide(): string[] {
    return [
      this.props.questionName,
      ...Object.keys(ADDITIONAL_SUBMISSION_PROPS),
      ...Object.keys(META_QUESTION_TYPES)
    ]
  }

  render() {
    return (
      [
        this.renderMedia(),
        <bem.SingleProcessingDataListWrapper key='data-list'>
          <SubmissionDataList
            assetContent={this.props.assetContent}
            submissionData={this.props.submissionData}
            hideQuestions={this.getQuestionsToHide()}
          />
        </bem.SingleProcessingDataListWrapper>
      ]
    )
  }
}
