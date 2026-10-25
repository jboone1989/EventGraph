# 006 · 可接力清单

- [x] Research First：仓库模型路由、Queue、UI、sources、官方开源和第三方原始公告。
- [x] Claude 原生只读独立反方（2026-10-25），保存证据与重要异议。
- [x] 开发 / 生产模型与内容状态只读核查，区分预筛 blocked 和真实故障。
- [x] 编码：模型路由暂时不可用恢复、付费健康模型 fallback、自动重测窗口。
- [x] 添加最少官方亚洲一手信源 BOJ/RBI/BOK/日本 FSA 及小回填量。
- [x] 编码：运行页增加文章级问题指标、后台导航按运营流程重排。
- [x] PR #116：Check/Docker/E2E + Claude 复审成功，已合并到 develop（提交 `5a89d501`）。**开发部署与模型实际恢复另需证据。**
- [ ] 验证开发镜像确实部署、真 API 与后台实际显示；1440/390、亮暗视觉审查。
- [x] **2026-10-25 开发真实智谱直连能力测试成功**：现有 `testRegisteredModel` 经带预算回执的受控调用返回 `verified`、2913 ms、`Valid chat response`；`MODEL_PROVIDER_REGISTRY_ENABLED`、`MODEL_CALLS_ENABLED` 均为 true，无密钥泄露。**这不是阶段已经切换的证据**。
- [x] 2026-10-25 只读核对开发预算：`budgets` 的 `zhipu` 当前为 100/min、2000/h、20000/day（**请求次数上限，不是人民币金额上限**）；NVIDIA 24/min、720/h、3000/day。当前智谱限额不足以约束支出，不能直接将全部处理阶段切到付费模型。
- [ ] 先明确适用于开发阶段小样本的付费请求/金额预算，检查 dev worker 当前积压；再经现有有审计的模型分配 API 只切一个阶段并小批量验证成功率与真实用量。不得对生产直接批量放量。
- [ ] 在开发环境对失败组执行受控 requeue，并测算每小时吞吐与调用成本；不要直接全量跑生产。
- [ ] 试跑 BOJ/RBI/BOK/日本 FSA 数据源从 Feed→文章→事件的真实处理；开发环境启用后确认成功，生产按发布流程再启用。
- [x] 2026-10-25 对遗漏的中国媒体/监管/科技/加密信息源做 Search First 和现有 collector 真机预览，记录在 `china-and-asia-source-inventory.md`。
- [x] PR #117：新增九条中国相关 RSS 配置与测试；Check/Docker/E2E/Claude 通过并合并 develop（提交 `e12892f2`）。九源也已用现有开发后台 API 实际入库并拉取，具体数据见 `china-and-asia-source-inventory.md`。
- [x] **中国九源**已从开发环境现有后台 `createSource` + `fetchNow` 入库并采集（九源 health=ok，318 篇原始文章）；**首次回填 2 条只限制首轮，第二次会导入更多新近条目**。
- [ ] **未完成**：九源文章的付费 GLM 处理与事件证据关联（首次快照 0 关联）、原日韩/印度四源的真实开发/生产入库核验、生产发布。开发库的 225 个 `publications.visibility=public` 含大量 `hot_signal`，并非 225 篇索引新闻。
- [x] 2026-10-25 **Pi 在真实 worktree 交付三套监管一手源配置**（`.worktrees/pi-china-feeds-20261025`，分支 `feat/pi-china-primary-sources`，基于 origin/develop `f4f365c`）：`industry/sources.json` 新增 `rss-cn-pboc-announcements`（RSS 6 条，rewrite 后 https）、`web-cn-csrc-announcements`（最新 2026-10-23/19，拒目录页）、`web-cn-miit-announcements`（5 条日期正确），均为 T1/editorial/回填 2 条/不全文；配置均经 cn-dev 现有 `previewSource` 实测后原样入库。新测试 `tests/china-primary-sources.standalone.test.ts` 3/3 通过；相关 standalone 16 项、DB 测试（source-rules、source-publication-window）7 项通过（临时库 `aihot_pi_test`）；`npm run typecheck`、`git diff --check` 干净。 **只读备注**：GLM 七阶段仍绑 NVIDIA/付费模型，切换验证属后续事项，本会话未做付费调用。
- [ ] 中国监管一手源剩余目标：发改委、商务部、财政部、沪深交易所、港交所/香港证监会、科技部 MOST；通过官方 URL 的现有 web_list/RSS/JSON 接入并验证，先保证 CPI/利率/交易制度/政策等一级公告可用。
- [ ] 财新、第一财经、界面、金十、财联社、证券时报、新华社、人民网、经济观察网、36氪；中文 AI 企业公告/机器之心/新智元/智东西；加密 BlockBeats/Odaily/金色财经：逐个找稳定有权限的 RSS/API 或现有 web_list，不用假 URL/无授权全文镜像。
- [ ] 别忘记三个商业目标：搜索新闻页流量、新闻到事件深读、长期关注复访。新来源要测对事件证据和站内阅读的有效贡献，不以 RSS 条数充当增长。
- [ ] 进一步检索用户所述亚洲其他信源的原始清单；补韩国、东南亚与政策/金融机构的**真实稳定官方接口**，逐个验证。
- [ ] 仅在有业务使用证据后删除冗余后台页面；本 PR 未删业务路由。
- [ ] 另查 Graphiti ingest 584 条历史失败是否活跃故障，避免误报为今天活跃积压。

下一次会话先读本目录全部文件及 `specs/005-news-growth-funnel`，核对 PR 最新状态，不重复从聊天记忆猜测。