!ifndef AZURIA_INSTALLER_HOOKS
!define AZURIA_INSTALLER_HOOKS
!include "LogicLib.nsh"
!include "${__FILEDIR__}\privacy-version.nsh"
!ifndef AZURIA_PRIVACY_KEY
!define AZURIA_PRIVACY_KEY "Software\AzuriaLauncher\Privacy"
!endif
Var AzuriaPrivacyAccepted

; Brand artwork is decorative. Native labels and controls remain available to
; assistive technology and retain the Windows theme/high-contrast colours.
!define MUI_HEADERIMAGE_RIGHT
!define MUI_WELCOMEPAGE_TITLE "Welcome to Azuria Launcher"
!define MUI_WELCOMEPAGE_TEXT "A home for your Minecraft instances.$\r$\n$\r$\nSetup will install Azuria for your Windows account. Your instances stay in your AzuriaLauncher AppData folder.$\r$\n$\r$\nBefore installation, you will review and accept the privacy policy. Microsoft sign-in takes place later in the launcher."
!define MUI_FINISHPAGE_TITLE "Azuria is ready"
!define MUI_FINISHPAGE_TEXT "Your launcher is installed.$\r$\n$\r$\nOpen Azuria to manage instances, connect your Minecraft account and choose what to play."

!macro AZURIA_PRIVACY_FUNCTIONS
Function AzuriaPrivacyInit
  StrCpy $AzuriaPrivacyAccepted 0
  ReadRegStr $R0 HKCU "${AZURIA_PRIVACY_KEY}" "AcceptedPolicy"
  ${If} $R0 == "${AZURIA_PRIVACY_VERSION}"
    StrCpy $AzuriaPrivacyAccepted 1
  ${Else}
    ; /S has no opportunity to request acceptance. Never invent agreement.
    IfSilent 0 azuria_interactive
    SetErrorLevel 2
    Quit
    azuria_interactive:
    ; Old releases invoke /P /UPDATE. A changed policy promotes that update
    ; to interactive setup so the policy cannot be silently skipped.
    StrCpy $PassiveMode 0
  ${EndIf}
FunctionEnd

Function AzuriaPrivacyPre
  ${If} $AzuriaPrivacyAccepted == 1
    Abort
  ${EndIf}
FunctionEnd

Function AzuriaPrivacyLeave
  ; Verify the native checkbox as well as relying on the disabled Next button.
  ; NSIS IDC_LICENSEAGREE is 1034; a missing control fails closed.
  FindWindow $R1 "#32770" "" $HWNDPARENT
  GetDlgItem $R2 $R1 1034
  SendMessage $R2 ${BM_GETCHECK} 0 0 $R3
  ${If} $R3 != ${BST_CHECKED}
    Abort
  ${EndIf}
  StrCpy $AzuriaPrivacyAccepted 1
FunctionEnd

!macroend

!macro NSIS_HOOK_PREINSTALL
  ${If} $AzuriaPrivacyAccepted != 1
    SetErrorLevel 2
    Abort "Accept the Privacy Policy before installing Azuria."
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Save locally only after installation succeeds. Cancelling does not record
  ; acceptance. Store a policy fingerprint, never account IDs or credentials.
  WriteRegStr HKCU "${AZURIA_PRIVACY_KEY}" "AcceptedPolicy" "${AZURIA_PRIVACY_VERSION}"
!macroend
!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode != 1
    DeleteRegKey HKCU "${AZURIA_PRIVACY_KEY}"
  ${EndIf}
!macroend
!endif
