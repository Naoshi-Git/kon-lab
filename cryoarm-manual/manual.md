---
title: CryoARM 撮影一気通貫マニュアル
updated: 2026-08-09
status: draft
basis: 260809 手書き最終版
scope: Sample名登録から自動撮影開始後の初期確認まで
machine_scope: 難波研 CryoARM + Gatan K3 + SerialEM
source_pr: Naoshi-Git/Git-dir#40
---

# CryoARM 撮影一気通貫マニュアル

> **このMarkdownがWeb版の正本です。** HTMLはこのファイルから自動生成し、HTMLを直接編集しません。
>
> 2026-08-09以降は、後輩が追記した61ページの手書き最終版を現行ラボ運用の第一根拠とし、操作動画・元音声を実施順と理由のcross-check、公式PDF/PPTXを標準機能・troubleshooting・fallbackの補助として使用します。

## 1. このマニュアルの使い方

この手順書は、CryoARMの操作訓練を受けた担当者が、**Sample名登録から自動撮影開始後の初期確認までを上から順に進める**ための実務マニュアルです。単なるボタン列ではなく、操作の目的、次へ進める状態、異常時の戻り先まで含めます。

倍率、Dose、Defocusなど試料依存の値は固定しません。一方、260809手書き最終版で機体別・工程別に明示され、動画とも整合する値は「260809現行手書き基準」として記載します。SerialEM settingやscriptが更新された場合は実画面を優先し、本文を更新してください。

### 全体フロー

**Sample登録 → 前session終了 → SerialEM起動 → Batch Grid Map → Grid Load → Atlas–Square補正 → Square登録／Square Map → Low Dose beam → slit → Square–View補正 → Z → Screening → Multi-shot／Hole選択 → Coma/Stig → Final TestShot／Camera → Record–View補正 → Final Acquisition → 初期取得確認**

### 先へ進まない条件

- 対象外GridをLoadした、またはGrid ID／Sample／Navigatorが一致しない
- 見慣れない警告、既知警告と文言が異なる警告が出た
- Atlas–Square、Square–View、Record–Viewのずれが反復して収束しない
- AutoFocusが反復して失敗する
- TestShotのExposure／Frame timeとCamera Setupが一致しない
- Navigatorが進まない、または保存先へframeが作成されない
- scriptが想定外の状態で停止した

既知popupは、**全文・機体・SerialEM環境が一致する場合にだけ**過去の回答を参照します。

---

# Part I. 起動とAtlas

## 2. Sample名を登録する

1. 中央上モニタの `Sample Storage` を開く。
2. 自分のGridが格納されていることを確認する。
3. 対象行の `Cartridge information` を開き、`Sample` 欄へ試料名を入力する。
4. Grid ID、Sample名、実物のマガジン位置を対応させて記録する。

複数Gridの日は、このIDをMulti Grid Operations、Navigator、保存folderでも一貫して使います。

## 3. 前のSerialEM sessionを閉じる

前利用者のSerialEMが残っている場合は先に終了します。Log保存を尋ねられたら `Yes`。既存Navigatorも、所有者や保存先が不明なまま上書きしません。

## 4. 当日の保存先を用意する

Atlas／Navigator／Square Mapと、最終frameの保存先を混同しません。`Set Current Dir` で選ぶ親directoryの下に当日folderを作ります。

260809手書き基準では、親directoryは機体ごとに分かれている記録があります（初号機 `Imai`、弐号機 `Kon-Lab`）。実際には当日の装置で現在使われている親directoryを確認してから作成します。

## 5. SerialEMを起動する

1. 施設指定の `Zero-Fring`／`Zero_fring(e)` 系iconを起動する。
2. JADAS、MDSが起動していればOFFにする。
3. 電顕本体でbeamが正常に出ていることを確認する。
4. Pixel sizeを日次記録へ残す。

**260809現行手書き基準のEmission目安**

| 機体 | Emission目安 |
|---|---:|
| 初号機 | 約10 µA |
| 弐号機 | 約6–7 µA |

