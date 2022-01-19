import React from 'react';
import reactMixin from 'react-mixin';
import autoBind from 'react-autobind';
import Reflux from 'reflux';
import DocumentTitle from 'react-document-title';
import {actions} from 'js/actions';
import bem from 'js/bem';
import {stores} from 'js/stores';
import TextBox from 'js/components/common/textBox';
import Checkbox from 'js/components/common/checkbox';
import WrappedSelect from 'js/components/common/wrappedSelect';
import ApiTokenDisplay from 'js/components/apiTokenDisplay';
import {stringToColor} from 'utils';
import {ROUTES} from 'js/router/routerConstants';
import envStore from 'js/envStore';
import './accountSettings.scss';

const UNSAVED_CHANGES_WARNING = t('You have unsaved changes. Leave settings without saving?');

export default class AccountSettings extends React.Component {
  constructor(props){
    super(props);
    this.state = {
      isPristine: true,
      requireAuth: false,
      fieldsWithErrors: {},
    };
    autoBind(this);
  }

  rebuildState() {
    if (
      stores.session.isLoggedIn &&
      envStore.isReady
    ) {
      this.setStateFromSession(
        stores.session.currentAccount,
        envStore.data
      );
    }
  }

  componentDidMount() {
    this.props.router.setRouteLeaveHook(this.props.route, this.routerWillLeave);
    this.listenTo(stores.session, this.rebuildState);
    this.rebuildState();
  }

  componentWillUnmount() {
    this.unpreventClosingTab();
  }

  routerWillLeave() {
    if (!this.state.isPristine) {
      return UNSAVED_CHANGES_WARNING;
    }
  }

  setStateFromSession(currentAccount, environment) {
    if (currentAccount.extra_details === undefined) {
      currentAccount.extra_details = {};
    }

    this.setState({
      name: currentAccount.extra_details.name,
      email: currentAccount.email,
      organization: currentAccount.extra_details.organization,
      organizationWebsite: currentAccount.extra_details.organization_website,
      primarySector: currentAccount.extra_details.sector,
      gender: currentAccount.extra_details.gender,
      bio: currentAccount.extra_details.bio,
      city: currentAccount.extra_details.city,
      country: currentAccount.extra_details.country,
      requireAuth: currentAccount.extra_details.require_auth,
      twitter: currentAccount.extra_details.twitter,
      linkedin: currentAccount.extra_details.linkedin,
      instagram: currentAccount.extra_details.instagram,
      metadata: currentAccount.extra_details.metadata,

      languageChoices: environment.all_languages,
      countryChoices: environment.country_choices,
      sectorChoices: environment.sector_choices,
      genderChoices: [
        {
          value: 'male',
          label: t('Male'),
        },
        {
          value: 'female',
          label: t('Female'),
        },
        {
          value: 'other',
          label: t('Other'),
        },
      ],
      fieldsWithErrors: {},
    });
  }

  preventClosingTab() {
    $(window).on('beforeunload.noclosetab', () => (UNSAVED_CHANGES_WARNING));
  }

  unpreventClosingTab() {
    $(window).off('beforeunload.noclosetab');
  }

  updateProfile() {
    actions.misc.updateProfile(
      {
        email: this.state.email,
        extra_details: JSON.stringify({
          name: this.state.name,
          organization: this.state.organization,
          organization_website: this.state.organizationWebsite,
          sector: this.state.primarySector,
          gender: this.state.gender,
          bio: this.state.bio,
          city: this.state.city,
          country: this.state.country,
          require_auth: this.state.requireAuth,
          twitter: this.state.twitter,
          linkedin: this.state.linkedin,
          instagram: this.state.instagram,
          metadata: this.state.metadata,
        }),
      },
      {
        onComplete: this.onUpdateComplete.bind(this),
        onFail: this.onUpdateFail.bind(this),
      }
    );
  }

  onUpdateComplete() {
    this.unpreventClosingTab();
    this.setState({
      isPristine: true,
      fieldsWithErrors: {},
    });
  }

