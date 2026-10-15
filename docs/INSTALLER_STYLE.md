# 2026-06-25 P0 Installer Safety Notes

- Full setup adoption rule: the installer may adopt an existing registered install only when the registered path itself is a dedicated `...\BhandsMusic` directory and contains BhandsMusic files or `.bhandsmusic-install-root`; mixed parent folders and drive roots must stay blocked/quarantined.
- Quick patch rule: installer/uninstaller safety bugs cannot be fixed by a quick patch JSON alone, because the Windows uninstaller and install registry must be replaced by the full NSIS setup.

# BhandsMusic Installer Style

2026-06-22 用户确认保留当前安装包格式。以后发布安装包，默认沿用这套样式和流程，除非用户明确要求重做。

## 视觉方向

- 中文极简安装器。
- 主色：白底 `#FFFFFF`，主文字 `#111217`，弱文字 `#4B5263` / `#6B7280`，蓝色点缀 `#3257F7`。
- 不要再使用红色 MR、深色大卡片、复杂装饰、英文大段说明或黑底黑字。
- 顶部横幅和侧边图保持黑白蓝极简：`build/installerHeader.bmp`、`build/installerSidebar.bmp`。

## 页面结构

- 欢迎页只保留：
  - `BHANDSMUSIC`
  - `BhandsMusic 安装`
  - 简短中文说明
  - `默认位置：D:\BhandsMusic`
- 安装目录页只保留：
  - `选择安装位置`
  - 简短中文说明
  - `安装目录` 输入框
  - `浏览...` 按钮
  - `默认推荐：D:\BhandsMusic；选盘符会自动建文件夹。`

## 技术边界

- 使用 `build/installer.nsh` 的自定义欢迎页和自定义安装目录页。
- `package.json` 中 `build.nsis.allowToChangeInstallationDirectory` 保持 `false`，避免 electron-builder 原生目录页读取旧安装注册表后回填到 `AppData\Local\Programs\BhandsMusic`。
- 自定义目录页必须保留可编辑输入框和 `浏览...` 按钮。
- 默认路径通过 `BhandsMusicUsePreferredInstallDir` 设置为 `D:\BhandsMusic`；命令行 `/D=` 参数仍可覆盖。
- 用户选择盘符根目录时，通过 `BhandsMusicNormalizeInstallDir` 自动补成 `盘符:\BhandsMusic`。

## 发布前验证

发布前必须本地打开新生成的 `dist\BhandsMusic-版本-Setup.exe` 验证：

- 欢迎页显示中文极简样式，默认位置为 `D:\BhandsMusic`。
- 安装目录页输入框显示 `D:\BhandsMusic`。
- `浏览...` 按钮能弹出中文文件夹选择窗口。
- 验证时不要点 `安装`，确认后取消退出。

## 2026-06-25 安装安全补充

- 默认安装路径从 `D:\BhandsMusic` 开始按 D-Z 顺序选择第一个存在的盘；只有电脑不存在任何 D-Z 盘时，默认才落到 `C:\BhandsMusic`。默认值只是推荐，用户可在安装目录页改成任意位置（含 C 盘）。
- 用户手动选择目录时，安装器必须强制落到独立 `BhandsMusic` 子文件夹（`BhandsMusicNormalizeInstallDir` 负责补全后缀），但**不再限制盘符**：C 盘或任意盘都允许，不再弹窗阻止。
- 非空且无法识别为 BhandsMusic 的目录必须阻止安装，避免卸载阶段删除用户其它文件。
- 新安装器写入 `.bhandsmusic-install-root` 标记；新卸载器必须先验证路径和标记/主程序/卸载器，再进入卸载。
- 新卸载器禁止使用 `RMDir /r $INSTDIR` 删除整个安装根目录，也禁止递归删除 `resources`、`locales` 等应用子目录；只能删除 BhandsMusic/Electron 顶层已知文件，最后用非递归 `RMDir "$INSTDIR"` 尝试移除空目录。
- 安装新版本时，若检测到旧版本没有 `.bhandsmusic-install-root` 安全标记，必须跳过旧卸载器，只删除旧目录中的 `Uninstall BhandsMusic.exe` 单文件并清理卸载注册表，避免触发历史安装包的整目录递归删除逻辑。

## 2026-10-14 放开安装目录选择

- 删除 `BhandsMusicValidateInstallDir` 里的「C 盘禁装」硬拦截（原弹窗：「检测到这台电脑还有 D-Z 盘，BhandsMusic 不安装到 C 盘」）。用户现在可以自由选择任意盘符，包括 C 盘。
- 同时删除只为该拦截服务的 `BhandsMusicHasPreferredInstallDrive` 函数（删后无引用）。
- 保留的安全校验不变：必须落在独立 `...\BhandsMusic` 目录、非空目录必须能识别为 BhandsMusic 专属目录。
- 修 `BhandsMusicUsePreferredInstallDir` 的重复调用问题：默认值由 `BhandsMusicResolveInstallDirForPage` 在页面显示时决定；`BhandsMusicUserChosenDir` 保存用户确认的路径，避免点「上一步」或经过安装模式页后被模板重置。
- 欢迎页与目录页文案去掉写死的 `D:\BhandsMusic`（默认盘符本来就是动态的），改为中性描述。
- 默认路径策略（D-Z 优先）保持不变，只是不再强制。

