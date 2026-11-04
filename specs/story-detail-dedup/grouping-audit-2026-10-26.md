# 热点事件 Fact 归组检查（2026-10-26）

> **检查范围与结论**：cn-dev 只读连接本地开发 PostgreSQL，并只读请求 VM13 开发预览公开 Story/Route API。没有接触生产数据库，更没有合并或重算历史 Fact。此处“页面有 11 个事实站点”的诊断，**不等于**确认全部 Fact 合并关系错误。

## 取样和证据

- [VM13 事件详情](http://43.133.185.154/story/93a28e20-4a3b-4f3e-89ee-e07deb8897ea)；公开端点 `/api/site/stories/:id`、`/api/site/stories/:id/route` 均 HTTP 200；11 个 Fact-derived route stations、11 篇报告、3 家来源。每站显示 `sourceCount: 1`。
- 初始阶段（“9 家异议”）：CoinDesk、Cointelegraph、Decrypt 数篇报道的事件描述很接近，但各自落在不同 Fact。Cointelegraph 原报道引用同一份发行方异议公告，详见 https://cointelegraph.com/news/public-companies-object-okx-ice-tokenized-stock ；另参考 https://www.coindesk.com/business/2026/10/18/sec-tokenized-stock-framework-faces-issuer-pushback-as-broadcom-verizon-object-to-okx-ice-listing 及 https://decrypt.co/381349/why-some-america-biggest-companies-objecting-tokenized-shares 。**须先查确切同一批名单/公告，不能用“9”这个数字作事实主键**。
- 中期“16 家”：CoinDesk、Cointelegraph、Decrypt 的新增异议新闻；平台负责人对异议的公开回应，是**单独进展**，不能把“公司异议”和“负责人回应”合为一个 Fact。
- 后期“22 家”：CoinDesk 与 Decrypt 的报道，另有一篇关注新增数家的文章；需核对究竟是否同一批新增提交。累计数字的“16→22”不意味着前一个 16 家 Fact 的事实身份应被覆盖，也不能因为总数相同就自动合并。
- 本地 cn-dev 开发库**没有** VM13 这个公开 Story（两个环境数据库分离）。因此本轮**未读取此例在生产端的 `grouping_decisions`、候选召回/复审回执**，不能将前端一个 Fact 一条报道直接归罪于 recall/LLM 某一个环节。
- cn-dev 本地另有一个 6 Fact/9 报道的样本（Gemini 4 Argon），只读记录显示 `same-fact`、`new-fact-in-story`、`kept` 和 `new-story` 多种判定确实存在；模型对 `SAME_OCCURRENCE` 的判断与最终 Fact 归属也并非总相同（中间还有独立复审及人工状态）。**这证明需要区分召回、判定、复审和最终写入，不能根据最终数量倒推原因。**

## 面向未来新报道的最小调整

**仅澄清现有的共享事实关系定义 `industry/prompts/group-definitions.md`**：

- 同一份名单或同一批提交被多家媒体复述，即使报道日期不同，也应判断 `SAME_OCCURRENCE`。
- 若新增另一批主体使累计数 9→16→22，属于新发展（`SAME_STORY`），**不是旧名单的同一发生**。
- 涉及原告/发行方的不同公告、不同实际行动和平台方回应，仍需单独认定；**总数量不是身份键**。
- batch 和 pair 的既有提示词都通过 `{{> group-definitions}}` 复用此处；不新建模型服务、不增加数据库表或手写数字规则。

这是一项提示词级别的**可检验假设**，不是已测得的精度提高。现有 `tests/grouping-phase-prompts.standalone.test.ts` 只保护提示词共享语义不会被删；它**不是**在线模型判定准确率测试。

## 下一步独立验证（本次不做历史重算）

从今后的新报道中抽至少六组真实、出处可核对的配对，覆盖：
1. 同一份公告的多语言/跨媒体重复；
2. 相同数字但不同公告或参与方；
3. 9→16→22 这种名单的真实新增；
4. 当事方回应、独立监管决定；
5. 综述多事件的 roundup；
6. 完全不相关但实体词高度重合的报道。

复用已有 `scripts/eval-relations.ts` / `scripts/eval-relations-core.ts`，使用已人工确认的 gold 和实际模型输出评估 `SAME_OCCURRENCE` 的误并、漏并，记录 pair/batch 差异和候选召回命中率。样本、模型及结果未得到实际运行前，不宣布成功；更不修改历史 Fact 或现有的 11 个节点。

**验收边界**：首页、/hot、Story 阅读页、原文链接与 /explore、公开 API 和发布/SEO 都不改变。所有回归应走 feature PR → develop → CI/Claude Review → VM13，不自动发生产。
