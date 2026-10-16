!ifndef MUI_BGCOLOR
  !define MUI_BGCOLOR "FFFFFF"
!endif
!ifndef MUI_TEXTCOLOR
  !define MUI_TEXTCOLOR "111217"
!endif
!ifndef MUI_DIRECTORYPAGE_BGCOLOR
  !define MUI_DIRECTORYPAGE_BGCOLOR "FFFFFF"
!endif
!ifndef MUI_DIRECTORYPAGE_TEXTCOLOR
  !define MUI_DIRECTORYPAGE_TEXTCOLOR "111217"
!endif
!ifndef MUI_INSTFILESPAGE_COLORS
  !define MUI_INSTFILESPAGE_COLORS "3257F7 FFFFFF"
!endif
!ifndef MUI_FINISHPAGE_LINK_COLOR
  !define MUI_FINISHPAGE_LINK_COLOR "3257F7"
!endif

; ⚠️ 不要定义 MUI_HEADERIMAGE。
; 一旦定义，MUI 会走「顶部横幅」模式（header 图 150x57 全局加载到外框控件 1046），
; 此时 MUI_PAGE_WELCOME / MUI_PAGE_FINISH **永远不会加载侧边大图**
; （侧边图只在 Welcome.nsh / Finish.nsh 的非 header 分支里 SetBrandingImage）。
; 换句话说：定义了 MUI_HEADERIMAGE，installerSidebar.bmp 就是一张死图。
; 现在改为侧边图模式，build/installerSidebar.bmp（164x314）会显示在欢迎页与完成页。
; electron-builder 侧对应的是 package.json 里**不配** installerHeader。
!ifdef MUI_HEADERIMAGE
  !undef MUI_HEADERIMAGE
!endif
!ifndef BUILD_UNINSTALLER
  !ifndef MUI_CUSTOMFUNCTION_GUIINIT
    !define MUI_CUSTOMFUNCTION_GUIINIT StarlightMusicGuiInit
  !endif
!endif

!include LogicLib.nsh
!include FileFunc.nsh
!include StdUtils.nsh
!include nsDialogs.nsh
!include WinMessages.nsh

!define STARLIGHTMUSIC_INSTALL_MARKER ".starlightmusic-install-root"

!ifndef BUILD_UNINSTALLER
  Var StarlightMusicWelcomePage
  Var StarlightMusicWelcomeImage
  Var StarlightMusicWelcomeImageBitmap
  Var StarlightMusicHeroFont
  Var StarlightMusicTitleFont
  Var StarlightMusicBodyFont
  Var StarlightMusicSmallFont
  Var StarlightMusicDirectoryPage
  Var StarlightMusicDirectoryImage
  Var StarlightMusicDirectoryImageBitmap
  Var StarlightMusicDirectoryInput
  ; 侧边图底部那两行（「安装」+ 真实安装路径）的动态控件。
  ; ⚠️ 之前这两行是烙在 installerSidebar.bmp 像素里的写死"D:\StarlightMusic"，
  ;   用户改路径左下角永远不变。现已用 scripts/sidebar-erase-install-path.js
  ;   从位图里擦掉，改由下面两个 label 绘制。见 StarlightMusicBuildSidebarText。
  Var StarlightMusicSidebarCaption
  Var StarlightMusicSidebarPath
  Var StarlightMusicSidebarCaptionFont
  Var StarlightMusicSidebarPathFont
  ; 用户在安装目录页确认过的路径（空串 = 还没确认过）。
  ; ⚠️ 不能只用「是否确认过」的布尔标志 —— electron-builder 的安装模式页会偷偷
  ; 覆盖 $INSTDIR，所以必须把值本身存下来，下次显示页面时用它恢复。
  ; 详见 StarlightMusicResolveInstallDirForPage。
  Var StarlightMusicUserChosenDir
!endif

!macro customInit
  !ifndef BUILD_UNINSTALLER
    Call StarlightMusicUsePreferredInstallDir
    Call StarlightMusicDisableUnsafeOldUninstallers
    ${If} ${Silent}
      Call StarlightMusicValidateInstallDir
    ${EndIf}
  !endif
!macroend

!macro customInstall
  FileOpen $0 "$INSTDIR\${STARLIGHTMUSIC_INSTALL_MARKER}" w
  ${IfNot} ${Errors}
    FileWrite $0 "StarlightMusic install root$\r$\n"
    FileWrite $0 "appId=com.starlightmusic.desktop$\r$\n"
    FileClose $0
  ${EndIf}
!macroend

!macro customRemoveFiles
  Call un.StarlightMusicRemoveInstalledFiles
!macroend

