# G2 Binary Asset Pipeline 实施计划

## 状态

- DecisionStatus：Accepted
- ImplementationStatus：B0-B5 Backend/Local Blob + Upload-aware Local-to-cloud Import + PNG/Baseline-JPEG/ClamAV Isolated + Multi-engine/Failover/Fresh-update First Verticals Implemented / B6 PostgreSQL Retention + Git/LFS + Runtime Filesystem Import/Replace First Vertical Implemented / B7 Contract Matrix + Browser Product Journey Implemented, Cross-target Full Product Journey Planned
- ProductGateStatus：G2 In Progress
- Global Phase：G2 Executable Full-stack Workspace
- 日期：2026-07-18
- Owner：`@prodivix/assets`、Workspace、Backend、Compiler、Runtime composition
- 关联：
  - `specs/decisions/47.binary-asset-pipeline.md`
  - `specs/implementation/g2-executable-full-stack-workspace.md`

## 实施阶段

### B0：Decision 与 owner hard cut

状态：Implemented。

- ADR 47 冻结 original blob、reference、materialization、transform、delivery、Git 与安全边界。
- `@prodivix/assets` 拥有 transport-neutral binary contract；Workspace 继续拥有 asset document identity/revision。

### B1：Contract 与 Workspace current shape

状态：Implemented（first vertical）。

- strict `workspace-blob` reference、SHA-256 digest、size/media normalization。
- byte materialization verification 与 reader/uploader ports。
- Workspace asset 不再接受 `dataUrl`、`text`、URL、token 或 provider locator。
- TypeScript/Go/Command validator 与 Semantic capability 使用同一 current shape。
- exact-key validator 与 property/conformance test 拒绝 inline payload、未知 metadata、MIME/size/reference drift。

### B2：Production blob store first vertical

状态：Implemented（first vertical）。

- Workspace-scoped PostgreSQL content-addressed blob、owner-only upload/read。
- request/body/object budget、digest/length verification、idempotent existing/conflict。
- private/no-store、nosniff、attachment response；不提供 public asset origin。
- upload 先于 Workspace reference commit；失败 upload 与 durable dereference 由 PostgreSQL retention/reference
  mark-sweep 异步清理，不把 blob upload 或 delete 伪装成作者事务。
- PostgreSQL migration、owner authorization、idempotent PUT、hardened GET 与 commit-time reference fence 已进入 Go Gate。
- `import-local-project` 的 upload-aware multipart protocol 已支持在同一事务中创建 Project、Workspace、blob 与
  reference-only documents；旧 JSON-only Asset import 继续以 `AST-2004` fail closed，不创建 dangling reference。

### B3：Compiler 与 Executable materialization

状态：Implemented（first vertical）。

- composition root 提供 verified materials；Compiler 不访问网络。
- missing/duplicate/unreferenced/drift 产生 blocking `AST-*` diagnostic。
- ExportAsset/ExecutableProject/Remote codec/rootless 使用 exact bytes，Snapshot digest 覆盖 binary content。
- snapshot 只携带 bytes/SourceTrace，不携带 `workspace-blob` reference、blob digest 或 store locator。
- public root 当前只允许 static media；active content 与 download-only media 分别以 `AST-1101/1102` 阻断。

### B4：Browser Resources first vertical

状态：Implemented（authorized Backend + local-only composition + local-to-cloud import first vertical）。

- upload bytes -> verified reference -> Workspace Operation。
- preview/download 按需读取 blob，并用短期 object URL；dispose 时 revoke。
- local-only Workspace 已使用独立 IndexedDB blob adapter，不回退到 Workspace data URL；record 按 Workspace/digest
  分区并在读取时重新验证 exact digest/length/media identity，32 MiB 单对象限制与 transport-neutral port 一致。
- Resources 上传先验证并持久化 blob，再通过单一 Workspace authoring intent 写入 reference；读取生成短期
  object URL 并在 selection/dispose 时 revoke。
- Blueprint Browser/Remote Run、Workspace Test 与 ZIP Export 在 Compiler 前共用 materialization coordinator；
  相同 Workspace blob 在单轮 composition 内只读取一次；composition 按 local Workspace identity 选择 IndexedDB
  reader，否则要求授权 Backend reader，二者都只把 verified materialization 交给 Compiler。
- local Resources 已支持 bytes-first upload、reference authoring、短期 object URL preview/download；active content 仍不
  inline。duplicate 在新 Workspace record commit 前复制 exact referenced blobs，project delete 在作者态删除后清理整个
  blob partition，单 document delete 不做同步 destructive delete。
- local -> cloud sync 在网络请求前 materialize 并重新验证每个 Asset document 的 exact bytes，按 digest 去重；
  4 MiB manifest、256 个 unique blob、32 MiB 单 blob 与 128 MiB 总 bytes 是前后端一致的硬预算。
