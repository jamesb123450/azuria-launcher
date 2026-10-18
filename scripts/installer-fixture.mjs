// Compile the real privacy page/hooks against a harmless marker-only installer.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const target = resolve(process.argv[2] ?? "test-results/installer");
await mkdir(target, { recursive: true });
const root = fileURLToPath(new URL("../src-tauri/installer/", import.meta.url));
const template = await readFile(resolve(root, "installer.nsi"), "utf8");
const page = template
  .split("; AZURIA: a real,")[1]
  ?.split("; 3. Install mode")[0];
if (!page) throw Error("Privacy page marker missing from installer template.");
const quote = (value) => value.replaceAll('"', '$\\"');
const source = `Unicode true
!include MUI2.nsh
!include FileFunc.nsh
Var PassiveMode
!define AZURIA_PRIVACY_KEY "Software\\AzuriaLauncher\\InstallerTests"
!include "${quote(resolve(root, "hooks.nsh"))}"
!insertmacro AZURIA_PRIVACY_FUNCTIONS
!define LICENSE "${quote(resolve(root, "privacy-policy.rtf"))}"
Name "Azuria installer privacy test"
OutFile "${quote(resolve(target, "privacy-test.exe"))}"
InstallDir "$TEMP\\AzuriaInstallerPrivacyTest"
RequestExecutionLevel user
AutoCloseWindow true
; AZURIA: a real,${page}
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"
Function .onInit
  \${GetParameters} $CMDLINE
  \${GetOptions} $CMDLINE "/P" $PassiveMode
  \${IfNot} \${Errors}
    StrCpy $PassiveMode 1
  \${EndIf}
  Call AzuriaPrivacyInit
FunctionEnd
Section
  !insertmacro NSIS_HOOK_PREINSTALL
  SetOutPath $INSTDIR
  FileOpen $0 "$INSTDIR\\installed.txt" w
  FileWrite $0 "Installation reached after privacy acceptance."
  FileClose $0
  !insertmacro NSIS_HOOK_POSTINSTALL
SectionEnd
`;
await writeFile(resolve(target, "privacy-test.nsi"), source);
console.log(resolve(target, "privacy-test.nsi"));