!macro customWelcomePage
  Page custom StarlightMusicWelcomeShow
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customPageAfterChangeDir
  Page custom StarlightMusicDirectoryShow StarlightMusicDirectoryLeave
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StarlightMusicFinishStartApp
      ${If} ${isUpdated}
        StrCpy $1 "--updated"
      ${Else}
        StrCpy $1 ""
      ${EndIf}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StarlightMusicFinishStartApp"
  !endif
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW StarlightMusicTintCommonControls
  !insertmacro MUI_PAGE_FINISH
!macroend

!ifndef BUILD_UNINSTALLER
Function StarlightMusicGuiInit
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4) i .r0'
  System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4) i .r0'
  Call StarlightMusicTintCommonControls
FunctionEnd

Function StarlightMusicTintCommonControls
  SetCtlColors $HWNDPARENT "111217" "FFFFFF"

  GetDlgItem $0 $HWNDPARENT 1
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 2
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 3
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}

  GetDlgItem $0 $HWNDPARENT 1028
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1256
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1034
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1035
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1037
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1038
  ${If} $0 <> 0
    SetCtlColors $0 "4B5263" "FFFFFF"
  ${EndIf}
  GetDlgItem $0 $HWNDPARENT 1039
  ${If} $0 <> 0
    SetCtlColors $0 "" "FFFFFF"
  ${EndIf}

  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 <> 0
    SetCtlColors $0 "111217" "FFFFFF"

    GetDlgItem $1 $0 1000
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1001
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1004
    ${If} $1 <> 0
      SetCtlColors $1 "3257F7" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1006
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1016
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1019
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1020
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1023
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1024
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1027
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1201
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1202
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1203
    ${If} $1 <> 0
      SetCtlColors $1 "111217" "FFFFFF"
    ${EndIf}
    GetDlgItem $1 $0 1204
    ${If} $1 <> 0
      SetCtlColors $1 "4B5263" "FFFFFF"
    ${EndIf}
  ${EndIf}
FunctionEnd

Function StarlightMusicUsePreferredInstallDir
  ; 只负责算出默认值（/D= > D-Z 第一个存在的盘 > C:\StarlightMusic）。
  ;
  ; ⚠️ 「用户已经确认过目录页就别再动」由调用方负责（见 StarlightMusicResolveInstallDirForPage），
  ; 这个函数本身不 pin 也不检查 pin —— 它在 customInit、欢迎页、目录页都会被调用，
  ; 而目录页那一次是**必须执行**的（见 StarlightMusicDirectoryShow 的注释）。
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/D=" $R1
  ${IfNot} ${Errors}
  ${AndIf} $R1 != ""
    StrCpy $INSTDIR "$R1"
  ${Else}
    ; 默认值只看盘符，**不读注册表里上次的安装位置** ——
    ; 否则老用户（尤其被 electron-builder 默认装到
    ; %LOCALAPPDATA%\Programs\StarlightMusic 的那批）会看到 C 盘路径被回填，
    ; 而不是想要的 D:\StarlightMusic。用户仍可在安装目录页手动改到任意位置。
    Call StarlightMusicUseFirstAvailableInstallDir
  ${EndIf}
  Push "$INSTDIR"
  Call StarlightMusicNormalizeInstallDir
  Pop $INSTDIR
FunctionEnd

; 页面显示时决定 $INSTDIR 用哪个值。
;
; ⚠️ 为什么不能只在 customInit 里定一次默认值：
; electron-builder 的「安装模式」页（multiUserUi.nsh 的 PAGE_INSTALL_MODE）在**每次**
; 离开欢迎页时都会触发，它的 PRE 函数因为我们 customInstallMode 强制了
; $isForceCurrentInstall=1，会立刻执行 setInstallModePerUser（multiUser.nsh:21-56）
; 然后 Abort 掉页面。那个宏会 ReadRegStr 注册表里的旧安装位置、没有就退回
; $LocalAppData\Programs\${APP_FILENAME}，**把 $INSTDIR 覆盖成 C 盘路径**。
; 页面被 Abort 掉看不见，覆盖却真实发生 —— 这就是目录页曾经显示
; C:\Users\...\AppData\Local\Programs\StarlightMusic 的原因。
; 而且用户「上一步」回欢迎页再前进会再触发一次，所以每次显示页面都要重新解析。
Function StarlightMusicResolveInstallDirForPage
  ${If} $StarlightMusicUserChosenDir != ""
    ; 用户已经确认过 —— 用他选的值覆盖掉模板刚写进来的 C 盘路径。
    StrCpy $INSTDIR "$StarlightMusicUserChosenDir"
  ${Else}
    Call StarlightMusicUsePreferredInstallDir
  ${EndIf}
FunctionEnd