beamが立ち上がっていない場合に限り、`Ten One Line Scripts > Long Operation FF`（旧資料 `LongOperationFF0`）を使います。正常時に反射的に実行しません。

起動時の既知popupには、`... is developed ...` → `Accept`、Dose modulation系 → `OK`、SerialEM CCD/COD系 → `OK/OFF` の過去記録がありますが、現在の全文が一致しない場合は停止して確認します。

## 6. Batch Grid Mapを取得する

1. `Setup_MultiGrid_Batch-GridMap` を実行する。
2. 本体倍率がAtlas用（260809手書き例 x50）へ変わったことを確認する。
3. 必要なら `Navigator > Montaging & Grids > Multiple Grid Operations...` を開く。
4. 必要に応じて `Run Inventory` → `Get Names`。
5. Atlasを取得するGridだけを選択する。
6. `Acquire Grid Maps` をON。
7. `Set States` から当日のGrid Map Imaging Stateを選ぶ。
8. `Run Script at end` は `AfterTakeGridMap`。
9. 不要なMedium Mag／Final Acquisitionが同時に有効でないことを確認する。
10. `Set Current Dir` で当日folderを指定し、`Start Run`。

**260809現行手書き基準のGrid Map用CL**

| 機体 | CL |
|---|---:|
| 初号機 | 200 µm |
| 弐号機 | Open |

script／EMPropertiesが自動設定する構成では、実行後の本体表示で確認します。Atlas取得中に手動で別GridをLoadしません。

中断したMulti-grid sessionを再開する場合は `Navigator > Montaging & Grids > Reopen Multi-grid Session` から当日folderの `.adoc` を開き、Grid／Navigator／保存先を再確認します。

---

# Part II. Grid Load、Atlas–Square、Square Map

## 7. 観察するGridをLoadする

1. Atlasを比較して観察Gridを決める。
2. Sample Storage／Stageで対象Gridを選ぶ。
3. Cartridge Controlの `Load` を実行する。
4. Load中の点滅が消え、交換が完了するまで待つ。
5. Multi Grid Operationsでも同じIDを選び `Open Nav`。
6. NavigatorがそのGridの `.nav` に切り替わりAtlasを表示できることを確認する。

**Stage上のGrid、Sample名、Multi Grid OperationsのID、Navigatorの4者が一致してから次へ進みます。**

## 8. AtlasとSquare倍率を合わせる

1. Atlas上で、Square倍率でも再同定できる破れ・汚れ・形の特徴を選ぶ。
2. Marker → `Add Marker` で登録する。本撮影候補を不用意に照射しないよう、可能なら優先度の低い周辺特徴を使う。
3. `CallSquareMag` を実行する。
4. 登録pointを選び `Go to XY`。
5. ステージ停止後、必要なときだけgun valveを開き、蛍光板／Screen Cameraとステージコントローラで特徴を中央付近へ寄せる。
6. `View` で撮影し、同じ特徴へMarkerを置く。
7. Navigatorで元のAtlas pointを選び `Shift to Marker`。
8. `OK` 後、同じpointへ再度 `Go to XY` → `View`。
9. 同一特徴が再現するまで反復する。

印刷本文x150、動画／過去手書きx200の例があるため、**倍率値ではなく現在のImaging Stateと本体倍率を正本**とします。

260809原本の当時画面では `Which item to shift` と `Saving shift for reuse` はともに中央の選択肢を使う記録ですが、現行dialogの文言を読んで意味が一致することを確認します。

`AdjustFOV_byDrag-FLA` を正しく校正・使用している環境では自動化できます。自動補正後に同じ補正を重複して手動適用しません。

## 9. 撮影候補Squareを登録する

1. Atlasを表示し `Add Points` で候補Squareを選ぶ。
2. 明らかな不良Squareを除き、後から追加するより最初は多めに確保する。
3. ステージ移動が少なくなるよう、一筆書きに近い順で選ぶ。
4. `Stop Adding`。
5. 対象itemをまとめて選択し `Acquire` を付ける。
6. Navigatorに `A` が付いたことを確認する。