- upload-aware multipart 只包含一个 JSON `manifest` part 与按 canonical digest 命名、exact media type 的 raw `asset`
  parts；manifest/Workspace wire 不含 bytes、base64、`dataUrl` 或 provider locator。Backend 使用 streaming multipart
  reader、全请求 hard cut、strict part headers 与 SHA-256/length/media preflight。
- Backend 在写库前拒绝 missing、unreferenced、duplicate 或 identity-drifted materialization；Project metadata、
  Workspace、Route/Settings、blobs 与 documents 在同一 PostgreSQL transaction 中提交，任一 document insert 失败时
  blob 与 Project 一并 rollback。无 Asset 的 local project 保持 JSON compatibility；含 Asset 的旧 JSON-only 请求继续
  固定 `AST-2004` fail closed。

### B5：Transform 与 delivery

状态：Implemented（PNG + baseline JPEG/ClamAV isolated + multi-engine/failover/fresh-update first vertical）；full raster/more-format/public adapters Planned。

- `@prodivix/assets` 已实现 strict recipe decoder、transformer/scanner/cache port，以及 transformer ->
  exact-byte verification -> dimension policy -> scan attestation -> cache 的 fail-closed coordinator。
- 首个 `prodivix.image.png-sanitize@1` adapter 验证 PNG signature/chunk order/CRC/critical chunk、颜色 profile、
  8192x8192/32MP budget，确定性剥离 text/EXIF/APNG 等非交付 metadata；输出重新计算 digest。
- 第二格式 `prodivix.image.jpeg-sanitize@1` 只接受 8-bit baseline Huffman、1/3 component、合法
  DQT/DHT/SOF0/SOS/EOI、受限 segment/scan/sampling/dimensions；剥离 APP/COM metadata，仅保留渲染所需 Adobe
  APP14，并保持已验证 entropy bytes exact。progressive/arithmetic/CMYK、非默认 EXIF orientation、table
  redefinition、trailing/truncated/malformed 或超预算输入 fail closed。
- `prodivix.scanner.png-structure@1` 与 `prodivix.scanner.jpeg-structure@1` 只给各自 canonical sanitized image
  颁发 structural clean；versioned scanner chain 要求 structural 与全部 ClamAV malware policy 同时 clean 才能
  颁发最终 attestation。完整 raster
  decode/re-encode 仍 Planned，不能把 structural scanner 宣称为通用病毒扫描。
- `apps/asset-delivery-host` 已实现有界 ClamAV `INSTREAM` adapter：exact digest/length/media preflight、bounded
  request frame/response、timeout/backpressure、固定 malware finding code 与 daemon signature hard cut。daemon
  error、timeout、connection/protocol failure 统一 scanner-unavailable，不能分配 delivery session。
- `@prodivix/assets` 的 transport-neutral failover pool 以显式 replica identity 和固定顺序组合同一逻辑 engine；
  仅 connection/daemon-error/protocol/timeout 可切换，configuration/policy-drift/stale-database 与 quarantine 不得
  回退，全部 replica 基础设施不可用固定收敛为
  `replicas-exhausted`。required engine 继续由 scanner chain 全部执行，任一 quarantine 或 unavailable 都不能颁发 clean。
- Host fleet runtime 以有界 `PING`/`VERSIONCOMMANDS` 探测每个 required engine 的所有 replica，验证
  `INSTREAM` capability、engine/signature database version/time 与 freshness。每个 engine 只选择同时支配其他
  replica 的 freshest converged policy cohort；downgrade、相同 freshness 的不同 digest、不可比较 frontier、
  过期/未来时间、缺失 command 与全部 replica 不可用均 fail closed。
- 全部 required engine 的 policy digest 与 composition base identity 共同形成 effective scanner policy version；
  refresh 只有在所有 engine 验证成功后才原子发布 immutable generation。FreshClam 更新由下一次 cached readiness/
  delivery refresh 接纳，不再要求 Host restart；失败 refresh 保留最后 good snapshot 但当前请求 fail closed，不能
  部分升级。
- Host 在读取 upload 前取得 snapshot，并在 session 签发前二次验证 exact generation。新 generation 被观察时会
  撤销全部旧 capability session；旧 generation 的 in-flight scan 不能签发。derived cache 保留 exact bytes，因
  scanner policy version 改变而强制重新扫描并更新 attestation，不重新执行确定性 transform。
- GitHub-only `g2-binary-asset-malware.yml` 已配置 official preloaded-database image、rootless Podman、internal
  network、capability drop 与 clean/quarantine real-daemon canary；首次远端执行证据仍待阶段性提交推送后确认，
  当前不能宣称该 workflow 已通过。