Function StarlightMusicUseFirstAvailableInstallDir
  IfFileExists "D:\*.*" driveD 0
  IfFileExists "E:\*.*" driveE 0
  IfFileExists "F:\*.*" driveF 0
  IfFileExists "G:\*.*" driveG 0
  IfFileExists "H:\*.*" driveH 0
  IfFileExists "I:\*.*" driveI 0
  IfFileExists "J:\*.*" driveJ 0
  IfFileExists "K:\*.*" driveK 0
  IfFileExists "L:\*.*" driveL 0
  IfFileExists "M:\*.*" driveM 0
  IfFileExists "N:\*.*" driveN 0
  IfFileExists "O:\*.*" driveO 0
  IfFileExists "P:\*.*" driveP 0
  IfFileExists "Q:\*.*" driveQ 0
  IfFileExists "R:\*.*" driveR 0
  IfFileExists "S:\*.*" driveS 0
  IfFileExists "T:\*.*" driveT 0
  IfFileExists "U:\*.*" driveU 0
  IfFileExists "V:\*.*" driveV 0
  IfFileExists "W:\*.*" driveW 0
  IfFileExists "X:\*.*" driveX 0
  IfFileExists "Y:\*.*" driveY 0
  IfFileExists "Z:\*.*" driveZ 0
  StrCpy $INSTDIR "C:\StarlightMusic"
  Return

  driveD:
    StrCpy $INSTDIR "D:\StarlightMusic"
    Return
  driveE:
    StrCpy $INSTDIR "E:\StarlightMusic"
    Return
  driveF:
    StrCpy $INSTDIR "F:\StarlightMusic"
    Return
  driveG:
    StrCpy $INSTDIR "G:\StarlightMusic"
    Return
  driveH:
    StrCpy $INSTDIR "H:\StarlightMusic"
    Return
  driveI:
    StrCpy $INSTDIR "I:\StarlightMusic"
    Return
  driveJ:
    StrCpy $INSTDIR "J:\StarlightMusic"
    Return
  driveK:
    StrCpy $INSTDIR "K:\StarlightMusic"
    Return
  driveL:
    StrCpy $INSTDIR "L:\StarlightMusic"
    Return
  driveM:
    StrCpy $INSTDIR "M:\StarlightMusic"
    Return
  driveN:
    StrCpy $INSTDIR "N:\StarlightMusic"
    Return
  driveO:
    StrCpy $INSTDIR "O:\StarlightMusic"
    Return
  driveP:
    StrCpy $INSTDIR "P:\StarlightMusic"
    Return
  driveQ:
    StrCpy $INSTDIR "Q:\StarlightMusic"
    Return
  driveR:
    StrCpy $INSTDIR "R:\StarlightMusic"
    Return
  driveS:
    StrCpy $INSTDIR "S:\StarlightMusic"
    Return
  driveT:
    StrCpy $INSTDIR "T:\StarlightMusic"
    Return
  driveU:
    StrCpy $INSTDIR "U:\StarlightMusic"
    Return
  driveV:
    StrCpy $INSTDIR "V:\StarlightMusic"
    Return
  driveW:
    StrCpy $INSTDIR "W:\StarlightMusic"
    Return
  driveX:
    StrCpy $INSTDIR "X:\StarlightMusic"
    Return
  driveY:
    StrCpy $INSTDIR "Y:\StarlightMusic"
    Return
  driveZ:
    StrCpy $INSTDIR "Z:\StarlightMusic"
    Return
FunctionEnd

Function StarlightMusicNormalizeInstallDir
  Exch $0
  Push "$0"
  Call StarlightMusicTrimInstallDir
  Pop $0
  StrLen $1 "$0"
  ${If} $1 == 2
    StrCpy $2 "$0" 1 1
    ${If} $2 == ":"
      StrCpy $0 "$0\StarlightMusic"
    ${EndIf}
  ${ElseIf} $1 == 3
    StrCpy $2 "$0" 1 1
    StrCpy $3 "$0" 1 2
    ${If} $2 == ":"
    ${AndIf} $3 == "\"
      StrCpy $0 "$0StarlightMusic"
    ${EndIf}
  ${EndIf}

  StrLen $1 "$0"
  StrCpy $2 "$0" 12 -12
  ${If} $1 < 12
  ${OrIf} $2 != "\StarlightMusic"
  ${AndIf} $2 != "\starlightmusic"
    StrCpy $0 "$0\StarlightMusic"
  ${EndIf}
  Exch $0
FunctionEnd

Function StarlightMusicTrimInstallDir
  Exch $0

  trim:
    StrLen $1 "$0"
    ${If} $1 > 3
      StrCpy $2 "$0" 1 -1
      ${If} $2 == "\"
        StrCpy $0 "$0" -1
        Goto trim
      ${EndIf}
    ${EndIf}

  Exch $0