**最初と最後には、Holeが明瞭で比較的きれいなSquareを残します。** 後段のLow Dose beam、AutoFocus、Coma/Stig、Record–View調整に使います。

## 10. Batch Square Mapを取得する

Multi Grid Operationsで対象Gridを選び、`Acquire Medium Mag Maps` のみを有効にします。`CallSquareMag`、当日のStates、`Set Mapping Parameters` を確認します。

**Square Map開始前の260809現行手書き基準**

- `Camera & Script > Setup > Record`
- Exposure time: **1.0 s**
- Dose Fractionation mode: **OFF**

これはSquare Map取得用であり、後の本撮影Camera条件とは別です。

`Acquire at Items` は以下を基準とします。

- `Run Script before Action` → `BeforeTakeSquares`
- `How often run task` → `Only at start of group`
- `Run Script after Action` → `AfterTakeSquare`
- `Close gun valve at end` → ON

script名が変更されている場合は推測せず、現行script一覧を確認します。`Start Run` 後、全 `A` itemにSquare Mapが作成されNavigatorへ追加されたことを確認します。

---

# Part III. Low Dose、slit、Square–View、Z

## 11. Low Dose Record modeへ移る

最後に残した軸合わせ用Squareへ移動してから `CallRecordMag` を実行し、Low Dose ControlのRecord modeへ移ります。

**260809現行手書き基準のRecord用CL**

| 機体 | CL |
|---|---:|
| 初号機 | 50 µm |
| 弐号機 | 5 µm |

script／EMProperties実行後、本体表示で意図したapertureになったことを確認します。

## 12. Low Dose各modeのbeamを合わせる

強い電子線を使うため、観察していない時間はgun valveを開けたままにしません。

1. Recordでgun valveを開き、蛍光板を下ろす。
2. 本体 `SHIFT X/Y` でRecord beamを中央へ合わせる。
3. `View` → `Focus` → `Trial` と切り替え、各beam位置を確認する。
4. View／Focus／Trialがずれているmodeでは `Additional beam shift` をONにしてX/Yを調整する。
5. 調整後は `Additional beam shift` をOFFへ戻す。
6. `Rec → View → Focus → Trial` を2–3周し、切替えても再現することを確認する。
7. 最後はRecordへ戻す。

## 13. slitを補正する

1. 蛍光板を下ろす。
2. slitを `In`。
3. `Multi Function` を押す。
4. 本体モニタを見ながらノブを反時計回りへ回し、影を出す。
5. 時計回りへ戻し、影が完全に消える位置を探す。
6. **影が消えた位置からさらに時計回りへ10ノッチ**。
7. gun valveを閉じ、蛍光板を上げる。
8. slit `Width`（eV）を記録する。

## 14. Square MapとViewの位置を合わせる

1. Square Map上でViewでも再同定できる汚れ／edgeを選びMarker → `Add Marker`。
2. 大きな移動時はgun valveを閉じ、`Go to XY/XYZ`。
3. Viewで同じ特徴を撮影しMarkerを置く。
4. Navigatorで元のSquare Map pointを選び `Shift to Marker`。
5. 更新pointへ再移動しViewで確認する。
6. 同一特徴が再現するまで反復する。

手書きではx150→x8000と表現されますが、成功条件は倍率値ではなく**Square Mapで指定した地点がViewで再現すること**です。

## 15. Eucentric focusとZを合わせる

1. `YoneoHole`／現行Hole認識補助が起動していることを確認する。
2. clean Holeを `Shift + 右ドラッグ` で画面中央へ移動する。
3. ViewでHole全体が中央にあることを確認する。
4. `Ten One Line Scripts > Set Eucentric Focus`。
5. `Auto Focus Script(s)` を実行する。
6. Logの完了表示を確認する。

**260809現行手書き基準では、本体ZとNavigator Zが15 µm以上異なる場合、対象Square群へ `Update Z` を反映します。** 15 µm未満でも像が明らかに外れる場合は値だけで判断せず再評価します。