- bounded LRU derived cache 以 recipe digest 定位，命中后重新验证 output bytes、media、dimensions 与 clean
  attestation；同 recipe 的不同输出 hard conflict。
- 独立 `apps/asset-delivery-host` 只接收 Backend internal-token 请求，保存短期 bytes 与 capability hash，按
  `https://<capability>.<asset-origin>/asset` 交付；不持有 Workspace/database/object-store credential。
- Backend owner gateway 从 canonical blob 读取 exact bytes，以 exact transform/media/disposition 进入通用 image
  transform endpoint，并严格校验 Host URL 必须属于配置的 wildcard origin；Web Resources 已可生成 sanitized
  PNG/baseline-JPEG isolated preview 或 scanned attachment。
- active content 永远禁止 inline；即使 ClamAV 判 clean，也只能以 `application/octet-stream` + attachment、
  deny-all CSP、sandbox、nosniff、noopen、no-store 从 capability origin 交付。production registry 对明确
  allowlist 的 static/download/active media 提供唯一 scanner coverage，未知 media 继续 fail closed。
- public/CDN projection、durable revocation list、多 vendor scanner adapter、完整 raster re-encode 与更多格式仍 Planned；
  当前 production fleet adapter 是一个或多个 required ClamAV engine group，不宣称已有第二种 malware vendor。

### B6：Git 与 runtime import

状态：Implemented（PostgreSQL retention/reference sweep + Git/LFS + runtime filesystem import/replace first vertical）。

- `@prodivix/assets` 已提供 target-explicit binary / threshold LFS projection：稳定
  `prodivix.binary-asset-git-manifest.v1`、canonical Git LFS v1 pointer、path-scoped managed `.gitattributes`、
  exact LFS upload objects 与 4096 Asset / 256 MiB 总字节 hard budget。missing、duplicate、orphan、reference drift、
  checkout path/case/reserved-path conflict 均以 `AST-1201..1206` 阻断整次投影，不发布 partial tree。
- Compiler 只把 exact Workspace/document content/meta revision 与 verified materialization 投影给 Asset owner；manifest
  不含 `workspace-blob` kind、provider locator、signed URL 或 token。Browser Git adapter 先完成并校验全部 LFS object upload，
  再按旧 manifest 删除 stale Asset、保留用户 `.gitattributes` 区域并替换 managed region，最后统一 stage；缺 LFS adapter
  或 upload OID/size drift 时工作树保持未修改。
- runtime filesystem added Asset 仅对固定 binary extension/MIME magic 映射开放；existing Asset replace 要求 exact single
  document SourceTrace、content/meta revision、baseline digest/size 与 MIME magic。runtime delete 继续由 Resources 显式删除
  流程拥有，不能从 ephemeral diff 自动采纳。
- Compiler 先生成 exact byte/upload-reference plan；Web 按 local Workspace 选择 IndexedDB uploader，否则要求授权 Backend
  uploader。全部 response reference 与预期 digest/size/media 一致后，planner 才接受 upload receipts，并把 Asset
  `document.create` / `asset.content.replace` 与同批 CodeArtifact change 合成一个可逆 Workspace Transaction。上传期间
  Workspace revision 漂移会阻断 authoring；已上传但未引用的 blob 由本节 retention sweep 回收。
- migration v5 为 Workspace-local blob 增加 nullable `unreferenced_since`：`NULL` 表示 current Asset reference，
  timestamp 表示 orphan grace 起点；既有行先按 `created_at` 进入待 reconcile 状态。
- upload retry 仅为 exact digest/size/media/bytes 的 orphan 刷新 grace；current reference 保持 `NULL`。
- Snapshot import 与 Atomic Workspace Operation 在同一个 Workspace-locked transaction 内 reconcile final reference set；
  新引用清空 orphan clock，delete/replace 从 durable commit 时刻开始完整 retention window，不同步删除 bytes。
- Backend 启动后立即运行、随后按 interval 运行有界 sweep；默认 retention `168h`、interval `1h`、每轮最多
  `32` 个 Workspace / `256` 个 blob，hard cap 分别为 `1024` / `4096`。
- sweep 使用与 authoring commit 相同的 Workspace row lock 与 `SKIP LOCKED`，在锁内按 exact
  `(workspace_id, digest)` current document reference 二次判定；strict `< cutoff` 才删除，locked Workspace 跳过，
  日志只发布 aggregate count/bytes。
- unit Gate 覆盖 policy hard cut、事务 rollback、引用/dereference reconcile、scheduler start/stop；真实 PostgreSQL
  Gate 覆盖 referenced protection、first-observed orphan、strict cutoff、跨 Workspace same-digest isolation 与
  authoring-lock concurrency fence，并接入 `G2 PostgreSQL Gates`。