FunctionEnd

Function StarlightMusicInstallDirLooksOwned
  Exch $0
  StrCpy $1 "0"

  IfFileExists "$0\${STARLIGHTMUSIC_INSTALL_MARKER}" 0 +2
    StrCpy $1 "1"

  StrCpy $0 "$1"
  Exch $0
FunctionEnd

Function StarlightMusicExistingInstallPathCanBeAdopted
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call StarlightMusicTrimInstallDir
  Pop $2
  ${If} $2 == ""
    Goto done
  ${EndIf}

  Push "$2"
  Call StarlightMusicNormalizeInstallDir
  Pop $3
  ${If} $2 != $3
    Goto done
  ${EndIf}

  IfFileExists "$2\*.*" 0 done
  IfFileExists "$2\${STARLIGHTMUSIC_INSTALL_MARKER}" adopt 0
  IfFileExists "$2\${PRODUCT_FILENAME}.exe" adopt 0
  IfFileExists "$2\resources\app.asar" adopt 0
  IfFileExists "$2\resources\app\package.json" adopt 0
  IfFileExists "$2\resources\app\server.js" adopt 0
  Goto done

  adopt:
    StrCpy $1 "1"

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function StarlightMusicRegisteredInstallDirCanBeAdopted
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call StarlightMusicNormalizeInstallDir
  Pop $2

  ReadRegStr $3 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$3"
  Call StarlightMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call StarlightMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$3"
  Call StarlightMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call StarlightMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$3"
  Call StarlightMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call StarlightMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  ReadRegStr $3 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$3"
  Call StarlightMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Push "$3"
    Call StarlightMusicNormalizeInstallDir
    Pop $5
    ${If} $5 == $2
      StrCpy $1 "1"
      Goto done
    ${EndIf}
  ${EndIf}

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function StarlightMusicInstallDirIsEmpty
  Exch $0
  FindFirst $1 $2 "$0\*.*"
  StrCpy $3 "1"

  loop:
    StrCmp $2 "" done
    StrCmp $2 "." next
    StrCmp $2 ".." next
    StrCpy $3 "0"
    Goto done

  next:
    FindNext $1 $2
    Goto loop

  done:
    FindClose $1
    StrCpy $0 "$3"
    Exch $0
FunctionEnd

Function StarlightMusicOldInstallPathNeedsQuarantine
  Exch $0
  StrCpy $1 "0"

  ${If} $0 == ""
    Goto done
  ${EndIf}

  Push "$0"
  Call StarlightMusicTrimInstallDir
  Pop $2
  Push "$2"
  Call StarlightMusicNormalizeInstallDir
  Pop $3

  ${If} $2 != $3
    StrCpy $1 "1"
    Goto done
  ${EndIf}

  IfFileExists "$2\${STARLIGHTMUSIC_INSTALL_MARKER}" done 0
  Push "$2"
  Call StarlightMusicExistingInstallPathCanBeAdopted
  Pop $4
  ${If} $4 == "1"
    Goto done
  ${EndIf}

  StrCpy $1 "1"

  done:
    StrCpy $0 "$1"
    Exch $0
FunctionEnd

Function StarlightMusicDisableUnsafeOldUninstallers
  StrCpy $2 "0"

  ReadRegStr $0 HKCU "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call StarlightMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call StarlightMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy StarlightMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call StarlightMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call StarlightMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy StarlightMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ${If} $2 == "1"
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
    DeleteRegKey HKCU "Software\${APP_GUID}"
  ${EndIf}

  StrCpy $2 "0"

  ReadRegStr $0 HKLM "Software\${APP_GUID}" InstallLocation
  Push "$0"
  Call StarlightMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call StarlightMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy StarlightMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" InstallLocation
  Push "$0"
  Call StarlightMusicDeleteLegacyUninstallerFileIfMissingMarker
  Push "$0"
  Call StarlightMusicOldInstallPathNeedsQuarantine
  Pop $1
  ${If} $1 == "1"
    DetailPrint "Skip unsafe legacy StarlightMusic uninstaller: $0"
    StrCpy $2 "1"
  ${EndIf}

  ${If} $2 == "1"
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
    DeleteRegKey HKLM "Software\${APP_GUID}"
  ${EndIf}
FunctionEnd