終了時は必要なapertureを戻し、gun valveを閉じます。AutoFocus失敗時は連打せず、Hole中央、YoneoHole、View像、Zの大外れを確認してから再試行します。

---

# Part IV. Screeningと撮影点作成

## 16. SquareをScreeningする

1. Navigatorから調べるSquareを開く。
2. Holeへ `Add at Marker`。
3. 長距離移動中は不要照射を避け、移動後に観察に必要な状態へする。
4. View、必要に応じてAutoFocusを行う。
5. 氷厚、Hole形状、汚れ、粒子／TMV等を確認する。
6. 見たい領域は `Shift + 右ドラッグ` で中央へ移す。
7. Square番号・Hole番号を記録する。

Screeningでも `Test Shot` を使いますが、ここではSquare／Hole評価用です。**Exposure timeを反映するpopupはScreening中は `No`。** 後段のFinal TestShotと混同しません。

## 17. Multi-shotを設定する

`Navigator > Montaging & Grids > Set Multi-shot Parameter` を開きます。

**260809現行手書き基準の標準配置**

| 項目 | 基準 |
|---|---:|
| 1 Hole内のshot数 | **3** |
| main ring distance | **0.38–0.40 µm** |
| multi-hole | **5 × 5** |
| circle diameter | **0.7 µm** |

最新原本の3-shot記載はFinal直前の `25 holes × 3 shots = 75` の確認メモとも整合します。Hole径、beam径、試料条件を変える場合は意図的に変更し、日次記録へ残します。

Hole vector関連popupは260809手書きでは `Yes Always` の記録があります。文言が異なる場合は確認します。

## 18. Hole Finderで撮影範囲を作る

1. 対象Squareを選択する。
2. 必要なら `Add Polygon` で撮影領域を囲う。描画を戻すときはBackspace。
3. `Navigator > Montaging & Grids > Find Holes in Regular Grid`。
4. `Find Holes`。
5. Hole格子に合うようdiameter、spacing、edge、intensity／cutoff等を調整する。
6. 画像上で採用・除外結果を確認する。
7. `Make Navigator Points`。

旧手書きのCombiner `<15 holes` → `3` は260809最終版では現行標準として再掲されていないため、**旧値3を必須値として持ち越しません。**

## 19. Map Hole VectorsとCombine Points

1. Multiple Record Setupの `Map Hole Vectors` を実行する。
2. Hole Finder格子とmulti-hole vectorを対応させる。
3. `Navigator > Montaging & Grids > Combine Points for Multishot`。
4. `In same group as current point` の状態で `Combine Points`。
5. edge、汚れ、厚すぎる領域、不自然なpointを除外する。
6. **Squareごとに `Navigator > Save`。**
7. 全Square終了後 `Count Movie records`／同等scriptを実行し、Hole数とmovie数をLogから記録する。

標準5×5×3構成なら1 groupは75撮影ですが、欠損Holeや除外があるため実際のLogを正本とします。

---

# Part V. 光学補正、Dose、Camera、Record–View

## 20. コマ・非点を補正する

1. 最初／最後に残したclean Squareへ移る。
2. 薄い氷でHoleを認識できる領域を選ぶ。
3. 必要ならAutoFocusでZを合わせる。
4. ScreeningでDefocusを大きくしていた場合は補正用へ戻す。260809手書きでは `Focus/Tune > Set Target` の -1.4 µm例がある。
5. beam centeringを再確認する。
6. `FullAutoAlignComaAndStig` または `AlignComaAndStig` を実行する。
7. 補正後に `Rec → View → Focus → Trial` を再確認し、特にTrialがRecord中心から外れていないことを見る。

自動補正が止まる場合は公式手順の `Correct Astigmatism by CTF`／`Coma-free Alignment by CTF` へ戻ります。成立しないまま本撮影へ進みません。

## 21. Final TestShotでDoseとCamera timingを決める

このTestShotはScreening用ではなく、**本撮影DoseとCamera timingを決める最終測定**です。

