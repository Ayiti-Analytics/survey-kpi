import React from 'react'
import bem, {makeBem} from 'js/bem'
import { stores } from 'jsapp/js/stores'
import QRCode from 'qrcode.react'
import Button from 'js/components/common/button'
import mfaActions, {
  mfaActivatedResponse,
  mfaBackupCodesResponse,
} from 'js/actions/mfaActions'

bem.MFAModals = makeBem(null, 'mfa-setup')
bem.MFAModals__qrstep = makeBem(bem.MFAModals, 'qrstep')
bem.MFAModals__backupstep = makeBem(bem.MFAModals, 'backupstep')
bem.MFAModals__manualstep = makeBem(bem.MFAModals, 'manualstep')
bem.MFAModals__tokenstep = makeBem(bem.MFAModals, 'tokenstep')

bem.MFAModals__title = makeBem(bem.MFAModals, 'title', 'h4')
bem.MFAModals__description = makeBem(bem.MFAModals, 'description')

bem.MFAModals__body = makeBem(bem.MFAModals, 'body')
bem.MFAModals__qr = makeBem(bem.MFAModals, 'qr')
bem.MFAModals__token = makeBem(bem.MFAModals, 'token')
bem.MFAModals__token__input = makeBem(bem.MFAModals__token, 'token__input', 'input')
bem.MFAModals__manual = makeBem(bem.MFAModals, 'manual')
bem.MFAModals__manual__link = makeBem(bem.MFAModals__token, 'manual__link', 'a')
bem.MFAModals__codes = makeBem(bem.MFAModals, 'codes')
bem.MFAModals__codes__item = makeBem(bem.MFAModals__codes, 'item', 'strong')

bem.MFAModals__footer = makeBem(bem.MFAModals, 'footer', 'footer')
bem.MFAModals__footer__left = makeBem(bem.MFAModals__footer, 'footer-left')
bem.MFAModals__footer__right = makeBem(bem.MFAModals__footer, 'footer-right')

type modalSteps = 'qr' | 'backups' | 'manual' | 'token'

type MFAModalsProps = {
  onModalClose: Function,
  qrCode?: string,
  modalType: 'qr' | 'regenerate' | 'reconfigure' | 'deactivate'
}

type MFAModalsState = {
  isLoading: boolean,
  currentStep: modalSteps,
  qrCode: null | string,
  inputString: null | string,
  backupCodes: null | string[],
  downloadClicked: boolean,
}

export default class MFAModals extends React.Component<
  MFAModalsProps,
  MFAModalsState