Function StarlightMusicDeleteLegacyUninstallerFileIfMissingMarker
  Pop $0
  ${If} $0 != ""
    Push "$0"
    Call StarlightMusicTrimInstallDir
    Pop $1
    ${If} $1 != ""
      IfFileExists "$1\${STARLIGHTMUSIC_INSTALL_MARKER}" done 0
      DetailPrint "Remove legacy StarlightMusic uninstaller file: $1"
      Delete "$1\Uninstall ${PRODUCT_FILENAME}.exe"
    ${EndIf}
  ${EndIf}

  done:
FunctionEnd

Function StarlightMusicValidateInstallDir
  Push "$INSTDIR"
  Call StarlightMusicNormalizeInstallDir
  Pop $INSTDIR

  Push "$INSTDIR"
  Call StarlightMusicRegisteredInstallDirCanBeAdopted
  Pop $3

  Push "$INSTDIR"
  Call StarlightMusicExistingInstallPathCanBeAdopted
  Pop $4

  StrLen $0 "$INSTDIR"
  StrCpy $1 "$INSTDIR" 12 -12
  ${If} $0 < 12
  ${OrIf} $1 != "\StarlightMusic"
  ${AndIf} $1 != "\starlightmusic"
    MessageBox MB_ICONSTOP|MB_OK "安装目录必须是独立的 StarlightMusic 文件夹。请选择一个上级目录，安装器会自动创建 StarlightMusic 子文件夹。"
    Abort
  ${EndIf}

  IfFileExists "$INSTDIR\*.*" 0 valid

  Push "$INSTDIR"
  Call StarlightMusicInstallDirLooksOwned
  Pop $0
  ${If} $0 == "1"
    Goto valid
  ${EndIf}

  ${If} $3 == "1"
    Goto valid
  ${EndIf}

  ${If} $4 == "1"
    Goto valid
  ${EndIf}

  Push "$INSTDIR"
  Call StarlightMusicInstallDirIsEmpty
  Pop $0
  ${If} $0 == "1"
    Goto valid
  ${EndIf}

  MessageBox MB_ICONSTOP|MB_OK "为避免卸载时误删其它文件，StarlightMusic 不能安装到已有文件的非专属目录。请新建或选择一个空的 StarlightMusic 文件夹。$\r$\n$\r$\n当前路径：$INSTDIR"
  Abort

  valid:
FunctionEnd
Function StarlightMusicStageSidebarImage
  InitPluginsDir
  File /oname=$PLUGINSDIR\starlightmusic-sidebar.bmp "${MUI_WELCOMEFINISHPAGE_BITMAP}"
FunctionEnd

; ─────────────────────────────────────────────────────────────
; 侧边图底部的「安装」+ 真实安装路径（动态绘制）
; ─────────────────────────────────────────────────────────────
;
; ⚠️ 这两行原本是烙在 build/installerSidebar.bmp 像素里的写死 "D:\StarlightMusic"，
;   所以用户在目录页改成 C:\Starlight\StarlightMusic，左下角永远还是 D 盘那个路径。
;   现已由 scripts/sidebar-erase-install-path.js 从位图里擦掉，改在这里画。
;
; 坐标来自位图 → 控件的线性映射（installerSidebar.bmp 164x314 → 109u x 193u）：
;   scaleX = 109/164 ≈ 0.665     scaleY = 193/314 ≈ 0.615
;   「安装」  原y=240..249→ 147.5u..153.7u
;   路径行   原 y=260..267 → 159.8u..164.7u
;   文字左边界 原 x=33     → 21.9u
; 侧边图右侧 x=109u 就是内容区分界（右侧文字从 120u 起），所以宽度上限取 105u。
Function StarlightMusicBuildSidebarText
  CreateFont $StarlightMusicSidebarCaptionFont "Microsoft YaHei UI" 8 700
  CreateFont $StarlightMusicSidebarPathFont "Microsoft YaHei UI" 8 400

  ${NSD_CreateLabel} 22u 145u 105u 12u "安装"
  Pop $StarlightMusicSidebarCaption
  SendMessage $StarlightMusicSidebarCaption ${WM_SETFONT} $StarlightMusicSidebarCaptionFont 1
  ; 侧边图背景不是纯白（实测 ≈ #FEFDFC），label 背景必须跟它一致，
  ; 否则会出现一块比周围略亮的方块。
  SetCtlColors $StarlightMusicSidebarCaption "111217" "FEFDFC"

  ; 高度给18u：路径可能较长，8 号字体在 105u 宽度下会折行，12u 只够一行。
  ${NSD_CreateLabel} 22u 158u 105u 18u ""
  Pop $StarlightMusicSidebarPath
  SendMessage $StarlightMusicSidebarPath ${WM_SETFONT} $StarlightMusicSidebarPathFont 1
  SetCtlColors $StarlightMusicSidebarPath "4B5263" "FEFDFC"
FunctionEnd