  onUpdateFail(data) {
    this.setState({fieldsWithErrors: data.responseJSON});
  }

  onAnyDataChange(fieldName, newValue) {
    this.preventClosingTab();
    this.setState({
      isPristine: false,
      [fieldName]: newValue,
    });

  }

  render() {
    if(!stores.session.isLoggedIn || !envStore.isReady) {
      return null;
    }

    var accountName = stores.session.currentAccount.username;
    var initialsStyle = {
      background: `#${stringToColor(accountName)}`,
    };

    return (
      <DocumentTitle title={`${accountName} | KoboToolbox`}>
        <bem.AccountSettings>
          <bem.AccountSettings__actions>
            <bem.KoboButton
              className='account-settings-save'
              onClick={this.updateProfile}
              m={['blue']}
            >
              {t('Save Changes')}
              {!this.state.isPristine && ' *'}
            </bem.KoboButton>
          </bem.AccountSettings__actions>

          <bem.AccountSettings__item m={'column'}>
            <bem.AccountSettings__item m='username'>
              <bem.AccountBox__initials style={initialsStyle}>
                {accountName.charAt(0)}
              </bem.AccountBox__initials>

              <h4>{accountName}</h4>
            </bem.AccountSettings__item>

            <bem.AccountSettings__item m='fields'>
              <bem.AccountSettings__item>
                <label>{t('Privacy')}</label>

                <Checkbox
                  checked={this.state.requireAuth}
                  onChange={this.onAnyDataChange.bind(this, 'requireAuth')}
                  label={t('Require authentication to see forms and submit data')}
                />
              </bem.AccountSettings__item>

              <bem.AccountSettings__item>
                <TextBox
                  customModifiers='on-white'
                  label={t('Name')}
                  errors={this.state.fieldsWithErrors.name}
                  value={this.state.name}
                  onChange={this.onAnyDataChange.bind(this, 'name')}
                  placeholder={t('Use this to display your real name to other users')}
                />
              </bem.AccountSettings__item>

              <bem.AccountSettings__item>
                <TextBox
                  customModifiers='on-white'
                  label={t('Email')}
                  type='email'
                  errors={this.state.fieldsWithErrors.email}
                  value={this.state.email}
                  onChange={this.onAnyDataChange.bind(this, 'email')}
                />
              </bem.AccountSettings__item>

              <bem.AccountSettings__item m='password'>
                <a
                  href={`/#${ROUTES.CHANGE_PASSWORD}`}
                  className='kobo-button kobo-button--blue'
                >
                  {t('Modify Password')}
                </a>
              </bem.AccountSettings__item>

              <ApiTokenDisplay/>

              {envStore.data.getUserMetadataField('organization') &&
                <bem.AccountSettings__item>
                  <TextBox
                    customModifiers='on-white'
                    label={t('Organization')}
                    errors={this.state.fieldsWithErrors.extra_details?.organization}
                    value={this.state.organization}
                    onChange={this.onAnyDataChange.bind(this, 'organization')}
                  />
                </bem.AccountSettings__item>
              }

              {envStore.data.getUserMetadataField('organization_website') &&
                <bem.AccountSettings__item>
                  <TextBox
                    customModifiers='on-white'
                    label={t('Organization Website')}
                    type='url'
                    errors={this.state.fieldsWithErrors.extra_details?.organization_website}
                    value={this.state.organizationWebsite}
                    onChange={this.onAnyDataChange.bind(this, 'organizationWebsite')}
                  />
                </bem.AccountSettings__item>
              }

              {envStore.data.getUserMetadataField('sector') &&
                <bem.AccountSettings__item m='primary-sector'>
                  <WrappedSelect
                    label={t('Primary Sector')}
                    error={this.state.fieldsWithErrors.extra_details?.sector}
                    value={this.state.primarySector}
                    options={this.state.sectorChoices}
                    onChange={this.onAnyDataChange.bind(this, 'primarySector')}
                  />

                  <bem.AccountSettings__desc>
                    {t('Select the primary sector in which you work. ')}
                  </bem.AccountSettings__desc>
                </bem.AccountSettings__item>
              }

              {envStore.data.getUserMetadataField('gender') &&
                <bem.AccountSettings__item m='gender'>
                  <WrappedSelect
                    label={t('Gender')}
                    error={this.state.fieldsWithErrors.extra_details?.gender}
                    value={this.state.gender}
                    options={this.state.genderChoices}
                    onChange={this.onAnyDataChange.bind(this, 'gender')}
                    isClearable
                    isSearchable={false}
                  />
                </bem.AccountSettings__item>
              }

              {envStore.data.getUserMetadataField('bio') &&
                <bem.AccountSettings__item m='bio'>
                  <TextBox
                    customModifiers='on-white'
                    type='text-multiline'
                    label={t('Bio')}
                    onChange={this.onAnyDataChange.bind(this, 'bio')}
                    errors={this.state.fieldsWithErrors.extra_details?.bio}
                    value={this.state.bio}
                    id='bio'
                  />
                </bem.AccountSettings__item>
              }

              {envStore.data.getUserMetadataField('country') &&
                <bem.AccountSettings__item m='country'>
                  <WrappedSelect
                    isMulti
                    label={t('Country')}
                    error={this.state.fieldsWithErrors.extra_details?.country}
                    value={this.state.country}
                    options={this.state.countryChoices}
                    onChange={this.onAnyDataChange.bind(this, 'country')}
                  />
                </bem.AccountSettings__item>
              }

              {envStore.data.getUserMetadataField('city') &&
                <bem.AccountSettings__item m='city'>
                  <TextBox
                    customModifiers='on-white'
                    label={t('City')}
                    errors={this.state.fieldsWithErrors.extra_details?.city}
                    value={this.state.city}
                    onChange={this.onAnyDataChange.bind(this, 'city')}
                  />
                </bem.AccountSettings__item>
              }

              {(envStore.data.getUserMetadataField('twitter')
               || envStore.data.getUserMetadataField('linkedin')
               || envStore.data.getUserMetadataField('instagram')) &&

                <bem.AccountSettings__item m='social'>
                  <label>{t('Social')}</label>

                  {envStore.data.getUserMetadataField('twitter') &&
                    <label>
                      <i className='k-icon k-icon-logo-twitter' />

                      <TextBox
                        customModifiers='on-white'
                        errors={this.state.fieldsWithErrors.extra_details?.twitter}
                        value={this.state.twitter}
                        onChange={this.onAnyDataChange.bind(this, 'twitter')}
                      />
                    </label>
                  }

                  {envStore.data.getUserMetadataField('linkedin') &&
                    <label>
                      <i className='k-icon k-icon-logo-linkedin' />

                      <TextBox
                        customModifiers='on-white'
                        errors={this.state.fieldsWithErrors.extra_details?.linkedin}
                        value={this.state.linkedin}
                        onChange={this.onAnyDataChange.bind(this, 'linkedin')}
                      />
                    </label>
                  }

                  {envStore.data.getUserMetadataField('instagram') &&
                    <label>
                      <i className='k-icon k-icon-logo-instagram' />

                      <TextBox
                        customModifiers='on-white'
                        errors={this.state.fieldsWithErrors.extra_details?.instagram}
                        value={this.state.instagram}
                        onChange={this.onAnyDataChange.bind(this, 'instagram')}
                      />
                    </label>
                  }
                </bem.AccountSettings__item>
              }

              <bem.AccountSettings__item>
                <TextBox
                  customModifiers='on-white'
                  label={t('Metadata')}
                  errors={this.state.fieldsWithErrors.metadata}
                  value={this.state.metadata}
                  onChange={this.onAnyDataChange.bind(this, 'metadata')}
                />
              </bem.AccountSettings__item>
            </bem.AccountSettings__item>
          </bem.AccountSettings__item>
        </bem.AccountSettings>
      </DocumentTitle>
    );
  }
}

reactMixin(AccountSettings.prototype, Reflux.connect(stores.session, 'session'));
reactMixin(AccountSettings.prototype, Reflux.ListenerMixin);
