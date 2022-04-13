import React, {useEffect, useMemo, useReducer} from 'react';
import ReactSelect from 'react-select';
// @ts-ignore
import {dataInterface} from 'js/dataInterface';
import bem, {makeBem} from 'js/bem';
import {FlatQuestion, getFlatQuestionsList} from 'jsapp/js/assetUtils';
import './formGallery.scss';

bem.Gallery = makeBem(null, 'gallery');
bem.Gallery__wrapper = makeBem(bem.Gallery, 'wrapper');
bem.Gallery__header = makeBem(bem.Gallery, 'header');
bem.Gallery__icons = makeBem(bem.Gallery, 'icons');
bem.GalleryRow = makeBem(null, 'gallery-row');
bem.GalleryRow__select = makeBem(bem.GalleryRow, 'select');
bem.GalleryRow__dates = makeBem(bem.GalleryRow, 'dates');
bem.GalleryGrid = makeBem(null, 'gallery-grid');

interface State {
  submissions: SubmissionResponse[];
  loading: boolean;
  next: string | null;
  filterQuestion: string | null;
  startDate: string;
  endDate: string;
}

const initialState: State = {
  loading: false,
  submissions: [],
  next: null,
  // Would be nice to move filters to query params
  filterQuestion: null,
  startDate: '',
  endDate: '',
};

type Action =
  | {type: 'getSubmissions'}
  | {
      type: 'getSubmissionsCompleted';
      resp: PaginatedResponse<SubmissionResponse>;
    }
  | {type: 'getSubmissionsFailed'}
  | {type: 'loadMoreSubmissions'}
  | {
      type: 'loadMoreSubmissionsCompleted';
      resp: PaginatedResponse<SubmissionResponse>;
    }
  | {type: 'loadMoreSubmissionsFailed'}
  | {type: 'setFilterQuestion'; question: string}
  | {type: 'setStartDate'; value: string}
  | {type: 'setEndDate'; value: string};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'getSubmissions':
      return {
        ...state,
        loading: true,
        submissions: [],
        next: null,
      };
    case 'getSubmissionsCompleted':
      return {
        ...state,
        loading: false,
        submissions: action.resp.results,
        next: action.resp.next,
      };
    case 'getSubmissionsFailed':
      return {
        ...state,
        loading: false,
      };
    case 'loadMoreSubmissionsCompleted':
      return {
        ...state,
        loading: false,
        submissions: [...state.submissions, ...action.resp.results],
        next: action.resp.next,
      };
    case 'setFilterQuestion':
      return {
        ...state,
        filterQuestion: action.question,
      };
    case 'setStartDate':
      console.log(action.value);
      return {
        ...state,
        startDate: action.value,
      };
    case 'setEndDate':
      return {
        ...state,
        endDate: action.value,
      };
  }
  return state;
}

const IMAGE_MIMETYPES = [
  'image/png',
  'image/gif',
  'image/jpeg',
  'image/svg+xml',
];
const PAGE_SIZE = 30;

/** Represents a JavaScript object that was parsed from JSON */
type Json = null | boolean | number | string | Json[] | {[key: string]: Json};

/**
 * Find a key anywhere in an object (supports nesting)
 * Based on https://stackoverflow.com/a/15524326/443457
 * @param theObject - object to search
 * @param key - key to find
 * @returns value of the found key
 */
function findByKey(theObject: Json, key: string): Json {
  let result = null;
  if (theObject instanceof Array) {
    for (let i = 0; i < theObject.length; i++) {
      result = findByKey(theObject[i], key);
      if (result) {
        break;
      }
    }
  } else if (theObject instanceof Object) {
    for (let prop in theObject) {
      if (prop == key) {
        return theObject[key];
      }
      if (
        theObject[prop] instanceof Object ||
        theObject[prop] instanceof Array
      ) {
        result = findByKey(theObject[prop], key);
        if (result) {
          break;
        }
      }
    }
  }
  return result;
}

const selectImageAttachments = (
  submissions: SubmissionResponse[],
  filterQuestion: string | null
) =>
  ([] as SubmissionAttachment[]).concat.apply(
    [],
    submissions.map((submission) => {
      const attachments = submission._attachments.filter((attachment) =>
        IMAGE_MIMETYPES.includes(attachment.mimetype)
      );
      if (filterQuestion) {
        const filename = findByKey(submission, filterQuestion);
        return attachments.filter(
          (attachment) =>
            attachment.filename.split('/').slice(-1)[0] === filename
        );
      }
      return attachments;
    })
  );