; 把当前 $INSTDIR 写到侧边图下方的路径 label。
; 用 WM_SETTEXT 而不是重建控件 —— 目录页里用户每敲一个字都会调到这里。
;
; 实测（scripts/out/nsis-quote-test）：`${NSD_SetText}` 宏内部虽然写成反引号
; `STR:${TEXT}`，NSIS 仍会展开变量，含空格的路径也能正确写入。
; 三种写法（NSD_SetText / 双引号 / 成对反引号）结果一致。
Function StarlightMusicUpdateSidebarPath
  ; 页面已销毁时句柄失效（悬垂HWND）—— 直接返回，
  ; 否则 SendMessage 可能打到已被复用的窗口上。
  ${If} $StarlightMusicSidebarPath == 0
    Return
  ${EndIf}
  ; 防御：Windows 路径不允许双引号，但万一 $INSTDIR 被外部参数污染，
  ; 含引号会破坏 STR: 参数。直接吞掉引号，宁可显示得短一点。
  StrCpy $0 "$INSTDIR"
  ${NSD_SetText} $StarlightMusicSidebarPath "STR:$0"
FunctionEnd

; 页面离开时清掉句柄：nsDialogs::Destroy 之后 HWND 立刻失效，
; 但 $StarlightMusicSidebarPath 变量还留着旧值，下次进页面若 BuildSidebarText
; 失败（nsDialogs::Create error）就会往野句柄发消息。
Function StarlightMusicReleaseSidebarText
  StrCpy $StarlightMusicSidebarCaption 0
  StrCpy $StarlightMusicSidebarPath 0
FunctionEnd

Function StarlightMusicWelcomeShow
  Call StarlightMusicResolveInstallDirForPage
  ; 侧边图页使用全窗口模式：header 由 MUI 隐藏，图片与右侧文案都在这张页面上绘制。
  Call muiPageLoadFullWindow

  nsDialogs::Create 1044
  Pop $StarlightMusicWelcomePage
  ${If} $StarlightMusicWelcomePage == error
    Call muiPageUnloadFullWindow
    Abort
  ${EndIf}

  Call StarlightMusicStageSidebarImage
  SetCtlColors $StarlightMusicWelcomePage "111217" "FFFFFF"
  CreateFont $StarlightMusicHeroFont "Microsoft YaHei UI" 24 700
  CreateFont $StarlightMusicTitleFont "Microsoft YaHei UI" 11 700
  CreateFont $StarlightMusicBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $StarlightMusicSmallFont "Microsoft YaHei UI" 8 400

  ${NSD_CreateBitmap} 0u 0u 109u 193u ""
  Pop $StarlightMusicWelcomeImage
  ${NSD_SetStretchedImage} $StarlightMusicWelcomeImage "$PLUGINSDIR\starlightmusic-sidebar.bmp" $StarlightMusicWelcomeImageBitmap
  Call StarlightMusicBuildSidebarText
  Call StarlightMusicUpdateSidebarPath

  ${NSD_CreateLabel} 120u 10u 195u 12u "STARLIGHTMUSIC"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicSmallFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  ${NSD_CreateLabel} 120u 30u 195u 36u "StarlightMusic 安装"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicHeroFont 1
  SetCtlColors $0 "111217" "FFFFFF"

  ${NSD_CreateLabel} 120u 68u 36u 2u ""
  Pop $0
  SetCtlColors $0 "" "3257F7"

  ${NSD_CreateLabel} 120u 84u 195u 34u "为这台电脑安装 StarlightMusic。下一步可以自由选择安装位置，安装器会自动创建缺失的目录。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicBodyFont 1
  SetCtlColors $0 "4B5263" "FFFFFF"

  ; 路径行上移并加高：旧欢迎页用了 1018 普通小页面，底部可用高度不足；
  ; 同时原来的短 label 高度容易把 11pt 字体的下沿裁掉。
  ${NSD_CreateLabel} 120u 122u 195u 24u "默认位置：$INSTDIR"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicTitleFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  nsDialogs::Show
  Call muiPageUnloadFullWindow
  ; 先清句柄再销毁：nsDialogs::Show 返回后控件已经没了。
  Call StarlightMusicReleaseSidebarText
  ${NSD_FreeImage} $StarlightMusicWelcomeImageBitmap
FunctionEnd

Function StarlightMusicDirectoryBrowse
  nsDialogs::SelectFolderDialog "选择 StarlightMusic 安装文件夹" "$INSTDIR"
  Pop $0
  ${If} $0 != error
  ${AndIf} $0 != ""
    Push "$0"
    Call StarlightMusicNormalizeInstallDir
    Pop $0
    StrCpy $INSTDIR "$0"
    SendMessage $StarlightMusicDirectoryInput ${WM_SETTEXT} 0 "STR:$INSTDIR"
    Call StarlightMusicUpdateSidebarPath
  ${EndIf}