1. 膜がなく真空になっている領域へ移動する。
2. Viewで何もないことを確認する。
3. `Test Shot` を実行する。
4. Logから以下を記録する。
   - Total dose
   - Dose per frame
   - Exposure time
   - Frame time
   - Number of frames
   - Ice thickness（表示される場合）
5. Exposure time／Frame time反映popupは **`Yes`**。

Dose targetは試料固有です。過去動画の80 e-/Å²、2 e-/Å²/frameは実施例に留めます。

## 22. Camera Setupと保存条件を決める

`Camera & Script > Setup > Record` を開きます。

- Dose Fractionation mode → **ON**
- Save frames → **ON**
- Exposure time → Final TestShotと一致
- Frame time → Final TestShotと一致

Processing表示と保存frameの正規化状態は別に確認します。公式画面に `Gain Normalized` と `Save unnormalized frames even if Gain Normalized is selected` の組合せがあるため、Processing欄だけから保存frameを推定しません。

`Set File Options` で保存形式と解析pipelineの整合を確認します。**260809現行手書き基準ではBase nameは `img` のまま変更しません。**

保存先はFinal Data Parameters側の「Grid directory配下にframe directoryを作る」方式を標準とし、別の手動 `Micrographs` 方式を同一Run内で混在させません。

## 23. RecordとViewの位置を手動で合わせる

**Coma/Stig後にAutoではなく手動で位置合わせします。**

1. Record modeで目標物を中央へ置く。
2. `Preview` でRecord条件の画像を取得する。
3. `View` を撮り、同じ特徴の位置を比較する。
4. View像がずれていれば、**Shiftを押さずに右ドラッグ**してPreviewで見えた中心へ動かす。
5. `Offsets for: View` の `Set` で保存する。
6. View → Previewを再取得し、ずれが許容範囲に収まるまで反復する。

ここでの右ドラッグはViewのImage Shift／offset調整です。`Shift + 右ドラッグ` のstage移動と混同しません。

---

# Part VI. Final Data Collection

## 24. Final前の状態を戻す

Final直前に一連で再確認します。

- Record用CL（260809基準: 初50 µm／弐5 µm）
- Rec／View／Focus／Trialのbeam位置
- Record–View offset
- slit補正
- aperture状態
- Final TestShotとCameraのExposure／Frame time
- Navigator保存

## 25. Run Final Acquisitionを設定する

Multi Grid Operationsで `Run Final Acquisition` をONにし、対象Gridを確認します。`Set Final Data Parameters` で少なくとも以下を確認します。

- `Make frame directories under grid directories` → ON
- Multiple Recordsのvector source → `Setting for each grid`
- Map Hole Vectorsの扱いが各Grid設定と一致

`Acquire at Items` では `Run script` をONにし、**`SPADataCollection`** を選びます。`SPADataCollection_Screening` と取り違えません。

Manage Nitrogen、Flash FEG、ZLP alignmentを使用します。260809資料の印刷基準ではFlash FEG／ZLP関連は**360–480 min程度**のレンジで記載されていますが、長時間Run条件に依存するため当日の施設設定を優先します。

Defocus cycleは試料固有です。260809資料例 -1〜-2 µm／10 steps、動画別例 -0.7〜-2.2 µm／16 steps。**試料計画で決めた範囲とstepを入力し、過去値を既定値にしません。**

## 26. Start Runと初期確認

1. `Start Run` 直前にもう一度beam centeringを確認する。
2. Objective aperture関連popupは、260809現行手書きでは `Yes` の運用記録。ただし完全に同じprompt／機体状態か確認する。
3. Start Run後、Navigator item、Log、frame directoryを同時に見る。
4. 標準5×5×3構成では **25 holes × 3 = 75 acquisitions** が最初の完全なgroupの目安。
5. 欠損・除外がある場合は実際のitem数を正本とする。
6. **最初の1 group相当が正常に進み、Log／Navigatorに致命的エラーがなく、frame保存を確認してから装置を離れる。**