- `@prodivix/assets`、Compiler 与 Web Gate 已覆盖 deterministic binary/LFS projection、LFS object dedup、managed attributes
  lifecycle、missing/drift diagnostics、local/cloud upload composition、upload-before-authoring 次序，以及 Execution Center
  explicit Asset import/replace 产品路径；它们由现有 `Tests` workflow 与 `pnpm run verify:g2:binary-assets` 共同执行。

### B7：G2 Golden 与 closure

状态：Contract Matrix + Browser Product Journey Implemented / Cross-target Closure In Progress。

- Browser Catalog JPEG 已覆盖 bytes-first upload、Workspace durable reference commit、page reload 后按 canonical
  reference 重新 materialize exact source bytes、`jpeg-sanitize` request 与 capability-origin isolated preview。
- Browser Gate 使用 strict service-boundary harness 校验 Auth、Settings/Operation durable outbox 排序、Atomic Commit
  aggregate response、source digest/length/media、delivery strict wire 与真实 Chromium image decode；source metadata
  canary 不得进入 isolated bytes。
- `pnpm run verify:g2:binary-assets:browser` 是独立 Gate，并进入 GitHub Smoke；Backend/Host 的 transform、scanner 与
  owner gateway 继续由各自 integration Gate 覆盖，Browser harness 不替代 real-daemon malware Gate。
- Remote/Test/Build/Export 的真实产品旅程、第二 standalone target 与跨表面 SourceTrace/cache/leak closure 继续进行。
- 证据进入 `specs/roadmap/g2-closure-evidence.md`。

当前 living Golden Workspace 已从 inline SVG 切换为 blob-backed PNG，并覆盖 Compiler、Executable Snapshot、
Browser mount 与 Remote strict codec 的 exact bytes；local-only Resources/Run/Test/Export 和 upload-aware local-to-cloud
sync 已有 verified materialization 纵切。真实 JPEG Browser E2E upload/reload/transform/isolated-delivery 产品旅程已进入
B7 Gate；Remote/Test/Build/Export 的同级真实产品旅程与第二 target 仍待 closure。

## 验收标准

- [x] Binary Asset 有 Accepted ADR 和唯一 transport-neutral owner。
- [x] Workspace/current wire 不保存 binary/base64/provider locator。
- [x] production blob upload/read 具有 owner、digest、size、MIME 与 object budget Gate。
- [x] Compiler 只消费 verified materialization，Browser/Remote 使用同一 exact bytes。
- [x] local-only Workspace 以 Workspace-scoped IndexedDB blob adapter 支持 Resources upload/preview、Run/Test/Export 与 duplicate/delete lifecycle，不保存 inline bytes。
- [x] local-to-cloud import 以 bounded multipart 传输 exact raw bytes，并将 Project/Workspace/blob/reference documents 原子提交；JSON manifest 不含 inline bytes。
- [x] production blob orphan retention 使用 Workspace-locked、bounded、strict-cutoff mark/sweep；current reference
      永不删除，durable dereference 获得完整 grace window，真实 PostgreSQL concurrency/isolation Gate 已接入 CI。
- [x] Git binary/LFS projection 生成稳定 manifest、canonical pointer、managed attributes 与 exact LFS upload objects；
      missing/drift/path conflict fail closed，Browser adapter 在工作树 mutation 前完成 LFS upload，并清理旧 manifest Asset。
- [x] runtime filesystem Asset import/replace 先经 local/Backend uploader 验证 exact receipt，再与所选 Code change 合成
      单个可逆 Workspace Transaction；revision/baseline/media drift、缺失/伪造 receipt 与 runtime delete fail closed。
- [x] PNG 与 baseline JPEG deterministic transform、各自 structural + ClamAV scan/quarantine、multi-engine required chain、replica failover、daemon readiness/database-age、atomic fresh-update、generation-fenced session revocation、policy-version cache re-scan 与 isolated capability delivery 通过本地 first-vertical Gate。
- [x] Browser JPEG 产品旅程按 exact bytes 完成 upload、durable reference commit、reload materialization、sanitized
      delivery request 与 capability-origin image decode，并由独立 Playwright Gate/Smoke CI 固定。
- [ ] GitHub rootless real-daemon malware workflow 取得首次通过证据，并完成 multi-vendor、完整 raster/更多格式 transform 与 public-CDN delivery Gate。
- [ ] Golden product image 在 Remote、Test、Build、Export 与两个 standalone target 中通过（React/Vite contract
      matrix 与 Browser 真实旅程已覆盖；跨 target 真实产品旅程和第二 target 未完成）。