FunctionEnd

; 输入框内容变化时同步侧边图下方的路径。
; 侧边图以前显示的是位图里写死的 D:\StarlightMusic，用户敲什么这里就跟什么。
Function StarlightMusicDirectoryInputChanged
  ; 页面已销毁时可能还有排队的事件，回调 HWND 已失效 —— 直接返回。
  ${If} $StarlightMusicDirectoryInput == 0
    Return
  ${EndIf}
  ${If} $StarlightMusicSidebarPath == 0
    Return
  ${EndIf}
  ${NSD_GetText} $StarlightMusicDirectoryInput $0
  ; ⚠️ 不要在这里无条件写 $INSTDIR：用户清空输入框的中间态（"" 或单个字符）
  ; 会把 $INSTDIR 污染成非法值，而 StarlightMusicDirectoryLeave 之外的路径
  ; （例如静默安装、上一步回退）都依赖它。侧边图只做「显示」，不参与决策。
  StrCpy $1 "$INSTDIR"
  ${If} $0 != ""
    StrCpy $1 "$0"
  ${EndIf}
  ${NSD_SetText} $StarlightMusicSidebarPath "STR:$1"
FunctionEnd

Function StarlightMusicDirectoryShow
  Call StarlightMusicResolveInstallDirForPage
  Call muiPageLoadFullWindow

  nsDialogs::Create 1044
  Pop $StarlightMusicDirectoryPage
  ${If} $StarlightMusicDirectoryPage == error
    Call muiPageUnloadFullWindow
    Abort
  ${EndIf}

  Call StarlightMusicStageSidebarImage
  SetCtlColors $StarlightMusicDirectoryPage "111217" "FFFFFF"
  CreateFont $StarlightMusicTitleFont "Microsoft YaHei UI" 15 700
  CreateFont $StarlightMusicBodyFont "Microsoft YaHei UI" 9 400
  CreateFont $StarlightMusicSmallFont "Microsoft YaHei UI" 8 500

  ${NSD_CreateBitmap} 0u 0u 109u 193u ""
  Pop $StarlightMusicDirectoryImage
  ${NSD_SetStretchedImage} $StarlightMusicDirectoryImage "$PLUGINSDIR\starlightmusic-sidebar.bmp" $StarlightMusicDirectoryImageBitmap
  Call StarlightMusicBuildSidebarText
  Call StarlightMusicUpdateSidebarPath

  ${NSD_CreateLabel} 120u 12u 195u 24u "选择安装位置"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicTitleFont 1
  SetCtlColors $0 "111217" "FFFFFF"

  ${NSD_CreateLabel} 120u 40u 195u 30u "你可以使用默认路径，也可以选择其它磁盘或文件夹。安装器会自动创建缺失的目录。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicBodyFont 1
  SetCtlColors $0 "4B5263" "FFFFFF"

  ${NSD_CreateLabel} 120u 76u 195u 12u "安装目录"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicSmallFont 1
  SetCtlColors $0 "3257F7" "FFFFFF"

  ${NSD_CreateText} 120u 94u 128u 17u "$INSTDIR"
  Pop $StarlightMusicDirectoryInput
  SendMessage $StarlightMusicDirectoryInput ${WM_SETFONT} $StarlightMusicBodyFont 1
  SetCtlColors $StarlightMusicDirectoryInput "111217" "FFFFFF"
  ; 用户每敲一个字符就同步侧边图显示 —— 侧边图的路径不再是位图里写死的常量。
  ${NSD_OnChange} $StarlightMusicDirectoryInput StarlightMusicDirectoryInputChanged

  ${NSD_CreateBrowseButton} 256u 93u 50u 19u "浏览..."
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicSmallFont 1
  ${NSD_OnClick} $0 StarlightMusicDirectoryBrowse

  ; 高度 18u 只放得下一行，这句话在 195u 宽下会折两行 → 第二行被切（用户截图实测）。
  ; 加高到 24u（与欢迎页「默认位置」一致），两行都显示得下。
  ${NSD_CreateLabel} 120u 122u 195u 24u "可直接修改路径，或点右侧浏览按钮选择文件夹；选盘符会自动建文件夹。"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $StarlightMusicSmallFont 1
  SetCtlColors $0 "6B7280" "FFFFFF"

  nsDialogs::Show
  Call muiPageUnloadFullWindow
  ; 先清句柄再销毁。⚠️ StarlightMusicDirectoryLeave 是在 Show 返回**之后**才跑的，
  ; 那时输入框和侧边图 label 都已经销毁，所以那里不能再更新侧边图 ——
  ; 归一化后的路径会在下次进目录页时由 ResolveInstallDirForPage + UpdateSidebarPath 画出来。
  Call StarlightMusicReleaseSidebarText
  ${NSD_FreeImage} $StarlightMusicDirectoryImageBitmap
