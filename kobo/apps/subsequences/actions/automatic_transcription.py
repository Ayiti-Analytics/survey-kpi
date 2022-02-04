from ..actions.base import BaseAction, ACTION_NEEDED, PASSES

NOT_REQUESTED = 'NOT_REQUESTED'
REQUESTED_BY_USER = 'REQUESTED_BY_USER'
PENDING = 'PENDING'


DT_MOD = BaseAction.DATE_MODIFIED_FIELD
DT_CREATED = BaseAction.DATE_CREATED_FIELD

class AutomaticTranscriptionAction(BaseAction):
    ID = 'transcript'
    MANUAL = 'user_transcribed'
    TRANSCRIPTION_SERVICES = (
        'transcript_acme',
    )

    @classmethod
    def build_params(kls, params, content):
        possible_transcribed_fields = []
        for row in content.get('survey', []):
            if row['type'] in ['audio', 'video']:
                possible_transcribed_fields.append(kls.get_name(kls, row))
        params = {'values': possible_transcribed_fields, 'services': kls.TRANSCRIPTION_SERVICES}
        return params

    @classmethod
    def get_values_for_content(kls, content):
        possible_transcribed_fields = []
        for row in content.get('survey', []):
            if row['type'] in ['audio', 'video']:
                possible_transcribed_fields.append(kls.get_name(kls, row))
        return possible_transcribed_fields

    def load_params(self, params):
        self.possible_transcribed_fields = params['values']
        self.available_services = params.get('services', [])

    def modify_jsonschema(self, schema):
        defs = schema.get('definitions', {})
        HASH_PROPERTY = {'type': 'string',
                         'minLength': 8,
                         'maxLength': 8,
                         '$comment': 'set by the server'}
        defs['transcript'] = {
            'type': 'object',
            'properties': {
                'value': {'type': 'string'},
                'engine': {'type': 'string'},
                self.DATE_CREATED_FIELD: {'type': 'string',
                                          'format': 'date-time'},
                self.DATE_MODIFIED_FIELD: {'type': 'string',
                                           'format': 'date-time'},
                'languageCode': {'type': 'string'},
                'hash': HASH_PROPERTY,
                'revisions': {'type': 'array', 'items': {
                    '$ref': '#/definitions/transcriptRevision'
                }}
            },
            'additionalProperties': False,
            'required': ['value'],
        }
        defs['transcriptRevision'] = {
            'type': 'object',
            'properties': {
                'value': {'type': 'string'},
                'engine': {'type': 'string'},
                self.DATE_MODIFIED_FIELD: {'type': 'string',
                                           'format': 'date-time'},
                'hash': HASH_PROPERTY,
                'languageCode': {'type': 'string'},
            },
            'additionalProperties': False,
            'required': ['value'],
        }
        for field in self.possible_transcribed_fields:
            field_def = schema['properties'].get(field, {
                'type': 'object',
                'properties': {},
                'additionalProperties': False,
            })
            field_def['properties'][self.ID] = {
                '$ref': '#/definitions/transcript'
            }
            schema['properties'][field] = field_def
        schema['definitions'] = defs
        return schema

    def check_submission_status(self, submission):
        if self._destination_field not in submission:
            return ACTION_NEEDED
        supp_data = submission[self._destination_field]

        for (field, service, fs_key) in self.field_service_matrix():
            if fs_key not in supp_data:
                return ACTION_NEEDED
            status = supp_data.get(fs_key)
            if status == REQUESTED_BY_USER:
                return ACTION_NEEDED
        return PASSES

    def addl_fields(self):
        service = 'manual'
        for field in self.possible_transcribed_fields:
            label = f'{field} Transcript (en)'
            yield {
                'type': 'text',
                'name': f'{field}/{service}',
                'label': label,
                'path': [field, service],
                'source': field,
                'settings': {
                    'mode': 'auto',
                    'engine': f'engines/transcript_{service}',
                }
            }

    '''
    {"value": "My translation", "languageCode": "en", "date": "12today"}

    AQ1 Translation (FR)	AQ1 Translation (XZ)
    --------------------    --------------------
    "My translation"
    '''

    def engines(self):
        manual_name = f'engines/transcript_manual'
        manual_engine = {
            'details': 'A human provided transcription'
        }
        yield (manual_name, manual_engine)
        for service in self.available_services:
            name = f'engines/transcript_{service}'
            yield (name, {
                'description': f'Transcription by {service}'
            })

    def field_service_matrix(self):
        for field in self.possible_transcribed_fields:
            yield (field,
                   'manual',
                   f'{field}_transcription_manual')
            for service in self.available_services:
                fs_key = f'{field}_transcription_{service}'
                yield (field, service, fs_key)

    def run_change(self, submission):
        supp_data = submission.get(self._destination_field, {})
        for field, service, fs_key in self.field_service_matrix():
            if fs_key not in supp_data:
                supp_data[fs_key] = NOT_REQUESTED
                continue
            field_service_status = supp_data[fs_key]
            if field_service_status == REQUESTED_BY_USER:
                # self.initiate_async_request(submission, field, service)
                supp_data[fs_key] = PENDING
                continue
        return {**submission, self._destination_field: supp_data}