`Start Run` を押しただけでは撮影開始完了とみなしません。

## 27. 途中停止・再開

通常停止は `End Nav`／`End Navigator` を使い、現在処理が安全に止まるのを待ちます。STOPを使った場合を含め、停止後は **`SetImageShift 0 0`** を実行してImage Shiftを基準へ戻します。

停止時刻、最後に正常取得したitem、未完了item、Log、frame保存状態、Navigator保存状態を記録します。再開時は重複取得を避けます。

Multi-grid session自体を閉じた後は `Reopen Multi-grid Session` から当日 `.adoc` を開き、Grid／Navigator／保存先を再確認します。

---

# Part VII. 異常時とfallback

## 28. よくある異常と戻り先

| 症状 | 戻り先・確認 |
|---|---|
| Multi Grid Operationsが動かない | Grid名先頭の `N`／`n` を確認。直らなければ非Multi-grid fallback |
| Image Shift撮影でHoleが徐々にずれる | Hole vector精密化／`Step To & Adjust IS` |
| beam edgeが見える | Record／Trial beam center、必要なら `CenterBeam`／beam-shift refinement |
| Logに赤字 | 赤字全般を無視しない。初見、Navigator停止、frame欠損を伴えば停止 |
| UltraFoilでSkip頻発 | OL apertureの挿入・中心合わせを検討。施設運用を確認 |
| AutoFocus／AlignToHole不安定 | Find One Hole、Template Match、YoneoHole。YoneoHole使用時は起動状態確認 |

公式資料には20時間超の長時間撮影でOL aperture推奨の記載があります。現行施設運用を確認して実施します。

## 29. Multi Grid operationを使えない場合のfallback

標準workflowが正常動作しない場合だけ切り替えます。

1. Navigatorを開く。
2. `CallAtlasMag` → Screen Cameraでbeam center → Full Montage → **Montage ControlのStart**。
3. Square候補をAcquireにし、`New file at item`、File Properties、Save Asを設定。
4. `Navigator > Acquire at Items` で `BeforeTakeSquares`／`AfterTakeSquare` を設定してSquare Mapを作る。
5. 通常手順と同様にHole Finder、Coma/Stig、TestShot、Camera、CL／beam／Record–Viewを確認。
6. `Acquire at Items` のGOで収集する。

fallbackへ移ったことを日次記録に残し、標準Multi-grid手順と設定を混在させません。

---

# Part VIII. 記録と版管理

## 30. その日の記録

最低限、以下を残します。

- 実施日、担当者、機体
- Grid ID／Sample
- Pixel size
- SerialEM setting、主要script版
- Atlas／Navigator／frame保存先
- Atlas／Square／View／Record倍率
- CL／Objective aperture、slit Width
- Z／Update Z
- Multi-shot配置、Hole／movie数
- Coma/Stig結果
- TestShot Dose、Exposure／Frame time
- Defocus range
- Camera変更点
- 開始時刻
- 警告と対処

既定から変更した値は、「何を」「なぜ」変えたかも残します。

## 31. 根拠資料と版の優先順位

2026-08-09版の優先順位は以下です。

1. 260809手書き最終版PDF
2. 操作動画／元音声
3. 公式印刷本文／旧公式PDF／PPTX
4. Version2／Version1手書き
5. Gemini MD／自動文字起こし

最新版でも、Screening中のgun valve開閉順のように動画・不要照射回避の運用と整合しない箇所は文字どおり採用していません。また、旧版のShift+H batch処理は最新原本で大きく取消されているためdefault workflowから外しています。

## 32. 発行前に残るversion verification

workflow自体の再構築ではなく、現行実機で以下だけを確認します。

- Square Imaging State x150／x200
- `Shift to Marker` dialogの現行文言
- 初号機／弐号機のCL実表示
- Long Operation FF、AutoFocus、Coma/Stig、SPADataCollectionの現行名称
- Final Data Parametersのoption文言
- Objective aperture popup全文
- Final Run後のLog／Navigator／frame保存

これらが確認できるまではstatusを `draft` とします。