FunctionEnd

Function StarlightMusicDirectoryLeave
  ${NSD_GetText} $StarlightMusicDirectoryInput $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "请选择安装文件夹。"
    Abort
  ${EndIf}
  Push "$0"
  Call StarlightMusicNormalizeInstallDir
  Pop $0
  StrCpy $INSTDIR "$0"
  SendMessage $StarlightMusicDirectoryInput ${WM_SETTEXT} 0 "STR:$INSTDIR"
  ; 记下用户确认过的路径：之后回到本页、或回欢迎页再前进，都恢复这个值，
  ; 而不是重新算默认值 —— 否则模板的安装模式页会把路径改回 C 盘。
  StrCpy $StarlightMusicUserChosenDir "$INSTDIR"
  Call StarlightMusicValidateInstallDir
FunctionEnd
!endif

!ifdef BUILD_UNINSTALLER
!macro customUnInit
  Call un.StarlightMusicValidateUninstallDir
!macroend

Function un.StarlightMusicInstallDirLooksOwned
  Exch $0
  StrCpy $1 "0"

  IfFileExists "$0\${STARLIGHTMUSIC_INSTALL_MARKER}" 0 +2
    StrCpy $1 "1"

  StrCpy $0 "$1"
  Exch $0
FunctionEnd

Function un.StarlightMusicNormalizeInstallDir
  Exch $0
  Push "$0"
  Call un.StarlightMusicTrimInstallDir
  Pop $0
  StrLen $1 "$0"
  ${If} $1 == 2
    StrCpy $2 "$0" 1 1
    ${If} $2 == ":"
      StrCpy $0 "$0\StarlightMusic"
    ${EndIf}
  ${ElseIf} $1 == 3
    StrCpy $2 "$0" 1 1
    StrCpy $3 "$0" 1 2
    ${If} $2 == ":"
    ${AndIf} $3 == "\"
      StrCpy $0 "$0StarlightMusic"
    ${EndIf}
  ${EndIf}

  StrLen $1 "$0"
  StrCpy $2 "$0" 12 -12
  ${If} $1 < 12
  ${OrIf} $2 != "\StarlightMusic"
  ${AndIf} $2 != "\starlightmusic"
    StrCpy $0 "$0\StarlightMusic"
  ${EndIf}
  Exch $0
FunctionEnd

Function un.StarlightMusicTrimInstallDir
  Exch $0

  trim:
    StrLen $1 "$0"
    ${If} $1 > 3
      StrCpy $2 "$0" 1 -1
      ${If} $2 == "\"
        StrCpy $0 "$0" -1
        Goto trim
      ${EndIf}
    ${EndIf}

  Exch $0
FunctionEnd

Function un.StarlightMusicValidateUninstallDir
  Push "$INSTDIR"
  Call un.StarlightMusicTrimInstallDir
  Pop $0
  Push "$0"
  Call un.StarlightMusicNormalizeInstallDir
  Pop $1
  ${If} $0 != $1
    MessageBox MB_OK|MB_ICONSTOP "当前卸载路径不是 StarlightMusic 专属目录，已阻止卸载以避免误删其它文件。$\r$\n$\r$\n当前路径：$INSTDIR$\r$\n安全路径应为：$0"
    SetErrorLevel 2
    Quit
  ${EndIf}
  StrCpy $INSTDIR "$0"

  Push "$INSTDIR"
  Call un.StarlightMusicInstallDirLooksOwned
  Pop $0
  ${If} $0 != "1"
    MessageBox MB_OK|MB_ICONSTOP "无法确认当前目录属于 StarlightMusic，已阻止卸载以避免误删其它文件。$\r$\n$\r$\n当前路径：$INSTDIR"
    SetErrorLevel 2
    Quit
  ${EndIf}
FunctionEnd

Function un.StarlightMusicRemoveInstalledFiles
  SetOutPath $TEMP

  Delete "$INSTDIR\${PRODUCT_FILENAME}.exe"
  Delete "$INSTDIR\Uninstall ${PRODUCT_FILENAME}.exe"
  Delete "$INSTDIR\uninstallerIcon.ico"

  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vulkan-1.dll"

  RMDir "$INSTDIR\locales"
  RMDir "$INSTDIR\resources"
  RMDir "$INSTDIR\swiftshader"

  RMDir "$INSTDIR"
FunctionEnd
!endif