> {
  constructor(props: MFAModalsProps) {
    super(props)
    this.state = {
      isLoading: true,
      qrCode: this.props.qrCode || null,
      currentStep: this.props.modalType === 'qr' ? 'qr' : 'token',
      // Currently input code, used for confirm
      inputString: null,
      backupCodes: null,
      downloadClicked: false,
    }
  }

  private unlisteners: Function[] = []

  componentDidMount() {
    this.setState({
      isLoading: false,
    })

    this.unlisteners.push(
      mfaActions.activate.completed.listen(this.mfaActivated.bind(this)),
      mfaActions.confirm.completed.listen(this.mfaBackupCodes.bind(this)),
      mfaActions.regenerate.completed.listen(this.mfaBackupCodes.bind(this)),
      mfaActions.deactivate.completed.listen(this.mfaDeactivated.bind(this)),
    )
  }

  componentWillUnmount() {
    this.unlisteners.forEach((clb) => {clb()})
  }

  mfaActivated(response: mfaActivatedResponse) {
    this.setState({
      qrCode: response.details,
      currentStep: 'qr',
    })
  }

  mfaConfirm() {
    mfaActions.confirm(this.state.inputString)
  }

  mfaBackupCodes(response: mfaBackupCodesResponse) {
    this.setState({
      backupCodes: response.backup_codes,
      currentStep: 'backups',
    })
  }

  mfaDeactivate() {
    mfaActions.deactivate(this.state.inputString)
  }

  mfaDeactivated() {
    if (this.props.modalType === 'reconfigure') {
      mfaActions.activate(true)
      console.log('good so far')
    } else {
      this.closeModal()
    }
  }

  mfaRegenerate() {
    mfaActions.regenerate(this.state.inputString)
  }

  closeModal() {
    this.props.onModalClose()
  }


  onInputChange(response: React.FormEvent<HTMLInputElement>) {
    this.setState({inputString: response.currentTarget.value})
  }

  changeStep(
    evt: React.ChangeEvent<HTMLInputElement>,
    nextStep: modalSteps
  ) {
    evt.preventDefault()

    this.setState({currentStep: nextStep})
  }

  getSecretKey(): string {
    // We expect backend to not change the way the secret key is returned
    return (
      this.props?.qrCode?.split('=')[1].split('&')[0] ||
      t('Could not generate secret key')
    )
  }

  isTokenValid(): boolean {
    return this.state.inputString !== null && this.state.inputString.length === 6
  }

  downloadCodes() {
    if (this.state.backupCodes) {
      const USERNAME = stores.session.currentAccount.username
      // gets date in yyyymmdd
      const DATE = new Date().toJSON().slice(0,10).replace(/-/g,'')

      const formatedCodes = this.state.backupCodes.map((t)  => {
        return t + '\n'
      })
      const codesLink = document.createElement('a')
      const codesFile = new Blob(formatedCodes)

      codesLink.href = URL.createObjectURL(codesFile)
      codesLink.download = 'backups_' + USERNAME + '_' + DATE + '.txt'

      document.body.appendChild(codesLink)
      codesLink.click()
      this.setState({downloadClicked: true})
    }
  }

  handleTokenSubmit() {
    switch(this.props.modalType) {
      case 'regenerate':
        this.mfaRegenerate()
        break
      case 'reconfigure':
        this.mfaDeactivate()
        break
      case 'deactivate':
        this.mfaDeactivate()
        break
    }
  }

  renderQRCodeStep() {
    return (
      <bem.MFAModals__qrstep>
        <bem.MFAModals__description>
          {t('Two-factor Authenication (2FA) is an added layer of security used when logging into the platform. We reccomend enabling Two-factor Authenication for an additional layer of protection*.')}
        </bem.MFAModals__description>

        <bem.MFAModals__body>
          <bem.MFAModals__qr>
            <QRCode value={this.state.qrCode || ''}/>
          </bem.MFAModals__qr>

          <bem.MFAModals__token>
            <strong>
              {t('Scan QR code and enter the six-digit token from the application')}
            </strong>

            {t('After scanning the QR code image, the app will display a six-digit code that you can display below.')}

            <bem.MFAModals__token__input
              type='text'
              onChange={this.onInputChange.bind(this)}
            />
            <bem.MFAModals__manual>
              {t('No QR code?')}

              &nbsp;

              <bem.MFAModals__manual__link
                onClick={(evt: React.ChangeEvent<HTMLInputElement>) => {
                  this.changeStep(evt, 'manual')
                }}
              >
                {t('Enter key manually')}
              </bem.MFAModals__manual__link>
            </bem.MFAModals__manual>
          </bem.MFAModals__token>
        </bem.MFAModals__body>

        <bem.MFAModals__footer>
          <bem.MFAModals__footer__right>
            <Button
              type='full'
              color='blue'
              size='l'
              isFullWidth={true}
              label={t('Next')}
              onClick={this.mfaConfirm.bind(this)}
              isDisabled={!this.isTokenValid()}
            />
          </bem.MFAModals__footer__right>
        </bem.MFAModals__footer>
      </bem.MFAModals__qrstep>
    )
  }

  renderBackupStep() {
    return(
      <bem.MFAModals__backupstep>
        <bem.MFAModals__description>
          {t('The following recovery codes will help you access your account in case your authenticator fails. These codes are unique and fill not be stored in your KoBo account. Please download the file and keep it somewhere safe.')}
        </bem.MFAModals__description>

        <bem.MFAModals__body>
          {this.state.backupCodes &&
            <bem.MFAModals__codes>
              {this.state.backupCodes.map((t) => {
                return (
                  <bem.MFAModals__codes__item>
                    {t}
                  </bem.MFAModals__codes__item>
                )
              })}
            </bem.MFAModals__codes>
          }
        </bem.MFAModals__body>

        <bem.MFAModals__footer>
          <bem.MFAModals__footer__left>
            <Button
              type='frame'
              color='blue'
              size='l'
              isFullWidth={true}
              label={t('Download codes')}
              onClick={this.downloadCodes.bind(this)}
            />
          </bem.MFAModals__footer__left>

          <bem.MFAModals__footer__right>
            <Button
              type='full'
              color='blue'
              size='l'
              isFullWidth={true}
              label={t('I have saved my recovery codes')}
              onClick={this.closeModal.bind(this)}
              isDisabled={!this.state.downloadClicked}
            />
          </bem.MFAModals__footer__right>
        </bem.MFAModals__footer>
      </bem.MFAModals__backupstep>
    )
  }

  renderManualStep() {
    return(
      <bem.MFAModals__manualstep>
        <bem.MFAModals__description>
          {t('Enter the following key into your authentication app to generate the six digit token')}
        </bem.MFAModals__description>

        <bem.MFAModals__body>
          <bem.MFAModals__codes>
            {this.getSecretKey()}
          </bem.MFAModals__codes>
        </bem.MFAModals__body>

        <bem.MFAModals__footer>
          <bem.MFAModals__footer__right>
            <Button
              type='full'
              color='blue'
              size='l'
              isFullWidth={true}
              label={t('OK')}
              onClick={(evt: React.ChangeEvent<HTMLInputElement>) => {
                this.changeStep(evt, 'qr')
              }}
            />
          </bem.MFAModals__footer__right>
        </bem.MFAModals__footer>
      </bem.MFAModals__manualstep>
    )
  }

  renderTokenStep() {
    return (
      <bem.MFAModals__tokenstep>
        <bem.MFAModals__body>
          <bem.MFAModals__token>
            <strong>
              {/*This is safe as this step only shows if not on qr step*/}
              {t(
                'Please enter your six-digit authenticator token to ##ACTION##'
              ).replace(
                '##ACTION##',
                this.props.modalType === 'regenerate'
                  ? t('regenerate your backup codes.')
                  : t('deactivate two-factor authentication.')
              )}
            </strong>

            <bem.MFAModals__token__input
              type='text'
              onChange={this.onInputChange.bind(this)}
            />
          </bem.MFAModals__token>
        </bem.MFAModals__body>

        <bem.MFAModals__footer>
          <bem.MFAModals__footer__right>
            <Button
              type='full'
              color='blue'
              size='l'
              isFullWidth={true}
              label={t('Next')}
              onClick={
                this.handleTokenSubmit.bind(this)
              }
              isDisabled={!this.isTokenValid()}
            />
          </bem.MFAModals__footer__right>
        </bem.MFAModals__footer>
      </bem.MFAModals__tokenstep>
    );
  }

 /**
  * TODO:
  * $ Remove old modal styling (headers, padding etc)
  * $ Add transition to showing backup codes
  * $ add transition to manually entering key
  * $ use custom button merged into beta
  * - make a confirm step that asks user if they are sure they want to reconfigure
  * - make css
  */
  render() {
    // qrCode is mandatory if modalType is qr
    if (!this.props.qrCode && this.props.modalType === 'qr') {
      throw new Error(t('Modal is expecting a qr code but did not recieve any'))
    }

    return (
      <bem.MFAModals>
        {(this.state.currentStep === 'qr') &&
            this.renderQRCodeStep()
        }

        {(this.state.currentStep === 'backups') &&
          this.renderBackupStep()
        }

        {(this.state.currentStep === 'manual') &&
          this.renderManualStep()
        }

        {(this.state.currentStep === 'token') &&
          this.renderTokenStep()
        }
      </bem.MFAModals>
    )
  }
}