const selectShowLoadMore = (next: string | null) => !!next;
const selectFilterQuery = (
  filterQuestion: string | null,
  flatQuestionsList: FlatQuestion[],
  startDate: string,
  endDate: string
) => {
  if (!filterQuestion && !startDate && !endDate) {
    return;
  }
  let query: Json = {};
  if (filterQuestion) {
    const flatQuestion = flatQuestionsList.find(
      (flatQuestion) => flatQuestion.path === filterQuestion
    );

    /**
     * Build query like this:
     * {
     *   "group_a/group_b": {
     *     "$elemMatch": {
     *       "group_a/group_b/group_c/group_d": {
     *         "$elemMatch": {
     *           "group_a/group_b/group_c/group_d/group_e/question": {
     *             "$exists": true
     *           }
     *         }
     *       }
     *     }
     *   }
     * }
     * There is no limit on how nested it can be due to nested repeating groups
     *
     * First separate our repeating group names (which get nested in arrays) and group names
     * (which get joined with /). This mimics the elemMatch structure we need
     */
    const repeatingGroupNames: string[] = [];
    const groupNames: string[] = [];
    flatQuestion?.parentRows.map((row) => {
      if (row.type === 'begin_group') {
        groupNames.push(row.$autoname);
      } else if (row.type === 'begin_repeat') {
        groupNames.push(row.$autoname);
        repeatingGroupNames.push(groupNames.join('/'));
      }
    });
    // The initialValue is the inner most part of the query where we actually filter on the question
    const initialValue: Json = {[filterQuestion]: {$exists: true}};
    // Build nested elemMatch objects, start from the inner most and build outwards
    query = repeatingGroupNames.reverse().reduce(
      (previousValue, currentValue) => ({
        [currentValue]: {$elemMatch: previousValue},
      }),
      initialValue
    );
    // Whew, thanks to initial value this works even with 0 repeating groups
  }
  if (startDate || endDate) {
    // $and is necessary as repeating a json key is not valid
    const andQuery: Json = [];
    if (startDate) {
      andQuery.push({_submission_time: {$gt: startDate}});
    }
    if (endDate) {
      andQuery.push({_submission_time: {$lt: endDate}});
    }
    query['$and'] = andQuery;
  }
  return '&query=' + JSON.stringify(query);
};

interface FormGalleryProps {
  asset: AssetResponse;
}

export default function FormGallery(props: FormGalleryProps) {
  const flatQuestionsList = getFlatQuestionsList(
    props.asset.content!.survey!
  ).filter((survey) => survey.type === 'image');
  const questions = flatQuestionsList.map((survey) => ({
    value: survey.path,
    label:
      survey.parents.join(' / ') +
      (survey.parents.length ? ' / ' : '') +
      survey.label,
  }));
  const defaultOption = {value: '', label: 'All questions'};
  const questionFilterOptions = [defaultOption, ...(questions || [])];
  const [{submissions, next, filterQuestion, startDate, endDate}, dispatch] =
    useReducer(reducer, initialState);

  const attachments = useMemo(
    () => selectImageAttachments(submissions, filterQuestion),
    [submissions]
  );
  const showLoadMore = useMemo(() => selectShowLoadMore(next), [next]);
  const filterQuery = useMemo(
    () =>
      selectFilterQuery(filterQuestion, flatQuestionsList, startDate, endDate),
    [filterQuestion, startDate, endDate]
  );

  useEffect(() => {
    dispatch({type: 'getSubmissions'});
    dataInterface
      .getSubmissions(props.asset.uid, PAGE_SIZE, 0, [], [], filterQuery)
      .done((resp: PaginatedResponse<SubmissionResponse>) =>
        dispatch({type: 'getSubmissionsCompleted', resp})
      );
  }, [filterQuestion, startDate, endDate]);

  const loadMoreSubmissions = () => {
    if (next) {
      // The needed start offset is already in the next state, extract it
      const start = new URL(next).searchParams.get('start');
      if (start) {
        dispatch({type: 'loadMoreSubmissions'});

        dataInterface
          .getSubmissions(
            props.asset.uid,
            PAGE_SIZE,
            start,
            [],
            [],
            filterQuery
          )
          .done((resp: PaginatedResponse<SubmissionResponse>) =>
            dispatch({type: 'loadMoreSubmissionsCompleted', resp})
          );
      }
    }
  };

  return (
    <bem.Gallery className='form-view'>
      <bem.Gallery__wrapper>
        <bem.Gallery__header>
          <h1>Image Gallery</h1>
          <bem.Gallery__icons>
            <i className='k-icon-download' />
            <i className='k-icon-settings' />
            <i className='k-icon-expand' />
          </bem.Gallery__icons>
        </bem.Gallery__header>
        <bem.GalleryRow>
          From
          <bem.GalleryRow__select>
            <ReactSelect
              options={questionFilterOptions}
              defaultValue={defaultOption}
              onChange={(newValue) =>
                dispatch({type: 'setFilterQuestion', question: newValue!.value})
              }
            ></ReactSelect>
          </bem.GalleryRow__select>
          <bem.GalleryRow__dates>
            Between
            <input
              type='date'
              onChange={(e) =>
                dispatch({type: 'setStartDate', value: e.target.value})
              }
            ></input>
            and
            <input
              type='date'
              onChange={(e) =>
                dispatch({type: 'setEndDate', value: e.target.value})
              }
            ></input>
          </bem.GalleryRow__dates>
        </bem.GalleryRow>
        <bem.GalleryGrid>
          {attachments.map((attachment) => (
            <div key={attachment.id}>
              <img
                src={attachment.download_url}
                alt={attachment.filename}
                width='150'
                loading='lazy'
              ></img>
            </div>
          ))}
        </bem.GalleryGrid>
        {showLoadMore && (
          <button onClick={() => loadMoreSubmissions()}>Show more</button>
        )}
      </bem.Gallery__wrapper>
    </bem.Gallery>
  );
}