## 2026-10-14 横幅图修复 + 默认路径不再读注册表

### 图片：走「侧边图」模式，横幅（header）已停用

**2026-10-14 二次修正**：此前 `MUI_HEADERIMAGE` 被定义，导致**顶部横幅模式**生效，
`installerSidebar.bmp` 是一张**死图**（MUI 的欢迎页/完成页在 header 分支下从不加载侧边图）。
现在改为侧边图模式：

- `package.json` 的 `build.nsis` **不再配 `installerHeader`** —— 否则 electron-builder 会
  `defines.MUI_HEADERIMAGE = null`（见 `NsisTarget.js`），把模式又掰回横幅。
- `build/installer.nsh` 顶部用 `!ifdef MUI_HEADERIMAGE / !undef MUI_HEADERIMAGE` 兜底。
- `build/installerHeader.bmp` 已不再被使用（文件保留备用）。

**图片格式铁律**：`installerSidebar.bmp` 必须是**真 24bpp BMP**，尺寸 **164x314**。
两个文件历史上都是 PNG 改扩展名（`89 50 4E 47`），electron-builder 与 makensis 都不报错，
但运行时 `LoadImage` 失败 → 图静默不显示。转换 + 缩放：

```
node scripts/png-to-bmp.js <源图.png> build/installerSidebar.bmp --resize 164x314
node scripts/png-to-bmp.js --check build/installerSidebar.bmp   # 校验
```

`npm run probe:nsis` 已把「真 BMP + 24bpp + 尺寸正确」纳入检查；另外因为自定义页会调用 MUI 内部函数 `muiPageLoadFullWindow` / `muiPageUnloadFullWindow`（由 `MUI_PAGE_FINISH` 宏生成，不是 `Function`），静态 Call 检查加了白名单，并让探针展开三个页面宏后交给 makensis 真编译。

**覆盖范围**：MUI 侧边图由 `Pages/Welcome.nsh` / `Pages/Finish.nsh` 的标准页自动加载；此外本项目的自定义**欢迎页与安装目录页**也已改为 `nsDialogs::Create 1044` + `muiPageLoadFullWindow`，并显式加载同一张 `installerSidebar.bmp`（左侧 `0u 0u 109u 193u`）。文字在右侧，离开页面时 `muiPageUnloadFullWindow` 恢复标准安装进度页的 header 控件。

⚠️ **自定义页必须用 `nsDialogs::Create 1044`（193u 高），不能用 1018**。2026-10-14 用 1018 时欢迎页「默认位置：$INSTDIR」落在可视区外被裁；改 1044 + 全窗口后恢复正常。右侧文字栈从 `120u` 起始，默认位置 label 用 `y=122u / h=24u`（11pt 需要 24u 才不截底）。

### 默认安装路径：必须在「页面显示时」决定，否则会被模板覆盖

原先 `BhandsMusicUsePreferredInstallDir` 会先查注册表沿用上次的安装目录，现已改为
**只看盘符**（D-Z 第一个存在的盘，兜底 `C:\BhandsMusic`）；`BhandsMusicUseRegisteredInstallDir` 已删除。

⚠️ **但只改这个函数不够 —— electron-builder 的模板也会写 `$INSTDIR`**：

`multiUser.nsh:21-56` 的 `setInstallModePerUser` 宏会读注册表里的旧安装位置
（没有则退回 `$LocalAppData\Programs\${APP_FILENAME}`）并 `StrCpy $INSTDIR`。
触发点是「安装模式」页的 PRE 函数（`multiUserUi.nsh:59-65`）—— 因为我们的
`customInstallMode` 强制 `$isForceCurrentInstall = "1"`，PRE 会立刻执行这个宏然后 `Abort`。
**页面被 Abort 掉看不见，覆盖却真实发生**，时机正好在「离开欢迎页 → 进入安装目录页」之间。

症状：**欢迎页显示 `D:\BhandsMusic`（对），安装目录页却显示
`C:\Users\<用户>\AppData\Local\Programs\BhandsMusic`（错）**。

所以默认值必须在页面显示时决定：

- 欢迎页 / 安装目录页的 show 都走 `BhandsMusicResolveInstallDirForPage` ——
  `$BhandsMusicUserChosenDir` 非空就**用它恢复** `$INSTDIR`，否则调
  `BhandsMusicUsePreferredInstallDir` 算默认值；
- `$BhandsMusicUserChosenDir` 在 `BhandsMusicDirectoryLeave` 里记录；
- ⚠️ **不能用布尔「已确认」标志**：用户点「上一步」回欢迎页再前进会**再次**触发覆盖，
  布尔标志会让目录页跳过恢复 → 路径又变回 C 盘。**必须存值，不能只存标志。**
- `customInit` 里那次调用只对**静默安装**（无页面）有意义。

代价：之前**手动**装在别的目录的用户，升级时需要自己把路径改回去
（`BhandsMusicValidateInstallDir` 里「用户选的路径 == 注册表已登记路径则放行」的豁免仍然保留，
所以手动改回旧位置不会被拦）。
